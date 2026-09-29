import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { generateKeyPairSync, type KeyObject, randomUUID, sign } from "node:crypto";

import { clearAuthConfig } from "@/lib/auth/config";
import { hashAuthorizationCode } from "@/lib/device-pairing/authorization-code";
import { completePairing, type CompletePairingInput } from "@/lib/device-pairing/complete-service";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import { createEnrollment } from "@/lib/device-pairing/enrollment-service";
import { computePkceCodeChallengeS256 } from "@/lib/device-pairing/pkce";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

const ORIGIN = "https://device-limit.concurrent.integration.test";
const AUDIENCE = "https://device-limit.concurrent.integration.test/device-auth";
const TARGET = "/api/device-pairing/complete";
const LIMIT = 2;
const CONTENDERS = 4;
const COMPONENTS = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
] as const;

type ApprovedEnrollment = {
  enrollmentId: string;
  authorizationCode: string;
  completionNonce: string;
  pkceVerifier: string;
  privateKey: KeyObject;
  keyId: string;
};

function openAppConnection(database: string): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database,
    user: process.env.POSTGRES_USER ?? "ronin4life",
    password: process.env.POSTGRES_PASSWORD ?? "",
    options: "-c role=allura_app",
    max: 1,
  });
}

function signedCompletionInput(enrollment: ApprovedEnrollment): CompletePairingInput {
  const requestBody = Buffer.from(JSON.stringify({
    enrollment_transaction_id: enrollment.enrollmentId,
    authorization_code: enrollment.authorizationCode,
    completion_nonce: enrollment.completionNonce,
  }));
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id");created=${created};expires=${created + 60};keyid="${enrollment.keyId}";alg="ecdsa-p256"`;
  const contentDigest = computeContentDigest(requestBody);
  const base = buildSignatureBaseString(
    "POST",
    `${ORIGIN}${TARGET}`,
    contentDigest,
    {
      "x-allura-purpose": "pairing_complete",
      "x-allura-audience": AUDIENCE,
      "x-allura-nonce": enrollment.completionNonce,
      "x-allura-proof-id": enrollment.enrollmentId,
    },
    COMPONENTS,
    extractSignatureParamsRaw(signatureInput),
  );
  return {
    enrollment_transaction_id: enrollment.enrollmentId,
    authorization_code: enrollment.authorizationCode,
    completion_nonce: enrollment.completionNonce,
    pkce_verifier: enrollment.pkceVerifier,
    request_target: TARGET,
    request_body: requestBody,
    headers: {
      content_digest: contentDigest,
      purpose: "pairing_complete",
      audience: AUDIENCE,
      nonce: enrollment.completionNonce,
      proof_id: enrollment.enrollmentId,
      signature_input: signatureInput,
      signature: sign("SHA256", Buffer.from(base, "utf8"), {
        key: enrollment.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64"),
    },
  };
}

describeMigrationLive("Story 29.19 HIGH-F4 device-limit concurrency against real PostgreSQL", () => {
  let db: MigrationDatabase;
  const originalEnv = {
    origin: process.env.ALLURA_DEVICE_AUTH_ORIGIN,
    audience: process.env.ALLURA_DEVICE_AUTH_AUDIENCE,
    baseUrl: process.env.ALLURA_MCP_BASE_URL,
    tokenSecret: process.env.ALLURA_MCP_TOKEN_SECRET,
    deviceLimit: process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT,
  };
  const groupId = `allura-device-limit-${randomUUID()}`;
  const workspaceId = `ws-device-limit-${randomUUID()}`;
  const principalId = `principal-device-limit-${randomUUID()}`;

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = ORIGIN;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = AUDIENCE;
    process.env.ALLURA_MCP_BASE_URL = "https://mcp.device-limit.concurrent.integration.test";
    process.env.ALLURA_MCP_TOKEN_SECRET = "device-limit-concurrency-token-secret";
    process.env.ALLURA_DEVICE_PAIRING_DEVICE_LIMIT = String(LIMIT);
    clearAuthConfig();
    clearDevicePairingConfig();
    db = await createMigrationDatabase("device-limit-concurrency", "66-device-enrollment-expiry-transition.sql");
    await db.owner.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
      [workspaceId, groupId, "Device limit concurrency"],
    );
    await db.owner.query(
      "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'curator')",
      [groupId, principalId, "device-limit@integration.test"],
    );
    // Direct SQL below is an integration-fixture stand-in for the request
    // middleware, which stamps authenticated principal context per session.
    await db.app.query("SELECT set_config('app.current_principal', $1, false)", [principalId]);
    await db.app.query("SELECT set_config('app.current_group_id', $1, false)", [groupId]);
    await db.app.query("SELECT set_config('app.current_workspace_id', $1, false)", [workspaceId]);
  }, 120_000);

  afterAll(async () => {
    for (const [name, value] of Object.entries({
      ALLURA_DEVICE_AUTH_ORIGIN: originalEnv.origin,
      ALLURA_DEVICE_AUTH_AUDIENCE: originalEnv.audience,
      ALLURA_MCP_BASE_URL: originalEnv.baseUrl,
      ALLURA_MCP_TOKEN_SECRET: originalEnv.tokenSecret,
      ALLURA_DEVICE_PAIRING_DEVICE_LIMIT: originalEnv.deviceLimit,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    clearAuthConfig();
    clearDevicePairingConfig();
    await db?.close();
  });

  async function createApprovedEnrollment(index: number): Promise<ApprovedEnrollment> {
    const suffix = `${index}-${randomUUID().replaceAll("-", "")}`;
    const keyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const publicKey = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
    const pkceVerifier = `device-limit-verifier-${suffix}`;
    const approvalCode = `device-limit-code-${suffix}`;
    const completionNonce = `device-limit-nonce-${suffix}`;
    const enrollment = await createEnrollment(db.app, {
      device_label: `Contender ${index}`,
      callback_type: "loopback",
      callback_uri: `http://127.0.0.1:${51000 + index}/callback`,
      pkce_code_challenge: computePkceCodeChallengeS256(pkceVerifier),
      pkce_code_challenge_method: "S256",
      pkce_state: `device-limit-state-${suffix}`,
      public_key: publicKey,
      key_id: `device-limit-key-${suffix}`,
      key_algorithm: "ecdsa-p256",
    });
    const approval = await db.app.query<{ status: string }>(
      "SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status",
      [
        enrollment.enrollment_transaction_id,
        `device-limit-state-${suffix}`,
        principalId,
        groupId,
        workspaceId,
        hashAuthorizationCode(approvalCode),
        new Date(Date.now() + 60_000),
        completionNonce,
        new Date(Date.now() + 60_000),
      ],
    );
    expect(approval.rows[0]?.status).toBe("APPROVED");
    return {
      enrollmentId: enrollment.enrollment_transaction_id,
      authorizationCode: approvalCode,
      completionNonce,
      pkceVerifier,
      privateKey: keyPair.privateKey,
      keyId: `device-limit-key-${suffix}`,
    };
  }

  it("serializes independent approved completions and ends exactly at the configured device limit", async () => {
    const enrollments = await Promise.all(Array.from({ length: CONTENDERS }, (_, index) => createApprovedEnrollment(index)));
    const pools = enrollments.map(() => openAppConnection(db.databaseName));
    try {
      const outcomes = await Promise.allSettled(enrollments.map((enrollment, index) =>
        completePairing(pools[index]!, signedCompletionInput(enrollment)),
      ));
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(LIMIT);
      const denials = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      expect(denials).toHaveLength(CONTENDERS - LIMIT);
      expect(denials.every((outcome) => (outcome.reason as { code?: string }).code === "DEVICE_LIMIT_EXCEEDED")).toBe(true);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
    }

    const [devices, successfulAudits, deniedAudits, enrollmentsAfter] = await Promise.all([
      db.owner.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM paired_devices
         WHERE group_id = $1 AND workspace_id = $2 AND principal_id = $3 AND lifecycle_state = 'APPROVED'`,
        [groupId, workspaceId, principalId],
      ),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_PAIRING_COMPLETE' AND metadata->>'paired_device_id' IS NOT NULL",
      ),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ENROLL_DENIED' AND metadata->>'reason_code' = 'DEVICE_LIMIT_EXCEEDED'",
      ),
      db.owner.query<{ state: string }>(
        "SELECT state FROM device_enrollments WHERE approved_group_id = $1 AND approved_workspace_id = $2 AND approved_principal_id = $3 ORDER BY id",
        [groupId, workspaceId, principalId],
      ),
    ]);
    expect(devices.rows).toEqual([{ count: String(LIMIT) }]);
    expect(successfulAudits.rows).toEqual([{ count: String(LIMIT) }]);
    expect(deniedAudits.rows).toEqual([{ count: String(CONTENDERS - LIMIT) }]);
    expect(enrollmentsAfter.rows.filter((row) => row.state === "CONSUMED")).toHaveLength(LIMIT);
    expect(enrollmentsAfter.rows.filter((row) => row.state === "APPROVED")).toHaveLength(CONTENDERS - LIMIT);
  });
});
