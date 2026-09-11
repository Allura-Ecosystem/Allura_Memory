import type { Pool } from "pg";
import { getAuthConfig } from "@/lib/auth/config";
import { createDeviceToken } from "@/lib/mcp-token/repository";
import type { LockMode } from "@allura/types";
import { emitDeviceAudit } from "./audit";
import { getDeviceAuthAudience, getDeviceAuthOrigin } from "./config";
import { DevicePairingErrorCode } from "./error-codes";
import { hasExactCoveredComponents, parseSignatureInput, verifyDeviceSignature } from "./rfc9421";
import type { KeyAlgorithm, SignatureParams } from "./rfc9421-types";

export type ExchangeErrorCode =
  | DevicePairingErrorCode.AUTH_EXPIRED
  | DevicePairingErrorCode.AUTH_INVALID
  | DevicePairingErrorCode.KEY_EXPIRED
  | DevicePairingErrorCode.MEMBERSHIP_INACTIVE
  | DevicePairingErrorCode.WORKSPACE_LOCKED
  | DevicePairingErrorCode.WORKSPACE_NOT_FOUND
  | DevicePairingErrorCode.DEVICE_NOT_APPROVED;

export class ExchangeError extends Error {
  constructor(public readonly code: ExchangeErrorCode, message: string) {
    super(message);
    this.name = "ExchangeError";
  }
}

export interface ExchangeTokenInput {
  device_id: string;
  challenge_id: string;
  request_target: string;
  request_body: Uint8Array;
  headers: {
    content_digest: string;
    purpose: string;
    audience: string;
    nonce: string;
    proof_id: string;
    signature_input: string;
    signature: string;
  };
}

export interface ExchangeTokenResult {
  access_token: string;
  expires_at: string;
  mcp_endpoint: string;
}

const requiredExchangeComponents = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
] as const;

export function isValidExchangeSignatureEnvelope(
  signatureParams: Pick<SignatureParams, "coveredComponents" | "created" | "expires">,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return hasExactCoveredComponents(signatureParams.coveredComponents, requiredExchangeComponents) &&
    Number.isFinite(signatureParams.created) && Number.isFinite(signatureParams.expires) &&
    signatureParams.created <= nowSeconds && signatureParams.expires > nowSeconds &&
    signatureParams.expires >= signatureParams.created;
}

function resolveMcpEndpoint(): string {
  const base = new URL(getAuthConfig().ALLURA_MCP_BASE_URL);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("MCP gateway URL must use HTTP(S)");
  }
  return new URL("/mcp", base).toString();
}

export async function exchangeToken(pool: Pool, input: ExchangeTokenInput): Promise<ExchangeTokenResult> {
  const mcpEndpoint = resolveMcpEndpoint();
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const route = await client.query<{ group_id: string | null }>(
      "SELECT resolve_device_route($1) AS group_id",
      [input.device_id],
    );
    const groupId = route.rows[0]?.group_id;
    if (!groupId) throw new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "Exchange proof is invalid");
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [groupId]);
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [groupId]);

    const device = await client.query<{
      id: string;
      group_id: string;
      workspace_id: string;
      principal_id: string;
      current_public_key: string;
      current_key_id: string;
      current_key_algo: KeyAlgorithm;
      lifecycle_state: string;
    }>(
      `SELECT id, group_id, workspace_id, principal_id, current_public_key, current_key_id, current_key_algo, lifecycle_state
         FROM paired_devices WHERE id = $1 FOR UPDATE`,
      [input.device_id],
    );
    const pairedDevice = device.rows[0];
    if (!pairedDevice) {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "Exchange proof is invalid");
    }
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [pairedDevice.workspace_id]);
    await client.query("SELECT set_config('app.current_principal', $1, true)", [pairedDevice.principal_id]);

    const challenge = await client.query<{
      id: string;
      nonce: string;
      audience: string;
      purpose: string;
      expires_at: string;
    }>(
      `SELECT id, nonce, audience, purpose, expires_at
         FROM device_challenges
        WHERE id = $1 AND paired_device_id = $2
        FOR UPDATE`,
      [input.challenge_id, pairedDevice.id],
    );
    const issuedChallenge = challenge.rows[0];
    if (!issuedChallenge || issuedChallenge.purpose !== "exchange" ||
      new Date(issuedChallenge.expires_at).getTime() <= Date.now()) {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_EXPIRED, "Challenge is expired or unavailable");
    }

    let signatureParams;
    try {
      signatureParams = parseSignatureInput(input.headers.signature_input);
    } catch {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "RFC 9421 signature input is invalid");
    }
    if (!isValidExchangeSignatureEnvelope(signatureParams)) {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "RFC 9421 exchange proof has invalid coverage or validity window");
    }
    if (input.headers.purpose !== "exchange" ||
      input.headers.proof_id !== issuedChallenge.id ||
      input.headers.nonce !== issuedChallenge.nonce ||
      input.headers.audience !== issuedChallenge.audience) {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "RFC 9421 exchange proof is invalid");
    }
    if (signatureParams.keyid !== pairedDevice.current_key_id) {
      throw new ExchangeError(DevicePairingErrorCode.KEY_EXPIRED, "Device key is no longer current");
    }
    const proof = verifyDeviceSignature({
      method: "POST",
      requestTarget: input.request_target,
      body: input.request_body,
      contentDigestHeader: input.headers.content_digest,
      purpose: input.headers.purpose as "exchange",
      audience: input.headers.audience,
      nonce: input.headers.nonce,
      proofId: input.headers.proof_id,
      signatureInputHeader: input.headers.signature_input,
      signatureHeader: input.headers.signature,
      publicKey: pairedDevice.current_public_key,
      keyAlgorithm: pairedDevice.current_key_algo,
      signatureParams,
    }, getDeviceAuthOrigin(), getDeviceAuthAudience());
    if (!proof.valid || proof.purpose !== "exchange") {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "RFC 9421 exchange proof is invalid");
    }
    if (pairedDevice.lifecycle_state !== "APPROVED") {
      throw new ExchangeError(DevicePairingErrorCode.DEVICE_NOT_APPROVED, "Device is not approved");
    }

    const membership = await client.query<{ role: string }>(
      "SELECT role FROM memberships WHERE group_id = $1 AND user_id = $2 AND removed_at IS NULL FOR UPDATE",
      [groupId, pairedDevice.principal_id],
    );
    if (!membership.rows[0]) {
      await client.query(
        "UPDATE mcp_tokens SET revoked_at = NOW() WHERE paired_device_id = $1 AND revoked_at IS NULL",
        [pairedDevice.id],
      );
      await emitDeviceAudit(client, {
        group_id: groupId,
        workspace_id: pairedDevice.workspace_id,
        event_type: "DEVICE_EXCHANGE_DENIED",
        agent_id: pairedDevice.principal_id,
        metadata: {
          device_id: pairedDevice.id,
          challenge_id: issuedChallenge.id,
          reason_code: "MEMBERSHIP_INACTIVE",
        },
        status: "failed",
      });
      await client.query("COMMIT");
      committed = true;
      throw new ExchangeError(DevicePairingErrorCode.MEMBERSHIP_INACTIVE, "Membership is inactive");
    }
    const workspace = await client.query<{ lock_mode: LockMode }>(
      "SELECT lock_mode FROM workspaces WHERE workspace_id = $1 AND group_id = $2 FOR UPDATE",
      [pairedDevice.workspace_id, groupId],
    );
    if (!workspace.rows[0]) {
      await emitDeviceAudit(client, {
        group_id: groupId,
        workspace_id: pairedDevice.workspace_id,
        event_type: "DEVICE_EXCHANGE_DENIED",
        agent_id: pairedDevice.principal_id,
        metadata: {
          device_id: pairedDevice.id,
          challenge_id: issuedChallenge.id,
          reason_code: "WORKSPACE_NOT_FOUND",
        },
        status: "failed",
      });
      await client.query("COMMIT");
      committed = true;
      throw new ExchangeError(DevicePairingErrorCode.WORKSPACE_NOT_FOUND, "Workspace is unavailable");
    }
    if (workspace.rows[0].lock_mode === "full_lockdown") {
      await emitDeviceAudit(client, {
        group_id: groupId,
        workspace_id: pairedDevice.workspace_id,
        event_type: "DEVICE_EXCHANGE_DENIED",
        agent_id: pairedDevice.principal_id,
        metadata: {
          device_id: pairedDevice.id,
          challenge_id: issuedChallenge.id,
          reason_code: "WORKSPACE_LOCKED",
        },
        status: "failed",
      });
      await client.query("COMMIT");
      committed = true;
      throw new ExchangeError(DevicePairingErrorCode.WORKSPACE_LOCKED, "Workspace is locked");
    }

    await client.query(
      "UPDATE mcp_tokens SET revoked_at = NOW() WHERE paired_device_id = $1 AND revoked_at IS NULL",
      [pairedDevice.id],
    );
    const token = await createDeviceToken(client, {
      paired_device_id: pairedDevice.id,
      membership_role: membership.rows[0].role,
      lock_mode: workspace.rows[0].lock_mode,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (!token.record.expires_at) throw new Error("Device token must have an expiry");
    const consumed = await client.query<{ id: string }>(
      `UPDATE device_challenges
          SET consumed_at = NOW(), consumed_by_token_id = $2
        WHERE id = $1 AND consumed_at IS NULL
        RETURNING id`,
      [issuedChallenge.id, token.record.id],
    );
    if (!consumed.rows[0]) {
      throw new ExchangeError(DevicePairingErrorCode.AUTH_EXPIRED, "Challenge has already been consumed");
    }
    await client.query("UPDATE paired_devices SET last_exchange_at = NOW() WHERE id = $1", [pairedDevice.id]);
    await emitDeviceAudit(client, {
      group_id: groupId,
      workspace_id: pairedDevice.workspace_id,
      event_type: "DEVICE_EXCHANGE_ALLOWED",
      agent_id: pairedDevice.principal_id,
      metadata: { device_id: pairedDevice.id, challenge_id: issuedChallenge.id },
    });
    await client.query("COMMIT");
    committed = true;
    return { access_token: token.raw, expires_at: token.record.expires_at, mcp_endpoint: mcpEndpoint };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
