import { describe, expect, it } from "vitest";

import {
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";

import {
  computePkceCodeChallengeS256,
  generatePkceVerifier,
} from "@/lib/device-pairing/pkce";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import {
  createPlaywrightCapability,
  inspectClerkPairingE2eReadiness,
} from "./clerk-test-harness";

const readiness = inspectClerkPairingE2eReadiness();

interface EnrollmentResponse {
  enrollment_transaction_id: string;
  pairing_url: string;
}

interface ApprovalResponse {
  callback: { url: string };
}

interface CompletionResponse {
  device_id: string;
}

interface ChallengeResponse {
  challenge_id: string;
  nonce: string;
  audience: string;
}

interface ExchangeResponse {
  access_token: string;
  mcp_endpoint: string;
}

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(300);
  return response.json() as Promise<T>;
}

function signedDeviceRequest(input: {
  privateKey: KeyObject;
  keyId: string;
  targetUri: string;
  audience: string;
  purpose: "pairing_complete" | "exchange";
  nonce: string;
  proofId: string;
  body: Record<string, string>;
}): { bodyText: string; headers: Record<string, string> } {
  const bodyText = JSON.stringify(input.body);
  const bodyBytes = new TextEncoder().encode(bodyText);
  const contentDigest = computeContentDigest(bodyBytes);
  const created = Math.floor(Date.now() / 1000);
  const components = [
    "@method",
    "@target-uri",
    "content-digest",
    "x-allura-purpose",
    "x-allura-audience",
    "x-allura-nonce",
    "x-allura-proof-id",
  ];
  const signatureInput = `sig1=(${components.map((component) => `"${component}"`).join(" ")});created=${created};expires=${created + 60};keyid="${input.keyId}";alg="ecdsa-p256"`;
  const base = buildSignatureBaseString(
    "POST",
    input.targetUri,
    contentDigest,
    {
      "x-allura-purpose": input.purpose,
      "x-allura-audience": input.audience,
      "x-allura-nonce": input.nonce,
      "x-allura-proof-id": input.proofId,
    },
    components,
    extractSignatureParamsRaw(signatureInput),
  );
  const signature = sign("SHA256", Buffer.from(base), {
    key: input.privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64");

  return {
    bodyText,
    headers: {
      "content-digest": contentDigest,
      "x-allura-purpose": input.purpose,
      "x-allura-audience": input.audience,
      "x-allura-nonce": input.nonce,
      "x-allura-proof-id": input.proofId,
      "signature-input": signatureInput,
      signature: `sig1=:${signature}:`,
    },
  };
}

function principalIdsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(principalIdsFrom);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    /^(principalId|principal_id)$/i.test(key) && typeof child === "string"
      ? [child]
      : principalIdsFrom(child),
  );
}

describe("Story 29.20 — Clerk browser-to-desktop pairing (AC-28)", () => {
  if (!readiness.ready) {
    it.skip(readiness.reason, () => undefined);
    return;
  }

  it("completes the B1 Clerk journey through a human-bound MCP call", async () => {
    const playwright = createPlaywrightCapability(readiness);
    expect(playwright).not.toBeNull();

    const { page, close } = await playwright!.open();
    try {
      const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const pkceVerifier = generatePkceVerifier();
      const pkceState = randomBytes(32).toString("base64url");
      const enrollment = await postJson<EnrollmentResponse>(
        joinUrl(readiness.config.e2eBaseUrl, "/api/device-pairing/enroll"),
        {
          device_label: "Story 29.20 E2E desktop",
          callback_type: "deep_link",
          callback_uri: "allura-pairing://complete",
          pkce_code_challenge: computePkceCodeChallengeS256(pkceVerifier),
          pkce_code_challenge_method: "S256",
          pkce_state: pkceState,
          public_key: publicKey.export({ type: "spki", format: "pem" }).toString(),
          key_id: "story-29-20-p256",
          key_algorithm: "ecdsa-p256",
        },
      );

      const pairingUrl = new URL(enrollment.pairing_url);
      expect(pairingUrl.origin).toBe(new URL(readiness.config.pairingBrowserUrl).origin);
      await page.goto(pairingUrl.toString());

      // B1 contract: this Clerk test token must establish a real test-user session
      // at the existing approval boundary. No test-only approval endpoint exists.
      const approval = await page.evaluate(async ({ approvalUrl, enrollmentTransactionId, state, token }) => {
        const response = await fetch(approvalUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            enrollment_transaction_id: enrollmentTransactionId,
            pkce_state: state,
          }),
        });
        return { status: response.status, body: await response.json() };
      }, {
        approvalUrl: joinUrl(readiness.config.e2eBaseUrl, "/api/device-pairing/approve"),
        enrollmentTransactionId: enrollment.enrollment_transaction_id,
        state: pkceState,
        token: readiness.config.clerkTestToken,
      });
      expect(approval.status).toBe(200);
      const callback = new URL((approval.body as ApprovalResponse).callback.url);
      expect(callback.searchParams.get("state")).toBe(pkceState);
      expect(callback.searchParams.get("txn")).toBe(enrollment.enrollment_transaction_id);

      const completeUrl = joinUrl(readiness.config.e2eBaseUrl, "/api/device-pairing/complete");
      const completeBody = {
        enrollment_transaction_id: enrollment.enrollment_transaction_id,
        authorization_code: callback.searchParams.get("code")!,
        pkce_verifier: pkceVerifier,
        completion_nonce: callback.searchParams.get("completion_nonce")!,
      };
      const completeProof = signedDeviceRequest({
        privateKey,
        keyId: "story-29-20-p256",
        targetUri: joinUrl(readiness.config.deviceAuthOrigin, "/api/device-pairing/complete"),
        audience: readiness.config.deviceAuthAudience,
        purpose: "pairing_complete",
        nonce: completeBody.completion_nonce,
        proofId: enrollment.enrollment_transaction_id,
        body: completeBody,
      });
      const completion = await postJson<CompletionResponse>(completeUrl, completeBody, completeProof.headers);

      const challenge = await postJson<ChallengeResponse>(
        joinUrl(readiness.config.e2eBaseUrl, "/api/device-pairing/challenge"),
        { device_id: completion.device_id, purpose: "exchange" },
      );
      const exchangeUrl = joinUrl(readiness.config.e2eBaseUrl, "/api/device-pairing/exchange");
      const exchangeBody = {
        device_id: completion.device_id,
        challenge_id: challenge.challenge_id,
      };
      const exchangeProof = signedDeviceRequest({
        privateKey,
        keyId: "story-29-20-p256",
        targetUri: joinUrl(readiness.config.deviceAuthOrigin, "/api/device-pairing/exchange"),
        audience: challenge.audience,
        purpose: "exchange",
        nonce: challenge.nonce,
        proofId: challenge.challenge_id,
        body: exchangeBody,
      });
      const exchange = await postJson<ExchangeResponse>(exchangeUrl, exchangeBody, exchangeProof.headers);

      const mcpResponse = await postJson<unknown>(exchange.mcp_endpoint, {
        jsonrpc: "2.0",
        id: "story-29-20-human-principal",
        method: "tools/list",
        params: {},
      }, {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${exchange.access_token}`,
      });
      const principalIds = principalIdsFrom(mcpResponse);
      expect(principalIds).toContain(readiness.config.expectedHumanPrincipalId);
      expect(principalIds).not.toContain(`device:${completion.device_id}`);
    } finally {
      await close();
    }
  });
});
