import { AlluraClient } from "@allura/sdk";
import type { Browser } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { type ChildProcess, spawn } from "node:child_process";
import {
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";
import { createServer } from "node:http";

import { TEST_ONLY_APPROVAL_USER } from "@/app/api/device-pairing/test-approve/route";
import {
  computePkceCodeChallengeS256,
  generatePkceVerifier,
} from "@/lib/device-pairing/pkce";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import { startLocalTestOnlyPairingRuntime } from "./local-test-only-pairing-runtime";

interface EnrollmentResponse {
  enrollment_transaction_id: string;
  pairing_url: string;
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

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Unable to reserve a loopback port for shipped /pair");
  return address.port;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function startShippedPairPage(): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.env.ALLURA_TEST_BUN ?? "bun", ["x", "next", "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ALLURA_DEV_AUTH_ENABLED: "true",
      ALLURA_LOCAL_TEST_PAIRING_RUNTIME: "true",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Shipped /pair server exited (${child.exitCode}): ${stderr.slice(-500)}`);
    try {
      await fetch(`${baseUrl}/`);
      return { baseUrl, close: () => stopChild(child) };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await stopChild(child);
  throw new Error(`Shipped /pair server did not bind on loopback: ${stderr.slice(-500)}`);
}

const describeLocalRuntime = process.env.ALLURA_E2E_LOCAL_TEST_RUNTIME === "true"
  ? describe
  : describe.skip;

describeLocalRuntime("Story 29.20 — isolated provider-neutral browser runtime", () => {
  it("takes a real enrollment through browser approval to a secret-free loopback callback", async () => {
    let runtime: Awaited<ReturnType<typeof startLocalTestOnlyPairingRuntime>> | undefined;
    let shippedPairPage: Awaited<ReturnType<typeof startShippedPairPage>> | undefined;
    let browser: Browser | undefined;
    try {
      runtime = await startLocalTestOnlyPairingRuntime();
      expect((await fetch(`${runtime.baseUrl}/pair`)).status).toBe(404);
      expect((await fetch(`${runtime.baseUrl}/approve-browser`, { method: "POST" })).status).toBe(404);
      shippedPairPage = await startShippedPairPage();
      const { chromium } = await import("@playwright/test");
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      const pkceVerifier = generatePkceVerifier();
      const pkceState = randomBytes(32).toString("base64url");
      const enrollment = await postJson<EnrollmentResponse>(
        `${runtime.baseUrl}/api/device-pairing/enroll`,
        {
          device_label: "Story 29.20 local test desktop",
          callback_type: "loopback",
          callback_uri: `${runtime.baseUrl}/callback`,
          pkce_code_challenge: computePkceCodeChallengeS256(pkceVerifier),
          pkce_code_challenge_method: "S256",
          pkce_state: pkceState,
          public_key: publicKey.export({ type: "spki", format: "pem" }).toString(),
          key_id: "story-29-20-local-p256",
          key_algorithm: "ecdsa-p256",
        },
      );

      const pairingUrl = new URL(enrollment.pairing_url);
      pairingUrl.protocol = new URL(shippedPairPage.baseUrl).protocol;
      pairingUrl.host = new URL(shippedPairPage.baseUrl).host;
      const pairingResponse = await page.goto(pairingUrl.toString());
      expect(pairingResponse?.status()).toBe(200);
      expect(await page.content()).not.toContain("authorization_code");
      expect(await page.content()).not.toContain("completion_nonce");
      const pairingBody = await page.locator("body").innerText();
      expect(pairingBody).toContain("Approve test device");
      const approveButton = page.getByRole("button", { name: "Approve test device" });
      expect(await approveButton.isEnabled()).toBe(true);
      const approvalResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === "/api/device-pairing/test-approve",
      );
      const callbackResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/callback").catch(() => null);
      await approveButton.click();
      expect((await approvalResponse).status()).toBe(303);
      const callbackResult = await callbackResponse;
      expect(callbackResult).not.toBeNull();
      const callback = new URL(callbackResult!.url());
      expect(callback.searchParams.get("state")).toBe(pkceState);
      expect(callback.searchParams.get("txn")).toBe(enrollment.enrollment_transaction_id);
      expect(callback.searchParams.get("code")).toBeTruthy();
      expect(callback.searchParams.get("completion_nonce")).toBeTruthy();
      expect(await page.content()).not.toContain("authorization_code");
      expect(await page.content()).not.toContain("completion_nonce");

      const completeBody = {
        enrollment_transaction_id: enrollment.enrollment_transaction_id,
        authorization_code: callback.searchParams.get("code")!,
        pkce_verifier: pkceVerifier,
        completion_nonce: callback.searchParams.get("completion_nonce")!,
      };
      const completeProof = signedDeviceRequest({
        privateKey,
        keyId: "story-29-20-local-p256",
        targetUri: `${runtime.baseUrl}/api/device-pairing/complete`,
        audience: `${runtime.baseUrl}/device-auth`,
        purpose: "pairing_complete",
        nonce: completeBody.completion_nonce,
        proofId: enrollment.enrollment_transaction_id,
        body: completeBody,
      });
      const completion = await postJson<CompletionResponse>(
        `${runtime.baseUrl}/api/device-pairing/complete`,
        completeBody,
        completeProof.headers,
      );
      expect(completion.device_id).toBeTruthy();

      const challenge = await postJson<ChallengeResponse>(
        `${runtime.baseUrl}/api/device-pairing/challenge`,
        { device_id: completion.device_id, purpose: "exchange" },
      );
      expect(challenge.nonce).toBeTruthy();

      const exchangeBody = {
        device_id: completion.device_id,
        challenge_id: challenge.challenge_id,
      };
      const exchangeProof = signedDeviceRequest({
        privateKey,
        keyId: "story-29-20-local-p256",
        targetUri: `${runtime.baseUrl}/api/device-pairing/exchange`,
        audience: challenge.audience,
        purpose: "exchange",
        nonce: challenge.nonce,
        proofId: challenge.challenge_id,
        body: exchangeBody,
      });
      const exchange = await postJson<ExchangeResponse>(
        `${runtime.baseUrl}/api/device-pairing/exchange`,
        exchangeBody,
        exchangeProof.headers,
      );
      expect(exchange.access_token).toBeTruthy();

      const client = new AlluraClient({
        baseUrl: runtime.mcpBaseUrl,
        authToken: exchange.access_token,
        timeout: 10_000,
        retries: 0,
      });
      await expect(client.memory.search({
        group_id: TEST_ONLY_APPROVAL_USER.groupId,
        query: "provider-neutral local runtime authorized search",
      })).resolves.toBeDefined();

      const waitForMemorySearchAudit = Reflect.get(runtime, "waitForMemorySearchAudit") as unknown;
      expect(waitForMemorySearchAudit).toEqual(expect.any(Function));
      const audit = await (waitForMemorySearchAudit as (input: {
        principalId: string;
        pairedDeviceId: string;
      }) => Promise<{ principalId: string; pairedDeviceId: string | null } | null>)({
        principalId: TEST_ONLY_APPROVAL_USER.id,
        pairedDeviceId: completion.device_id,
      });
      expect(audit).toMatchObject({
        principalId: TEST_ONLY_APPROVAL_USER.id,
        pairedDeviceId: completion.device_id,
      });
      expect(audit?.principalId).not.toBe(`device:${completion.device_id}`);
    } finally {
      if (browser) await browser.close().catch(() => undefined);
      if (shippedPairPage) await shippedPairPage.close().catch(() => undefined);
      if (runtime) await runtime.close().catch(() => undefined);
    }
  });
});
