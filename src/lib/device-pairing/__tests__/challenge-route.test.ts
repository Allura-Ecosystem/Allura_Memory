import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({ getPool: vi.fn(() => ({ marker: "pool" })) }));
vi.mock("@/lib/device-pairing/challenge-service", () => ({
  ChallengeError: class ChallengeError extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
  },
  issueChallenge: vi.fn(),
}));

import { POST } from "@/app/api/device-pairing/challenge/route";
import { ChallengeError, issueChallenge } from "@/lib/device-pairing/challenge-service";

describe("Story 29.7 — POST /api/device-pairing/challenge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an issued challenge for a valid device request", async () => {
    vi.mocked(issueChallenge).mockResolvedValueOnce({
      challenge_id: "challenge-1",
      nonce: "a".repeat(43),
      audience: "https://device-auth.example.test",
      purpose: "exchange",
      server_context: { device_id: "dev-approved", key_generation: 4, server_time: "2026-09-09T10:40:00.000Z" },
      expires_at: "2026-09-09T10:41:00.000Z",
    });

    const response = await POST(new Request("http://localhost/api/device-pairing/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "dev-approved", purpose: "exchange", group_id: "forged" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ challenge_id: "challenge-1", purpose: "exchange" });
    expect(issueChallenge).toHaveBeenCalledWith({ marker: "pool" }, { device_id: "dev-approved", purpose: "exchange" });
  });

  it("rejects malformed requests without calling the service", async () => {
    const response = await POST(new Request("http://localhost/api/device-pairing/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "", purpose: "forged" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_CHALLENGE_REQUEST" });
    expect(issueChallenge).not.toHaveBeenCalled();
  });

  it("maps an audited service denial to 403", async () => {
    vi.mocked(issueChallenge).mockRejectedValueOnce(
      new ChallengeError("DEVICE_NOT_APPROVED", "Device is not approved"),
    );

    const response = await POST(new Request("http://localhost/api/device-pairing/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "dev-revoked", purpose: "exchange" }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "DEVICE_NOT_APPROVED", message: "Device is not approved" });
  });

  it("maps unexpected service failures to 500", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(issueChallenge).mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(new Request("http://localhost/api/device-pairing/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "dev-approved", purpose: "exchange" }),
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(errorSpy).toHaveBeenCalledWith("[device-pairing/challenge] error:", expect.any(Error));
    errorSpy.mockRestore();
  });
});
