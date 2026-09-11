import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";


import { clearAuthConfig } from "@/lib/auth/config";
import type { CompletePairingInput } from "@/lib/device-pairing/complete-service";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import type { ExchangeTokenInput } from "@/lib/device-pairing/exchange-service";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import {
  createMigrationDatabase,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

export const DEVICE_ORIGIN = "https://device.integration.test";
export const DEVICE_AUDIENCE = `${DEVICE_ORIGIN}/device-auth`;

export interface SigningKey {
  privateKey: KeyObject;
  publicKeyPem: string;
  keyId: string;
}

const LIVE_DEVICE_AUTH_ENV_KEYS = [
  "ALLURA_DEVICE_AUTH_ORIGIN",
  "ALLURA_DEVICE_AUTH_AUDIENCE",
  "ALLURA_MCP_BASE_URL",
  "ALLURA_MCP_TOKEN_SECRET",
] as const;

type LiveDeviceAuthEnvKey = (typeof LIVE_DEVICE_AUTH_ENV_KEYS)[number];
type EnvSnapshot = Record<LiveDeviceAuthEnvKey, { present: boolean; value?: string }>;

function snapshotLiveDeviceAuthEnv(): EnvSnapshot {
  return Object.fromEntries(
    LIVE_DEVICE_AUTH_ENV_KEYS.map((key) => [
      key,
      { present: Object.hasOwn(process.env, key), value: process.env[key] },
    ]),
  ) as EnvSnapshot;
}

function restoreLiveDeviceAuthEnv(snapshot: EnvSnapshot): void {
  for (const key of LIVE_DEVICE_AUTH_ENV_KEYS) {
    const previous = snapshot[key];
    if (previous.present) process.env[key] = previous.value;
    else delete process.env[key];
  }
  clearAuthConfig();
  clearDevicePairingConfig();
}

export function configureLiveDeviceAuth(): void {
  process.env.ALLURA_DEVICE_AUTH_ORIGIN = DEVICE_ORIGIN;
  process.env.ALLURA_DEVICE_AUTH_AUDIENCE = DEVICE_AUDIENCE;
  process.env.ALLURA_MCP_BASE_URL = "https://mcp.integration.test";
  process.env.ALLURA_MCP_TOKEN_SECRET = "integration-test-token-secret-at-least-16-chars";
  clearAuthConfig();
  clearDevicePairingConfig();
}

export function createSigningKey(keyId = "kid-integration"): SigningKey {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    keyId,
  };
}

export async function createLiveDatabase(label: string): Promise<MigrationDatabase> {
  const envSnapshot = snapshotLiveDeviceAuthEnv();
  configureLiveDeviceAuth();
  try {
    const database = await createMigrationDatabase(label, "67-device-exchange-denial-audit.sql");
    return {
      ...database,
      close: async () => {
        try {
          await database.close();
        } finally {
          restoreLiveDeviceAuthEnv(envSnapshot);
        }
      },
    };
  } catch (error) {
    restoreLiveDeviceAuthEnv(envSnapshot);
    throw error;
  }
}

export async function seedApprovedDevice(
  db: MigrationDatabase,
  input: {
    groupId: string;
    workspaceId: string;
    principalId: string;
    deviceId: string;
    signingKey: SigningKey;
    lifecycleState?: "APPROVED" | "REVOKED" | "LOST";
    graceExpiresAt?: string | null;
  },
): Promise<void> {
  await db.owner.query(
    "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
    [input.workspaceId, input.groupId, `${input.deviceId} workspace`],
  );
  await db.owner.query(
    "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')",
    [input.groupId, input.principalId, `${input.principalId}@integration.test`],
  );
  await db.owner.query(
    `INSERT INTO paired_devices
       (id, principal_id, group_id, workspace_id, display_label, current_public_key,
        current_key_id, current_key_algo, lifecycle_state, rotation_grace_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecdsa-p256', $8, $9)`,
    [
      input.deviceId,
      input.principalId,
      input.groupId,
      input.workspaceId,
      `${input.deviceId} device`,
      input.signingKey.publicKeyPem,
      input.signingKey.keyId,
      input.lifecycleState ?? "APPROVED",
      input.graceExpiresAt ?? null,
    ],
  );
}

function makeHeaders(
  privateKey: KeyObject,
  keyId: string,
  purpose: "exchange" | "pairing_complete",
  body: Uint8Array,
  requestTarget: string,
  audience: string,
  nonce: string,
  proofId: string,
  deviceId?: string,
): CompletePairingInput["headers"] {
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 60;
  const covered = [
    "@method",
    "@target-uri",
    "content-digest",
    "x-allura-purpose",
    "x-allura-audience",
    "x-allura-nonce",
    "x-allura-proof-id",
  ];
  if (purpose === "exchange") covered.push("x-allura-device-id", "x-allura-key-generation");
  const signatureInput = `sig1=(${covered.map((component) => `\"${component}\"`).join(" ")});created=${created};expires=${expires};keyid=\"${keyId}\";alg=\"ecdsa-p256\"`;
  const base = buildSignatureBaseString(
    "POST",
    `${DEVICE_ORIGIN}${requestTarget}`,
    computeContentDigest(body),
    {
      "x-allura-purpose": purpose,
      "x-allura-audience": audience,
      "x-allura-nonce": nonce,
      "x-allura-proof-id": proofId,
      "x-allura-device-id": deviceId,
      "x-allura-key-generation": deviceId ? "1" : undefined,
    },
    covered,
    extractSignatureParamsRaw(signatureInput),
  );
  const signature = sign("SHA256", Buffer.from(base), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64");
  return {
    content_digest: computeContentDigest(body),
    purpose,
    audience,
    nonce,
    proof_id: proofId,
    signature_input: signatureInput,
    // The service passes the Signature header value directly to the verifier;
    // production's route parser has already selected the signature label.
    signature,
  };
}

export function signedExchangeInput(input: {
  signingKey: SigningKey;
  deviceId: string;
  challengeId: string;
  nonce: string;
  audience?: string;
  body?: Uint8Array;
  requestTarget?: string;
  signedTarget?: string;
}): ExchangeTokenInput {
  const body = input.body ?? Buffer.from("{}");
  const requestTarget = input.requestTarget ?? "/api/device-pairing/exchange";
  return {
    device_id: input.deviceId,
    challenge_id: input.challengeId,
    request_target: requestTarget,
    request_body: body,
    headers: makeHeaders(
      input.signingKey.privateKey,
      input.signingKey.keyId,
      "exchange",
      body,
      input.signedTarget ?? requestTarget,
      input.audience ?? DEVICE_AUDIENCE,
      input.nonce,
      input.challengeId,
      input.deviceId,
    ),
  };
}

export function signedCompleteInput(input: {
  signingKey: SigningKey;
  enrollmentId: string;
  authorizationCode: string;
  completionNonce: string;
  pkceVerifier: string;
  body?: Uint8Array;
}): CompletePairingInput {
  const body = input.body ?? Buffer.from("{}");
  const requestTarget = "/api/device-pairing/complete";
  return {
    enrollment_transaction_id: input.enrollmentId,
    authorization_code: input.authorizationCode,
    completion_nonce: input.completionNonce,
    pkce_verifier: input.pkceVerifier,
    request_target: requestTarget,
    request_body: body,
    headers: makeHeaders(
      input.signingKey.privateKey,
      input.signingKey.keyId,
      "pairing_complete",
      body,
      requestTarget,
      DEVICE_AUDIENCE,
      input.completionNonce,
      input.enrollmentId,
    ),
  };
}
