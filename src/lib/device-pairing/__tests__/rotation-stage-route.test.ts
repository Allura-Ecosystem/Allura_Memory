import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";


vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => ({ id: "app-pool" })) }));
vi.mock("@/lib/device-pairing/rotation-service", () => ({
  RotationError: class RotationError extends Error { constructor(public code: string, message: string) { super(message); } },
  stageRotation: vi.fn(async () => ({ receipt_id: "rot_1", rotation_receipt: { device_id: "dev-1", new_key_id: "key-next", issued_at: "2026-09-10T00:00:00.000Z", grace_expires_at: null, signature: "signed" } })),
}));

import { POST } from "@/app/api/device-pairing/rotation/stage/route";
import { RotationError, stageRotation } from "@/lib/device-pairing/rotation-service";

const VALID_PUBLIC_KEY = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const ED25519_PUBLIC_KEY = generateKeyPairSync("ed25519").publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

describe("Story 29.12 — rotation stage route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only validated signed rotation material to the transactional service", async () => {
    const request = new Request("https://app.allura.example.test/api/device-pairing/rotation/stage", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "rotation_stage", "x-allura-audience": "https://device-auth.example.test",
        "x-allura-nonce": "nonce", "x-allura-proof-id": "challenge-1", "x-allura-device-id": "dev-1",
        "x-allura-key-generation": "4", "signature-input": "sig1=(\"@method\");created=1;expires=2;keyid=\"key-current\";alg=\"ecdsa-p256\"", "signature": "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", new_public_key: VALID_PUBLIC_KEY, new_key_id: "key-next", new_key_algo: "ecdsa-p256", idempotency_key: "idem-1", forged_group_id: "allura-other" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ receipt_id: "rot_1" });
    expect(stageRotation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      device_id: "dev-1", new_key_id: "key-next", idempotency_key: "idem-1",
      headers: expect.objectContaining({ signature: "ZmFrZQ==" }),
    }));
    expect(stageRotation).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ forged_group_id: expect.anything() }));
  });

  it("rejects an invalid next public key before it reaches the transactional service", async () => {
    const request = new Request("https://app.allura.example.test/api/device-pairing/rotation/stage", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "rotation_stage", "x-allura-audience": "https://device-auth.example.test",
        "x-allura-nonce": "nonce", "x-allura-proof-id": "challenge-1", "x-allura-device-id": "dev-1",
        "x-allura-key-generation": "4", "signature-input": "sig1=(\"@method\");created=1;expires=2;keyid=\"key-current\";alg=\"ecdsa-p256\"", "signature": "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", new_public_key: "not-a-public-key", new_key_id: "key-next", new_key_algo: "ecdsa-p256", idempotency_key: "idem-1" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(stageRotation).not.toHaveBeenCalled();
  });

  it("rejects a public key that does not match its declared rotation algorithm", async () => {
    const request = new Request("https://app.allura.example.test/api/device-pairing/rotation/stage", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "rotation_stage", "x-allura-audience": "https://device-auth.example.test",
        "x-allura-nonce": "nonce", "x-allura-proof-id": "challenge-1", "x-allura-device-id": "dev-1",
        "x-allura-key-generation": "4", "signature-input": "sig1=(\"@method\");created=1;expires=2;keyid=\"key-current\";alg=\"ecdsa-p256\"", "signature": "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", new_public_key: ED25519_PUBLIC_KEY, new_key_id: "key-next", new_key_algo: "ecdsa-p256", idempotency_key: "idem-1" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(stageRotation).not.toHaveBeenCalled();
  });

  it("maps rotation authorization failures to the documented HTTP statuses", async () => {
    const request = new Request("https://app.allura.example.test/api/device-pairing/rotation/stage", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "rotation_stage", "x-allura-audience": "https://device-auth.example.test",
        "x-allura-nonce": "nonce", "x-allura-proof-id": "challenge-1", "x-allura-device-id": "dev-1",
        "x-allura-key-generation": "4", "signature-input": "sig1=(\"@method\");created=1;expires=2;keyid=\"key-current\";alg=\"ecdsa-p256\"", "signature": "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", new_public_key: VALID_PUBLIC_KEY, new_key_id: "key-next", new_key_algo: "ecdsa-p256", idempotency_key: "idem-1" }),
    });
    vi.mocked(stageRotation).mockRejectedValueOnce(new RotationError("AUTH_EXPIRED", "expired"));
    expect((await POST(request.clone())).status).toBe(401);

    vi.mocked(stageRotation).mockRejectedValueOnce(new RotationError("DEVICE_NOT_APPROVED", "not approved"));
    expect((await POST(request)).status).toBe(403);
  });
});
