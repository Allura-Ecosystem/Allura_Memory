import { Pool } from "pg";
import { generateKeyPairSync, type KeyObject, randomUUID, sign } from "node:crypto";

import { type ExchangeTokenInput } from "@/lib/device-pairing/exchange-service";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import {
  createMigrationDatabase,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

export const EXCHANGE_ORIGIN = "https://device.exchange.integration.test";
export const EXCHANGE_AUDIENCE = "https://device.exchange.integration.test";
export const EXCHANGE_TARGET = "/api/device-pairing/exchange";

const EXCHANGE_COMPONENTS = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
] as const;

export type ExchangeFixture = {
  db: MigrationDatabase;
  deviceId: string;
  challengeId: string;
  nonce: string;
  privateKey: KeyObject;
};

export async function createExchangeFixture(label: string): Promise<ExchangeFixture> {
  const db = await createMigrationDatabase(`exchange-${label}`, "67-device-exchange-denial-audit.sql");
  const suffix = randomUUID().replaceAll("-", "");
  const groupId = `allura-live-exchange-${suffix}`;
  const workspaceId = `ws-live-exchange-${suffix}`;
  const principalId = `principal-live-exchange-${suffix}`;
  const deviceId = `device-live-exchange-${suffix}`;
  const challengeId = `challenge-live-exchange-${suffix}`;
  const nonce = `nonce-live-exchange-${suffix}`;
  const keyId = `key-live-exchange-${suffix}`;
  const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

  await db.owner.query(
    "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
    [workspaceId, groupId, `Live exchange ${label}`],
  );
  await db.owner.query(
    "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')",
    [groupId, principalId, `${label}-${suffix}@exchange.integration.test`],
  );
  await db.owner.query(
    `INSERT INTO paired_devices
      (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo, lifecycle_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecdsa-p256', 'APPROVED')`,
    [deviceId, principalId, groupId, workspaceId, `Exchange ${label}`, publicKey, keyId],
  );
  await db.owner.query(
    `INSERT INTO device_challenges
      (id, group_id, paired_device_id, nonce, audience, purpose, server_context, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'exchange', '{}'::jsonb, NOW() + INTERVAL '60 seconds')`,
    [challengeId, groupId, deviceId, nonce, EXCHANGE_AUDIENCE],
  );
  await db.owner.query(
    `INSERT INTO mcp_tokens
      (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id)
     VALUES ($1, $2, $3, $4, $5, $6, ARRAY['memory:write'], $7)`,
    [`token-old-${suffix}`, groupId, workspaceId, principalId, `prefix-old-${suffix}`, `hash-old-${suffix}`, deviceId],
  );

  return { db, deviceId, challengeId, nonce, privateKey: keys.privateKey };
}

export function signedExchangeInput(fixture: ExchangeFixture): ExchangeTokenInput {
  const requestBody = Buffer.from(JSON.stringify({
    device_id: fixture.deviceId,
    challenge_id: fixture.challengeId,
  }));
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id");created=${created};expires=${created + 60};keyid="${fixtureKeyId(fixture)}";alg="ecdsa-p256"`;
  const digest = computeContentDigest(requestBody);
  const base = buildSignatureBaseString(
    "POST",
    `${EXCHANGE_ORIGIN}${EXCHANGE_TARGET}`,
    digest,
    {
      "x-allura-purpose": "exchange",
      "x-allura-audience": EXCHANGE_AUDIENCE,
      "x-allura-nonce": fixture.nonce,
      "x-allura-proof-id": fixture.challengeId,
    },
    EXCHANGE_COMPONENTS,
    extractSignatureParamsRaw(signatureInput),
  );

  return {
    device_id: fixture.deviceId,
    challenge_id: fixture.challengeId,
    request_target: EXCHANGE_TARGET,
    request_body: requestBody,
    headers: {
      content_digest: digest,
      purpose: "exchange",
      audience: EXCHANGE_AUDIENCE,
      nonce: fixture.nonce,
      proof_id: fixture.challengeId,
      signature_input: signatureInput,
      signature: sign("SHA256", Buffer.from(base, "utf8"), {
        key: fixture.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64"),
    },
  };
}

function fixtureKeyId(fixture: ExchangeFixture): string {
  return `key-live-exchange-${fixture.deviceId.slice("device-live-exchange-".length)}`;
}

export function openSeparateExchangeConnection(databaseName: string): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: databaseName,
    user: process.env.POSTGRES_USER ?? "ronin4life",
    password: process.env.POSTGRES_PASSWORD ?? "",
    max: 1,
  });
}
