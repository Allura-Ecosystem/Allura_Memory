import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => ({ id: "app-pool" })) }));
vi.mock("@/lib/device-pairing/rotation-service", () => ({
  RotationError: class RotationError extends Error { constructor(public code: string, message: string) { super(message); } },
  activateRotation: vi.fn(async () => ({ status: "ACTIVATED", key_generation: 5, rotation_receipt: { receipt_id: "rot-1" } })),
}));
import { POST } from "@/app/api/device-pairing/rotation/activate/route";
import { activateRotation, RotationError } from "@/lib/device-pairing/rotation-service";

const headers = { "content-digest": "sha-256=:ZmFrZQ==:", "x-allura-purpose": "rotation_activate", "x-allura-audience": "https://device-auth.example.test", "x-allura-nonce": "nonce", "x-allura-proof-id": "challenge-1", "x-allura-device-id": "dev-1", "x-allura-key-generation": "4", "signature-input": "sig1=(\"@method\");created=1;expires=2;keyid=\"key-next\";alg=\"ecdsa-p256\"", signature: "sig1=:ZmFrZQ==:" };

describe("Story 29.13 rotation activate route", () => {
  it("passes receipt-bound signed input and maps NO_PENDING_KEY to conflict", async () => {
    const makeRequest = () => new Request("https://app.example.test/api/device-pairing/rotation/activate", {
      method: "POST",
      headers,
      body: JSON.stringify({ device_id: "dev-1", receipt_id: "rot-1", idempotency_key: "stage-idempotency", forged_group_id: "other" }),
    });
    expect((await POST(makeRequest())).status).toBe(200);
    expect(activateRotation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ device_id: "dev-1", receipt_id: "rot-1", idempotency_key: "stage-idempotency" }));
    vi.mocked(activateRotation).mockRejectedValueOnce(new RotationError("NO_PENDING_KEY", "none"));
    expect((await POST(makeRequest())).status).toBe(409);
  });
});
