import {
  constants as cryptoConstants,
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn() }));
vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.com"),
  getDeviceAuthAudience: vi.fn(() => "https://api.allura.example.com/device-auth"),
}));
vi.mock("@/lib/device-pairing/device-limit", () => ({
  acquireDeviceCountLock: vi.fn(),
  countApprovedDevices: vi.fn(async () => 0),
  getDeviceLimit: vi.fn(() => 5),
}));
vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({
  getAuthConfig: vi.fn(() => ({ ALLURA_MCP_BASE_URL: "https://mcp.rfc.example:9443" })),
}));
vi.mock("@/lib/mcp-token/repository", () => ({ createDeviceToken: vi.fn() }));

import { hashAuthorizationCode } from "@/lib/device-pairing/authorization-code";
import { computePkceCodeChallengeS256 } from "@/lib/device-pairing/pkce";
import { getAppPool } from "@/lib/postgres/connection";
import { createDeviceToken } from "@/lib/mcp-token/repository";

const origin = "https://app.allura.example.com";
const audience = "https://api.allura.example.com/device-auth";
const routePath = "/api/device-pairing/complete";

const body = {
  enrollment_transaction_id: "enroll_rfc9421",
  authorization_code: "code_rfc9421",
  pkce_verifier: "verifier_rfc9421",
  completion_nonce: "nonce_rfc9421",
};

type SignedCompletionRequest = {
  bodyText: string;
  headers: Record<string, string>;
  publicKey: string;
};

function signatureBase(
  digest: string,
  signatureInput: string,
  nonce = body.completion_nonce,
  method = "POST",
): string {
  return [
    `"@method": ${method}`,
    `"@target-uri": ${origin}${routePath}`,
    `"content-digest": ${digest}`,
    '"x-allura-purpose": pairing_complete',
    `"x-allura-audience": ${audience}`,
    `"x-allura-nonce": ${nonce}`,
    `"x-allura-proof-id": ${body.enrollment_transaction_id}`,
    `"@signature-params": ${signatureInput.slice(signatureInput.indexOf("=") + 1)}`,
  ].join("\n");
}

function signedRequest(keyAlgorithm: "ecdsa-p256" | "rsa-pss-2048" = "ecdsa-p256"): SignedCompletionRequest {
  const { privateKey, publicKey } = keyAlgorithm === "ecdsa-p256"
    ? generateKeyPairSync("ec", { namedCurve: "P-256" })
    : generateKeyPairSync("rsa", { modulusLength: 2048 });
  const bodyText = JSON.stringify(body);
  const digest = `sha-256=:${createHash("sha256").update(bodyText).digest("base64")}:`;
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id");created=${created};expires=${created + 60};keyid="pairing-p256";alg="${keyAlgorithm}"`;
  const base = Buffer.from(signatureBase(digest, signatureInput), "utf8");
  const signature = keyAlgorithm === "ecdsa-p256"
    ? sign("SHA256", base, { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64")
    : sign("RSA-SHA256", base, {
      key: privateKey,
      padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
      saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
    }).toString("base64");

  return {
    bodyText,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    headers: {
      "content-digest": digest,
      "x-allura-purpose": "pairing_complete",
      "x-allura-audience": audience,
      "x-allura-nonce": body.completion_nonce,
      "x-allura-proof-id": body.enrollment_transaction_id,
      "signature-input": signatureInput,
      signature: `sig1=:${signature}:`,
    },
  };
}

function pairingClient(publicKey: string, keyAlgorithm: "ecdsa-p256" | "rsa-pss-2048" = "ecdsa-p256") {
  return {
    query: vi.fn(async (text: string) => {
      if (text.includes("device_enrollment_lock_for_complete")) {
        return { rows: [{
          state: "APPROVED",
          public_key: publicKey,
          key_id: "pairing-p256",
          key_algo: keyAlgorithm,
          authorization_code_hash: hashAuthorizationCode(body.authorization_code),
          authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
          completion_nonce: body.completion_nonce,
          completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          pkce_code_challenge: computePkceCodeChallengeS256(body.pkce_verifier),
          approved_principal_id: "principal-rfc9421",
          approved_group_id: "allura-test",
          approved_workspace_id: "workspace-rfc9421",
        }] };
      }
      if (text.includes("FROM memberships")) return { rows: [{ role: "curator" }] };
      if (text.includes("FROM workspaces")) return { rows: [{ lock_mode: "normal" }] };
      if (text.includes("INSERT INTO paired_devices")) return { rows: [{ id: "device-rfc9421" }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}

describe("Story 29.6 — RFC 9421 pairing completion route", () => {
  it("redeems a genuinely ECDSA P-256 signed pairing_complete request through the real verifier", async () => {
    const request = signedRequest();
    const client = pairingClient(request.publicKey);
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    vi.mocked(createDeviceToken).mockResolvedValue({
      raw: "allura_mcp_device_rfc9421",
      record: { expires_at: "2026-09-09T09:00:00.000Z" },
    } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest(`${origin}${routePath}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...request.headers },
      body: request.bodyText,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      device_id: "device-rfc9421",
      access_token: "allura_mcp_device_rfc9421",
      expires_at: "2026-09-09T09:00:00.000Z",
      mcp_endpoint: "https://mcp.rfc.example:9443/mcp",
    });
  });

  it("redeems a genuine RSA-PSS pairing_complete request through the real verifier", async () => {
    const request = signedRequest("rsa-pss-2048");
    const client = pairingClient(request.publicKey, "rsa-pss-2048");
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    vi.mocked(createDeviceToken).mockResolvedValue({
      raw: "allura_mcp_device_rsa_pss",
      record: { expires_at: "2026-09-09T09:00:00.000Z" },
    } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest(`${origin}${routePath}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...request.headers },
      body: request.bodyText,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      device_id: "device-rfc9421", access_token: "allura_mcp_device_rsa_pss",
    });
  });

  it("rejects an altered signed request field", async () => {
    const request = signedRequest();
    const client = pairingClient(request.publicKey);
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest(`${origin}${routePath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...request.headers,
        "x-allura-nonce": "altered_nonce",
      },
      body: request.bodyText,
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "AUTH_INVALID" });
  });
});
