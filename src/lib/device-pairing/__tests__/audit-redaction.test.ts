import { describe, expect, it, vi } from "vitest";

import { emitDeviceAudit } from "@/lib/device-pairing/audit";

const POSTHUMAN = {
  group_id: "allura-audit-redaction",
  workspace_id: "ws-audit-redaction",
  agent_id: "principal-audit-redaction",
} as const;

function client() {
  return { query: vi.fn(async () => ({ rows: [] })) };
}

describe("Story 29.16 — device audit metadata redaction", () => {
  it.each([
    ["nested raw token", { enrollment_transaction_id: "enroll_1", paired_device_id: "dev_1", extra: { access_token: "Bearer secret" } }],
    ["array proof material", { enrollment_transaction_id: "enroll_1", paired_device_id: ["dev_1", "raw-signature"] }],
    ["unknown metadata key", { enrollment_transaction_id: "enroll_1", paired_device_id: "dev_1", raw_nonce: "secret" }],
    ["private key material", { enrollment_transaction_id: "enroll_1", paired_device_id: "-----BEGIN PRIVATE KEY-----\nsecret" }],
  ])("rejects %s before SQL", async (_label, metadata) => {
    const tx = client();

    await expect(emitDeviceAudit(tx as never, {
      ...POSTHUMAN,
      event_type: "DEVICE_PAIRING_COMPLETE",
      metadata,
    })).rejects.toThrow(/(allowlisted|forbidden|scalar|invalid)/i);

    expect(tx.query).not.toHaveBeenCalled();
  });

  it("keeps an allowed flat safe payload intact", async () => {
    const tx = client();
    const metadata = { device_id: "dev_1", challenge_id: "challenge_1", receipt_id: "rot_1", recovery: true, via: "grace" };

    await expect(emitDeviceAudit(tx as never, {
      ...POSTHUMAN,
      event_type: "DEVICE_ROTATION_RECOVERED",
      metadata,
    })).resolves.toBeUndefined();

    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO events"), expect.arrayContaining([JSON.stringify(metadata)]));
  });
});
