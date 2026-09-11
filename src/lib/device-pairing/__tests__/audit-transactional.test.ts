import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/queries/insert-trace", () => ({
  insertEventWithClient: vi.fn(async () => ({ id: 1 })),
}));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { insertEventWithClient } from "@/lib/postgres/queries/insert-trace";

const POSTHUMAN = {
  group_id: "allura-audit-test",
  workspace_id: "ws-audit-test",
  agent_id: "principal-audit-test",
} as const;

const PREHUMAN = {
  group_id: "allura-system",
  agent_id: "device-enrollment",
} as const;

const EVENT_CASES = [
  ["DEVICE_ENROLL_REQUESTED", PREHUMAN, { enrollment_transaction_id: "enroll_1", device_label: "MacBook", key_fingerprint: "a".repeat(16), callback_type: "deep_link", key_algorithm: "ecdsa-p256" }],
  ["DEVICE_ENROLL_APPROVED", POSTHUMAN, { enrollment_transaction_id: "enroll_1", principal_id: "principal-audit-test", group_id: "allura-audit-test", workspace_id: "ws-audit-test", key_fingerprint: "a".repeat(16), auth_method: "clerk" }],
  ["DEVICE_ENROLL_DENIED", PREHUMAN, { enrollment_transaction_id: "enroll_1", reason_code: "STATE_MISMATCH" }],
  ["DEVICE_ENROLL_EXPIRED", PREHUMAN, { enrollment_transaction_id: "enroll_1", reason_code: "CODE_EXPIRED" }],
  ["DEVICE_PAIRING_COMPLETE", POSTHUMAN, { enrollment_transaction_id: "enroll_1", paired_device_id: "dev_1" }],
  ["DEVICE_CHALLENGE_ISSUED", POSTHUMAN, { challenge_id: "challenge_1", device_id: "dev_1", purpose: "exchange" }],
  ["DEVICE_EXCHANGE_ALLOWED", POSTHUMAN, { challenge_id: "challenge_1", device_id: "dev_1" }],
  ["DEVICE_EXCHANGE_DENIED", { ...PREHUMAN, status: "failed" as const }, { device_id: "dev_1", reason_code: "DEVICE_NOT_APPROVED" }],
  ["DEVICE_ROTATION_STAGED", POSTHUMAN, { device_id: "dev_1", challenge_id: "challenge_1", new_key_id: "kid_next", receipt_id: "rot_1" }],
  ["DEVICE_ROTATION_ACTIVATED", POSTHUMAN, { device_id: "dev_1", challenge_id: "challenge_1", receipt_id: "rot_1", old_key_id: "kid_old", new_key_id: "kid_next", key_generation: 2, grace_expires_at: "2026-09-11T00:00:00.000Z" }],
  ["DEVICE_ROTATION_RECOVERED", POSTHUMAN, { device_id: "dev_1", challenge_id: "challenge_1", receipt_id: "rot_1", recovery: true, via: "grace" }],
  ["DEVICE_REVOKED", POSTHUMAN, { device_id: "dev_1", action: "revoke" }],
  ["DEVICE_MARKED_LOST", POSTHUMAN, { device_id: "dev_1", action: "mark_lost" }],
] as const;

describe("Story 29.16 — transactional device audit event gate", () => {
  it.each(EVENT_CASES)("accepts the safe %s family on the caller transaction", async (event_type, identity, metadata) => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(insertEventWithClient).mockClear();

    await expect(emitDeviceAudit(client as never, {
      ...identity,
      event_type,
      metadata,
    })).resolves.toBeUndefined();

    if ("workspace_id" in identity) {
      expect(insertEventWithClient).toHaveBeenCalledWith(client, expect.objectContaining({ event_type }));
    } else {
      expect(client.query).toHaveBeenCalled();
    }
  });

  it("rejects an unknown DEVICE event before it reaches the transaction client", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };

    await expect(emitDeviceAudit(client as never, {
      ...PREHUMAN,
      event_type: "DEVICE_RECOVERED_AS_NEW_PAIRING" as never,
      metadata: { device_id: "dev_1" },
    })).rejects.toThrow(/unsupported device audit event/i);

    expect(client.query).not.toHaveBeenCalled();
  });

  it("delegates a post-approval insert to the canonical client-bound event writer", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(insertEventWithClient).mockClear();

    await emitDeviceAudit(client as never, {
      ...POSTHUMAN,
      event_type: "DEVICE_PAIRING_COMPLETE",
      metadata: { enrollment_transaction_id: "enroll_1", paired_device_id: "dev_1" },
    });

    expect(insertEventWithClient).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: POSTHUMAN.group_id,
      workspace_id: POSTHUMAN.workspace_id,
      event_type: "DEVICE_PAIRING_COMPLETE",
      agent_id: POSTHUMAN.agent_id,
      status: "completed",
    }));
    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    ["pre-human identity has a resolved workspace", { ...PREHUMAN, workspace_id: "ws_should_not_exist" }, "DEVICE_ENROLL_REQUESTED", { enrollment_transaction_id: "enroll_1", device_label: "MacBook", key_fingerprint: "a".repeat(16), callback_type: "deep_link", key_algorithm: "ecdsa-p256" }],
    ["post-approval identity is missing a workspace", { group_id: "allura-audit-test", agent_id: "principal-audit-test" }, "DEVICE_PAIRING_COMPLETE", { enrollment_transaction_id: "enroll_1", paired_device_id: "dev_1" }],
    ["completed event uses a non-terminal status", { ...POSTHUMAN, status: "pending" as never }, "DEVICE_PAIRING_COMPLETE", { enrollment_transaction_id: "enroll_1", paired_device_id: "dev_1" }],
    ["safe count is not a bounded integer", PREHUMAN, "DEVICE_ENROLL_DENIED", { enrollment_transaction_id: "enroll_1", reason_code: "DEVICE_LIMIT_EXCEEDED", current_count: "5" }],
  ] as const)("rejects when %s", async (_label, identity, event_type, metadata) => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };

    await expect(emitDeviceAudit(client as never, {
      ...identity,
      event_type,
      metadata,
    })).rejects.toThrow(/(identity|workspace|status|count|pre-human|post-approval|invalid)/i);

    expect(client.query).not.toHaveBeenCalled();
  });
});
