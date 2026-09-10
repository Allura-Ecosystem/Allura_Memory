import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => ({ id: "app-pool" })) }));
vi.mock("@/lib/device-pairing/rotation-service", () => ({
  RotationError: class RotationError extends Error { constructor(public code: string, message: string) { super(message); } },
  recoverViaGrace: vi.fn(async () => ({ status: "RECOVERED", rotation_receipt: { receipt_id: "rot-1" } })),
}));

import { POST } from "@/app/api/device-pairing/recovery/route";
import { recoverViaGrace, RotationError } from "@/lib/device-pairing/rotation-service";

const headers = {
  "content-digest": "sha-256=:ZmFrZQ==:", "x-allura-purpose": "recovery_status",
  "x-allura-audience": "https://device-auth.example.test", "x-allura-nonce": "nonce",
  "x-allura-proof-id": "challenge-1", "x-allura-device-id": "dev-1", "x-allura-key-generation": "4",
  "signature-input": "sig1=(\"@method\");created=1;expires=2;keyid=\"key-old\";alg=\"ecdsa-p256\"",
  signature: "sig1=:ZmFrZQ==:",
};

describe("Story 29.14 recovery route", () => {
  it("passes raw strict device_id and receipt_id bytes into the recovery proof service", async () => {
    const raw = '{"device_id":"dev-1","receipt_id":"rot-1"}';
    const response = await POST(new Request("https://app.example.test/api/device-pairing/recovery", { method: "POST", headers, body: raw }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "RECOVERED", rotation_receipt: { receipt_id: "rot-1" } });
    expect(recoverViaGrace).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      device_id: "dev-1", receipt_id: "rot-1", request_target: "/api/device-pairing/recovery",
      request_body: new TextEncoder().encode(raw),
    }));
    expect(await POST(new Request("https://app.example.test/api/device-pairing/recovery", {
      method: "POST", headers, body: '{"device_id":"dev-1"}',
    }))).toMatchObject({ status: 400 });
  });

  it("maps expired grace and exhausted recovery limit without exposing credentials", async () => {
    vi.mocked(recoverViaGrace).mockRejectedValueOnce(new RotationError("KEY_EXPIRED", "expired"));
    const expired = await POST(new Request("https://app.example.test/api/device-pairing/recovery", { method: "POST", headers, body: '{"device_id":"dev-1","receipt_id":"rot-1"}' }));
    expect(expired.status).toBe(403);
    expect(await expired.json()).toEqual({ error: "KEY_EXPIRED", message: "expired" });

    vi.mocked(recoverViaGrace).mockRejectedValueOnce(new RotationError("GRACE_LIMIT_EXCEEDED", "limit"));
    const limit = await POST(new Request("https://app.example.test/api/device-pairing/recovery", { method: "POST", headers, body: '{"device_id":"dev-1","receipt_id":"rot-1"}' }));
    expect(limit.status).toBe(429);
    expect(await limit.json()).toEqual({ error: "GRACE_LIMIT_EXCEEDED", message: "limit" });
  });
});
