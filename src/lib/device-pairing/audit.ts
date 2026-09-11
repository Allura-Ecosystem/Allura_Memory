import type { PoolClient } from "pg";

import { insertEventWithClient } from "@/lib/postgres/queries/insert-trace";

/** The complete and only device lifecycle audit vocabulary for Story 29.16. */
export const DEVICE_AUDIT_EVENT_TYPES = [
  "DEVICE_ENROLL_REQUESTED",
  "DEVICE_ENROLL_APPROVED",
  "DEVICE_ENROLL_DENIED",
  "DEVICE_ENROLL_EXPIRED",
  "DEVICE_PAIRING_COMPLETE",
  "DEVICE_CHALLENGE_ISSUED",
  "DEVICE_EXCHANGE_ALLOWED",
  "DEVICE_EXCHANGE_DENIED",
  "DEVICE_ROTATION_STAGED",
  "DEVICE_ROTATION_ACTIVATED",
  "DEVICE_ROTATION_RECOVERED",
  "DEVICE_REVOKED",
  "DEVICE_MARKED_LOST",
] as const;

export type DeviceAuditEventType = (typeof DEVICE_AUDIT_EVENT_TYPES)[number];
export type DeviceAuditStatus = "completed" | "failed";

interface DeviceAuditIdentity {
  group_id: string;
  workspace_id?: string | null;
  agent_id: string;
  status?: DeviceAuditStatus;
}

/** Compile-time discriminator; runtime validation is still required at the boundary. */
export type DeviceAuditInsert = DeviceAuditIdentity & {
  [Event in DeviceAuditEventType]: {
    event_type: Event;
    metadata: Record<string, unknown>;
  }
}[DeviceAuditEventType];

const METADATA_KEYS: Record<DeviceAuditEventType, readonly string[]> = {
  DEVICE_ENROLL_REQUESTED: ["enrollment_transaction_id", "device_label", "key_fingerprint", "callback_type", "key_algorithm"],
  DEVICE_ENROLL_APPROVED: ["enrollment_transaction_id", "principal_id", "group_id", "workspace_id", "key_fingerprint", "auth_method"],
  DEVICE_ENROLL_DENIED: ["enrollment_transaction_id", "device_id", "reason_code", "principal_id", "group_id", "workspace_id", "callback_type", "returned_state", "current_count", "limit"],
  DEVICE_ENROLL_EXPIRED: ["enrollment_transaction_id", "reason_code"],
  DEVICE_PAIRING_COMPLETE: ["enrollment_transaction_id", "paired_device_id"],
  DEVICE_CHALLENGE_ISSUED: ["challenge_id", "device_id", "purpose"],
  DEVICE_EXCHANGE_ALLOWED: ["challenge_id", "device_id"],
  DEVICE_EXCHANGE_DENIED: ["challenge_id", "device_id", "reason_code"],
  DEVICE_ROTATION_STAGED: ["device_id", "challenge_id", "new_key_id", "receipt_id"],
  DEVICE_ROTATION_ACTIVATED: ["device_id", "challenge_id", "receipt_id", "old_key_id", "new_key_id", "key_generation", "grace_expires_at"],
  DEVICE_ROTATION_RECOVERED: ["device_id", "challenge_id", "receipt_id", "recovery", "via"],
  DEVICE_REVOKED: ["device_id", "action"],
  DEVICE_MARKED_LOST: ["device_id", "action"],
};
const FORBIDDEN_METADATA_KEY = /(private.?key|\b(mcp|access|bearer|clerk)?_?token\b|cookie|credential|pkce.*verifier|authorization.*code|raw.*(nonce|challenge|signature|proof)|rotation.*secret|next.*private)/i;
const FORBIDDEN_METADATA_VALUE = /(-----BEGIN (?:RSA )?PRIVATE KEY-----|\bbearer\s+|\ballura_mcp_|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.|pkce[_ -]?verifier|authorization[_ -]?code|rotation[_ -]?secret)/i;

const PREHUMAN_EVENTS = new Set<DeviceAuditEventType>([
  "DEVICE_ENROLL_REQUESTED",
  "DEVICE_ENROLL_DENIED",
  "DEVICE_ENROLL_EXPIRED",
  "DEVICE_EXCHANGE_DENIED",
]);

function isDeviceAuditEventType(value: string): value is DeviceAuditEventType {
  return (DEVICE_AUDIT_EVENT_TYPES as readonly string[]).includes(value);
}

function validateMetadata(eventType: DeviceAuditEventType, metadata: Record<string, unknown>): void {
  const allowed = METADATA_KEYS[eventType];
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEY.test(key)) throw new Error(`Device audit metadata ${key} is forbidden`);
    if (!allowed.includes(key)) throw new Error(`Device audit metadata ${key} is not allowlisted for ${eventType}`);
    if (value === null || Array.isArray(value) || typeof value === "object" || typeof value === "undefined") {
      throw new Error(`Device audit metadata ${key} must be a scalar`);
    }
    if (["current_count", "limit", "key_generation"].includes(key)) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
        throw new Error(`Invalid device audit ${key}`);
      }
      continue;
    }
    if (typeof value === "string" && FORBIDDEN_METADATA_VALUE.test(value)) {
      throw new Error(`Device audit metadata ${key} contains forbidden credential material`);
    }
  }
}

/**
 * Emit a device lifecycle audit inside the caller-supplied transaction. This
 * function never opens a pool or swallows a failure, so audit rejection rolls
 * the owner transaction back.
 */
export async function emitDeviceAudit(client: PoolClient, insert: DeviceAuditInsert): Promise<void> {
  if (!isDeviceAuditEventType(insert.event_type)) throw new Error("Unsupported device audit event");
  if (insert.status !== undefined && insert.status !== "completed" && insert.status !== "failed") {
    throw new Error("Invalid device audit status");
  }
  if (insert.workspace_id == null) {
    if (!PREHUMAN_EVENTS.has(insert.event_type) || insert.group_id !== "allura-system" || insert.agent_id !== "device-enrollment") {
      throw new Error("Pre-human device audit requires allura-system/device-enrollment identity");
    }
  } else if (insert.group_id === "allura-system" || insert.agent_id === "device-enrollment" || insert.workspace_id.length === 0) {
    throw new Error("Post-approval device audit requires resolved tenant/workspace/principal identity");
  }
  validateMetadata(insert.event_type, insert.metadata);
  if (insert.workspace_id == null) {
    if (insert.event_type === "DEVICE_EXCHANGE_DENIED") {
      if (insert.status !== "failed") throw new Error("DEVICE_EXCHANGE_DENIED audit status must be failed");
      await client.query("SELECT device_exchange_denial_audit($1::jsonb)", [JSON.stringify(insert.metadata)]);
      return;
    }
    await client.query("SELECT device_enrollment_pre_human_audit($1, $2::jsonb)", [insert.event_type, JSON.stringify(insert.metadata)]);
    return;
  }
  await insertEventWithClient(client, {
    group_id: insert.group_id,
    workspace_id: insert.workspace_id,
    event_type: insert.event_type,
    agent_id: insert.agent_id,
    metadata: insert.metadata,
    status: insert.status ?? "completed",
  });
}
