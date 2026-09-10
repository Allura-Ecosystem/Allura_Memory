import type { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { emitDeviceAudit } from "./audit";
import { getDeviceAuthAudience } from "./config";
import type { KeyAlgorithm } from "./rfc9421-types";
import { isStoredActivatedReceipt } from "./rotation-service";

const PREHUMAN_GROUP_ID = "allura-system";
const PREHUMAN_AGENT_ID = "device-enrollment";

export type ChallengePurpose =
  | "exchange"
  | "rotation_stage"
  | "rotation_activate"
  | "recovery_status";

export interface ChallengeInput {
  device_id: string;
  purpose: ChallengePurpose;
}

export type ChallengeErrorCode = "DEVICE_NOT_APPROVED" | "PURPOSE_NOT_AVAILABLE";

export class ChallengeError extends Error {
  constructor(
    public readonly code: ChallengeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChallengeError";
  }
}

export interface ChallengeResult {
  challenge_id: string;
  nonce: string;
  audience: string;
  purpose: ChallengePurpose;
  server_context: {
    device_id: string;
    key_generation: number;
    server_time: string;
  };
  expires_at: string;
}

/**
 * Issue a possession challenge for an already-authorized paired device.
 *
 * This first service slice deliberately establishes the authority bootstrap
 * boundary: the client supplies only a device id; resolve_device_route() is
 * the sole source of tenant authority. An unresolved id is auditable but
 * must never reach the tenant-scoped challenge table.
 */
export async function issueChallenge(
  pool: Pool,
  input: ChallengeInput,
): Promise<ChallengeResult> {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const route = await client.query<{ group_id: string | null }>(
      "SELECT resolve_device_route($1) AS group_id",
      [input.device_id],
    );
    const groupId = route.rows[0]?.group_id;
    if (groupId == null) {
      await emitDeviceAudit(client, {
        group_id: PREHUMAN_GROUP_ID,
        workspace_id: null,
        event_type: "DEVICE_EXCHANGE_DENIED",
        agent_id: PREHUMAN_AGENT_ID,
        metadata: {
          device_id: input.device_id,
          reason_code: "DEVICE_NOT_APPROVED",
        },
        status: "failed",
      });
      await client.query("COMMIT");
      committed = true;
      throw new ChallengeError("DEVICE_NOT_APPROVED", "Device is not approved");
    }

    await client.query("SELECT set_config('app.current_group_id', $1, true)", [groupId]);
    const device = await client.query<{
      id: string;
      principal_id: string;
      workspace_id: string;
      lifecycle_state: string;
      key_generation: number;
      current_public_key: string;
      current_key_id: string;
      current_key_algo: KeyAlgorithm;
      rotation_grace_expires_at: string | Date | null;
      rotation_receipt: unknown;
      pending_next_public_key: string | null;
    }>(
      `SELECT id, principal_id, workspace_id, lifecycle_state, key_generation,
              current_public_key, current_key_id, current_key_algo, rotation_grace_expires_at, rotation_receipt,
              pending_next_public_key
         FROM paired_devices
        WHERE id = $1
        FOR UPDATE`,
      [input.device_id],
    );
    const pairedDevice = device.rows[0];
    if (pairedDevice == null || pairedDevice.lifecycle_state !== "APPROVED") {
      throw new ChallengeError("DEVICE_NOT_APPROVED", "Device is not approved");
    }

    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [pairedDevice.workspace_id]);
    await client.query("SELECT set_config('app.current_principal', $1, true)", [pairedDevice.principal_id]);

    let authenticatedGeneration = pairedDevice.key_generation;
    if (input.purpose === "recovery_status") {
      if (!isStoredActivatedReceipt(pairedDevice.rotation_receipt, pairedDevice)) {
        throw new ChallengeError("PURPOSE_NOT_AVAILABLE", "Recovery is not available for this device");
      }
      const receiptExpiry = new Date(pairedDevice.rotation_receipt.grace_expires_at).getTime();
      const storedExpiry = pairedDevice.rotation_grace_expires_at === null
        ? Number.NaN
        : new Date(pairedDevice.rotation_grace_expires_at).getTime();
      if (pairedDevice.key_generation <= 1 || !Number.isFinite(storedExpiry) || storedExpiry <= Date.now() || storedExpiry !== receiptExpiry) {
        throw new ChallengeError("PURPOSE_NOT_AVAILABLE", "Recovery is not available for this device");
      }
      authenticatedGeneration = pairedDevice.key_generation - 1;
    }

    const nonce = randomBytes(32).toString("base64url");
    const audience = getDeviceAuthAudience();
    const serverContext = {
      device_id: pairedDevice.id,
      key_generation: authenticatedGeneration,
      server_time: new Date().toISOString(),
    };
    const challenge = await client.query<{ id: string; expires_at: string }>(
      `INSERT INTO device_challenges
        (id, group_id, paired_device_id, nonce, audience, purpose, server_context, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW() + INTERVAL '60 seconds')
       RETURNING id, expires_at`,
      [
        randomUUID(),
        groupId,
        pairedDevice.id,
        nonce,
        audience,
        input.purpose,
        JSON.stringify(serverContext),
      ],
    );
    const issued = challenge.rows[0];
    if (issued == null) throw new Error("Challenge insertion did not return a row");
    await emitDeviceAudit(client, {
      group_id: groupId,
      workspace_id: pairedDevice.workspace_id,
      event_type: "DEVICE_CHALLENGE_ISSUED",
      agent_id: pairedDevice.principal_id,
      metadata: { challenge_id: issued.id, device_id: pairedDevice.id, purpose: input.purpose },
    });
    await client.query("COMMIT");
    committed = true;
    return {
      challenge_id: issued.id,
      nonce,
      audience,
      purpose: input.purpose,
      server_context: serverContext,
      expires_at: issued.expires_at,
    };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
