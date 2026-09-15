/**
 * Story 29.5 — Approval service.
 *
 * Architecture §4.2 (approval contract), §4.2c (device limit advisory lock),
 * §3.1 (device_enrollment_approve SECURITY DEFINER), §11.1 (post-approval
 * audit with approved tenant/principal), AD-65 (authorization code stored as
 * SHA-256 only), AD-63 (callback allowlist), HIGH-F4 (pg_advisory_xact_lock).
 *
 * Responsibilities:
 *  - Resolve the Clerk-authenticated AuthUser (server resolves authority;
 *    client never supplies tenant — AC-02, §4.2 step 1, §5.1).
 *  - Fetch the enrollment row (pre-approval state) to get callback_type,
 *    public_key, display_label, key_id, key_algo for audit + callback URL.
 *  - Resolve active membership (`memberships` where `removed_at IS NULL`).
 *    If none: 403 MEMBERSHIP_INACTIVE.
 *  - Resolve workspace and verify group_id matches.
 *  - Validate `callback_type` against the deployment allowlist (AD-63).
 *  - Acquire `pg_advisory_xact_lock` on the SHA-256-derived 64-bit key for
 *    `(group_id, workspace_id, principal_id)` (§4.2c, HIGH-F4).
 *  - Count APPROVED `paired_devices` rows; if >= limit: 409
 *    DEVICE_LIMIT_EXCEEDED.
 *  - Generate 256-bit authorization code (store SHA-256 hash only — AD-65,
 *    §4.2 step 10) + 32-byte completion nonce (bound to
 *    code/enrollment/PK, 60s TTL — §4.2 step 11).
 *  - Call `device_enrollment_approve()` SECURITY DEFINER (§3.1) to flip
 *    PENDING→APPROVED and populate all post-approval columns. The function
 *    returns 'APPROVED' | 'NOT_FOUND' | 'STATE_MISMATCH' | 'EXPIRED'.
 *  - Audit all outcomes transactionally with the approved tenant/principal
 *    (AR11 — post-approval events use approved_group_id/approved_principal_id,
 *    not allura-system).
 *
 * Non-goals (Story 29.5 scope):
 *  - No `/complete`, proof-of-possession, paired_devices row creation, or
 *    token mint (Story 29.6).
 *  - No migrations or live DB mutations.
 */
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AuthUser } from "@/lib/auth/types";
import { emitDeviceAudit } from "./audit";
import {
  getPairingCallbackAllowlist,
} from "./config";
import {
  acquireDeviceCountLock,
  countApprovedDevices,
  getDeviceLimit,
} from "./device-limit";
import {
  generateAuthorizationCode,
  hashAuthorizationCode,
  generateCompletionNonce,
} from "./authorization-code";

/** Completion nonce TTL: 60 seconds (§4.2 step 11, §8.2). */
const COMPLETION_NONCE_TTL_MS = 60_000;
/** Authorization code TTL: 60 seconds (§4.2 step 10, AD-65). */
const AUTHORIZATION_CODE_TTL_MS = 60_000;

/** Pre-human audit identity for pre-approval events (MED-F3, AR11). */
const PREHUMAN_GROUP_ID = "allura-system";
const PREHUMAN_AGENT_ID = "device-enrollment";

/** Approval input — resolved from Clerk identity + request body. */
export interface ApprovalInput {
  enrollment_transaction_id: string;
  pkce_state: string;
  authUser: AuthUser;
}

/** Successful approval result. */
export interface ApprovalResult {
  enrollment_transaction_id: string;
  status: "APPROVED";
  authorization_code: string;
  code_expires_at: string;
  completion_nonce: string;
  completion_nonce_expires_at: string;
  callback: {
    type: string;
    url: string;
  };
}

/** Error codes mapped to HTTP statuses (architecture §4.2 error codes). */
export type ApprovalErrorCode =
  | "ENROLLMENT_NOT_FOUND"
  | "ENROLLMENT_EXPIRED"
  | "STATE_MISMATCH"
  | "MEMBERSHIP_INACTIVE"
  | "WORKSPACE_NOT_FOUND"
  | "CALLBACK_TYPE_DISABLED"
  | "CALLBACK_URI_INVALID"
  | "DEVICE_LIMIT_EXCEEDED";

/** HTTP status for each approval error code. */
export const APPROVAL_ERROR_STATUS: Record<ApprovalErrorCode, number> = {
  ENROLLMENT_NOT_FOUND: 404,
  ENROLLMENT_EXPIRED: 410,
  STATE_MISMATCH: 400,
  MEMBERSHIP_INACTIVE: 403,
  WORKSPACE_NOT_FOUND: 403,
  CALLBACK_TYPE_DISABLED: 400,
  CALLBACK_URI_INVALID: 400,
  DEVICE_LIMIT_EXCEEDED: 409,
};

export class ApprovalError extends Error {
  constructor(
    public readonly code: ApprovalErrorCode,
    message: string,
    public readonly commitAudit = true,
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

/** Return type from device_enrollment_approve(). */
type ApproveFunctionStatus = "APPROVED" | "NOT_FOUND" | "STATE_MISMATCH" | "EXPIRED";

/** Safe pre-approval fields returned by the scoped SECURITY DEFINER function. */
interface EnrollmentApprovalContextRow {
  callback_type: string;
  callback_uri: string;
  public_key: string;
}

/** Compute a short SHA-256 fingerprint of the public key for audit (§11.1). */
function keyFingerprint(publicKey: string): string {
  return createHash("sha256").update(publicKey).digest("hex").slice(0, 16);
}

/**
 * Build the callback URL for the browser redirect (AD-63, §4.2 response).
 *
 * The URL contains `code`, `state`, `txn`, and `completion_nonce` — no
 * verifier, no device_id (the device id does not exist until `/complete`).
 */
export function buildCallbackUrl(
  callbackUri: string,
  params: {
    code: string;
    state: string;
    txn: string;
    completion_nonce: string;
  },
): string {
  const url = new URL(callbackUri);
  url.searchParams.set("code", params.code);
  url.searchParams.set("state", params.state);
  url.searchParams.set("txn", params.txn);
  url.searchParams.set("completion_nonce", params.completion_nonce);
  return url.toString();
}

/** Fail closed on the only persisted callback targets permitted by AD-63. */
function isValidPersistedCallbackUri(callbackType: string, callbackUri: unknown): callbackUri is string {
  if (typeof callbackUri !== "string") return false;
  if (callbackType === "deep_link") return callbackUri === "allura-pairing://complete";
  if (callbackType !== "loopback") return false;
  return /^http:\/\/127\.0\.0\.1:(?:4915[2-9]|491[6-9][0-9]|49[2-9][0-9]{2}|5[0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])\/callback$/.test(callbackUri);
}

/**
 * Orchestrate the approval transaction.
 *
 * All DB operations run inside a single BEGIN/COMMIT transaction on a
 * dedicated client. Audit is fail-closed: if the audit INSERT fails, the
 * transaction rolls back (§11.1, HIGH-F1).
 */
export async function approveEnrollment(
  pool: Pool,
  input: ApprovalInput,
  options?: { now?: () => Date },
): Promise<ApprovalResult> {
  const now = (options?.now ?? (() => new Date()))();
  const { authUser } = input;
  const principalId = authUser.id;
  const groupId = authUser.groupId;
  const workspaceId = authUser.workspaceId ?? "";

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    // This is a workspace-governed write. The route supplies the restricted
    // app-role pool; bind its RLS context transaction-locally before any
    // membership, workspace, device, or audit query executes.
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [groupId]);
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [groupId]);
    await client.query("SELECT set_config('app.current_principal', $1, true)", [principalId]);
    if (workspaceId) {
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    }

    // §3.1 / AD-61: direct `device_enrollments` privileges are revoked from
    // the application role. Read only the safe callback/audit context through
    // the scoped SECURITY DEFINER function; it also retains the row lock for
    // the subsequent atomic approval call in this transaction.
    const contextRes = await client.query<EnrollmentApprovalContextRow>(
      "SELECT * FROM device_enrollment_approval_context($1)",
      [input.enrollment_transaction_id],
    );

    if (contextRes.rows.length === 0) {
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "ENROLLMENT_NOT_FOUND",
        },
      });
      throw new ApprovalError("ENROLLMENT_NOT_FOUND", "Enrollment transaction not found");
    }

    const enrollment = contextRes.rows[0];

    // §4.2 step 5: Resolve active membership. Server resolves authority —
    // the client never supplies tenant (AC-02, §5.1).
    const membershipRes = await client.query(
      `SELECT id, group_id, user_id, role, removed_at
       FROM memberships
       WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [groupId, principalId],
    );
    if (membershipRes.rows.length === 0) {
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "MEMBERSHIP_INACTIVE",
          principal_id: principalId,
        },
      });
      throw new ApprovalError("MEMBERSHIP_INACTIVE", "No active membership for this tenant");
    }

    // §4.2 step 6: Resolve workspace and verify group_id matches.
    if (!workspaceId) {
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "WORKSPACE_NOT_FOUND",
          principal_id: principalId,
        },
      });
      throw new ApprovalError("WORKSPACE_NOT_FOUND", "Workspace not resolved from auth context");
    }
    const workspaceRes = await client.query(
      `SELECT workspace_id, group_id FROM workspaces WHERE workspace_id = $1`,
      [workspaceId],
    );
    if (
      workspaceRes.rows.length === 0 ||
      workspaceRes.rows[0].group_id !== groupId
    ) {
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "WORKSPACE_NOT_FOUND",
          principal_id: principalId,
        },
      });
      throw new ApprovalError("WORKSPACE_NOT_FOUND", "Workspace not found or group mismatch");
    }

    // §4.2 step 7: Validate callback_type against deployment allowlist (AD-63).
    const allowlist = getPairingCallbackAllowlist();
    if (!allowlist.includes(enrollment.callback_type)) {
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "CALLBACK_TYPE_DISABLED",
          callback_type: enrollment.callback_type,
        },
      });
      throw new ApprovalError(
        "CALLBACK_TYPE_DISABLED",
        `callback_type '${enrollment.callback_type}' is not enabled`,
      );
    }
    if (!isValidPersistedCallbackUri(enrollment.callback_type, enrollment.callback_uri)) {
      // System-integrity failure: do not approve or commit an invalid redirect.
      throw new ApprovalError(
        "CALLBACK_URI_INVALID",
        "Stored callback URI is invalid for its callback type",
        false,
      );
    }

    // §4.2 step 8: Device limit pre-check (advisory lock — §4.2c, HIGH-F4).
    await acquireDeviceCountLock(client, groupId, workspaceId, principalId);
    const deviceCount = await countApprovedDevices(client, groupId, workspaceId, principalId);
    const limit = getDeviceLimit();
    if (deviceCount >= limit) {
      await emitDeviceAudit(client, {
        group_id: groupId,
        workspace_id: workspaceId,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: principalId,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "DEVICE_LIMIT_EXCEEDED",
          principal_id: principalId,
          group_id: groupId,
          workspace_id: workspaceId,
          current_count: deviceCount,
          limit,
        },
      });
      throw new ApprovalError("DEVICE_LIMIT_EXCEEDED", `Device limit (${limit}) reached`);
    }

    // §4.2 step 10: Generate 256-bit authorization code (store SHA-256 only).
    const rawCode = generateAuthorizationCode();
    const codeHash = hashAuthorizationCode(rawCode);
    const codeExpiresAt = new Date(now.getTime() + AUTHORIZATION_CODE_TTL_MS);

    // §4.2 step 11: Generate completion nonce (32 bytes, 60s TTL).
    const completionNonce = generateCompletionNonce();
    const nonceExpiresAt = new Date(now.getTime() + COMPLETION_NONCE_TTL_MS);

    // Construct before state transition/commit so redirect construction cannot
    // strand an approved enrollment after a post-commit exception.
    const callbackUrl = buildCallbackUrl(enrollment.callback_uri, {
      code: rawCode,
      state: input.pkce_state,
      txn: input.enrollment_transaction_id,
      completion_nonce: completionNonce,
    });

    // §4.2 step 12: Call device_enrollment_approve() SECURITY DEFINER (§3.1).
    // The function row-locks, verifies state + expiry + pkce_state, then flips
    // PENDING→APPROVED with all post-approval columns.
    const approveRes = await client.query<{ device_enrollment_approve: ApproveFunctionStatus }>(
      `SELECT device_enrollment_approve($1, $2, $3, $4, $5, $6, $7, $8, $9) AS device_enrollment_approve`,
      [
        input.enrollment_transaction_id,
        input.pkce_state,
        principalId,
        groupId,
        workspaceId,
        codeHash,
        codeExpiresAt,
        completionNonce,
        nonceExpiresAt,
      ],
    );
    const status = approveRes.rows[0]?.device_enrollment_approve;

    if (status === "NOT_FOUND") {
      // The row was present at our SELECT but the function's FOR UPDATE found
      // it in a non-PENDING state, or it was consumed between our check and
      // the function call.
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "ENROLLMENT_NOT_FOUND",
        },
      });
      throw new ApprovalError("ENROLLMENT_NOT_FOUND", "Enrollment transaction not found");
    }

    if (status === "EXPIRED") {
      // §4.2 step 3: The function flips state to EXPIRED. Audit with
      // pre-human identity (MED-F3).
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_EXPIRED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
        },
      });
      throw new ApprovalError("ENROLLMENT_EXPIRED", "Enrollment transaction has expired");
    }

    if (status === "STATE_MISMATCH") {
      // §4.2 step 4: pkce_state does not match. Audit denied.
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "STATE_MISMATCH",
        },
      });
      throw new ApprovalError("STATE_MISMATCH", "PKCE state does not match");
    }

    if (status !== "APPROVED") {
      // The SECURITY DEFINER function returns a non-PENDING row's lifecycle
      // state. Never issue a fresh raw code/nonce unless it atomically flipped
      // the enrollment to APPROVED in this transaction.
      await emitDeviceAudit(client, {
        group_id: groupId,
        workspace_id: workspaceId,
        event_type: "DEVICE_ENROLL_DENIED",
        agent_id: principalId,
        metadata: {
          enrollment_transaction_id: input.enrollment_transaction_id,
          reason_code: "ENROLLMENT_NOT_PENDING",
          returned_state: status ?? "UNKNOWN",
        },
      });
      throw new ApprovalError("STATE_MISMATCH", "Enrollment is no longer pending approval");
    }

    // status === "APPROVED"
    // §4.2 step 13 / §11.1: Audit DEVICE_ENROLL_APPROVED with the approved
    // tenant/principal (AR11 — not allura-system).
    await emitDeviceAudit(client, {
      group_id: groupId,
      workspace_id: workspaceId,
      event_type: "DEVICE_ENROLL_APPROVED",
      agent_id: principalId,
      metadata: {
        enrollment_transaction_id: input.enrollment_transaction_id,
        principal_id: principalId,
        group_id: groupId,
        workspace_id: workspaceId,
        key_fingerprint: keyFingerprint(enrollment.public_key),
        auth_method: "clerk",
      },
    });

    await client.query("COMMIT");
    committed = true;

    return {
      enrollment_transaction_id: input.enrollment_transaction_id,
      status: "APPROVED",
      authorization_code: rawCode,
      code_expires_at: codeExpiresAt.toISOString(),
      completion_nonce: completionNonce,
      completion_nonce_expires_at: nonceExpiresAt.toISOString(),
      callback: {
        type: enrollment.callback_type,
        url: callbackUrl,
      },
    };
  } catch (error) {
    // Expected denials have already emitted an audit event. Commit that audit
    // (and an EXPIRED state transition, when applicable) before returning the
    // mapped HTTP outcome. Any unexpected error, including audit failure,
    // rolls back the entire transaction.
    if (!committed && error instanceof ApprovalError && error.commitAudit) {
      try {
        await client.query("COMMIT");
        committed = true;
      } catch (commitError) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The client is released regardless; preserve the commit failure.
        }
        throw commitError;
      }
    } else if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors — the client will be released regardless.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}