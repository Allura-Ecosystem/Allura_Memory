import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthOrigin: () => "https://app.allura.example.com",
  getDeviceAuthAudience: () => "https://api.allura.example.com/device-auth",
}));
vi.mock("@/lib/auth/config", () => ({
  getAuthConfig: () => ({ ALLURA_MCP_BASE_URL: "https://mcp.live.example:9443" }),
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  parseSignatureInput: () => ({
    label: "sig1",
    coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "kid-live",
    alg: "ecdsa-p256",
  }),
  verifyDeviceSignature: () => ({ valid: true, purpose: "pairing_complete" }),
}));

import { completePairing } from "@/lib/device-pairing/complete-service";
import { hashAuthorizationCode } from "@/lib/device-pairing/authorization-code";
import { computePkceCodeChallengeS256 } from "@/lib/device-pairing/pkce";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness";

describeMigrationLive("Story 29.6 complete transaction live PostgreSQL", () => {
  let db: MigrationDatabase;
  const enrollmentId = "enroll-live-complete";
  const groupId = "allura-live-complete";
  const workspaceId = "ws-live-complete";
  const principalId = "user-live-complete";
  const authorizationCode = "live-authorization-code";
  const completionNonce = "live-completion-nonce";
  const pkceVerifier = "live-pkce-verifier";

  beforeAll(async () => {
    db = await createMigrationDatabase("complete", "66-device-enrollment-expiry-transition.sql");
    await db.owner.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
      [workspaceId, groupId, "Completion workspace"],
    );
    await db.owner.query(
      "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, $4)",
      [groupId, principalId, "live@example.test", "curator"],
    );
    await db.app.query(
      `SELECT device_enrollment_create(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes'
      )`,
      [
        enrollmentId, "Live desktop", "live-public-key", "kid-live", "ecdsa-p256",
        computePkceCodeChallengeS256(pkceVerifier), "S256", "live-state", "loopback",
        "http://127.0.0.1:54321/callback",
      ],
    );
    const approval = await db.app.query<{ status: string }>(
      "SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status",
      [
        enrollmentId, "live-state", principalId, groupId, workspaceId,
        hashAuthorizationCode(authorizationCode), new Date(Date.now() + 60_000),
        completionNonce, new Date(Date.now() + 60_000),
      ],
    );
    expect(approval.rows[0]?.status).toBe("APPROVED");
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("atomically creates the device, linked token, audit, and consumed enrollment; replay is refused", async () => {
    const input = {
      enrollment_transaction_id: enrollmentId,
      authorization_code: authorizationCode,
      completion_nonce: completionNonce,
      pkce_verifier: pkceVerifier,
      request_target: "/api/device-pairing/complete",
      request_body: new Uint8Array(),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:",
        purpose: "pairing_complete",
        audience: "https://api.allura.example.com/device-auth",
        nonce: completionNonce,
        proof_id: enrollmentId,
        signature_input: "sig1=()",
        signature: "sig1=:ZmFrZQ==:",
      },
    };

    const result = await completePairing(db.app, input);

    expect(result.device_id).toMatch(/^dev_/);
    expect(result.access_token).toMatch(/^allura_mcp_/);
    expect(result.expires_at).toBeTruthy();
    expect(result.mcp_endpoint).toBe("https://mcp.live.example:9443/mcp");
    await expect(completePairing(db.app, input)).rejects.toMatchObject({ code: "ENROLLMENT_CONSUMED" });

    const [device, token, audit, denialAudit, enrollment] = await Promise.all([
      db.owner.query("SELECT principal_id, group_id, workspace_id, display_label, lifecycle_state, enrollment_id FROM paired_devices WHERE id = $1", [result.device_id]),
      db.owner.query("SELECT agent_name, group_id, workspace_id, paired_device_id, expires_at FROM mcp_tokens WHERE paired_device_id = $1", [result.device_id]),
      db.owner.query("SELECT event_type, agent_id, metadata FROM events WHERE metadata->>'paired_device_id' = $1", [result.device_id]),
      db.owner.query("SELECT event_type, agent_id, metadata FROM events WHERE event_type = 'DEVICE_ENROLL_DENIED' AND metadata->>'enrollment_transaction_id' = $1", [enrollmentId]),
      db.owner.query("SELECT state, consumed_at, authorization_code_consumed_at FROM device_enrollments WHERE id = $1", [enrollmentId]),
    ]);

    expect(device.rows).toEqual([{
      principal_id: principalId, group_id: groupId, workspace_id: workspaceId,
      display_label: "Live desktop", lifecycle_state: "APPROVED", enrollment_id: enrollmentId,
    }]);
    expect(token.rows).toHaveLength(1);
    expect(token.rows[0]).toMatchObject({
      agent_name: principalId, group_id: groupId, workspace_id: workspaceId, paired_device_id: result.device_id,
    });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ event_type: "DEVICE_PAIRING_COMPLETE", agent_id: principalId });
    expect(denialAudit.rows).toEqual([{
      event_type: "DEVICE_ENROLL_DENIED",
      agent_id: "device-enrollment",
      metadata: { enrollment_transaction_id: enrollmentId, reason_code: "ENROLLMENT_CONSUMED" },
    }]);
    expect(enrollment.rows[0]).toMatchObject({ state: "CONSUMED" });
    expect(enrollment.rows[0]?.consumed_at).toBeTruthy();
    expect(enrollment.rows[0]?.authorization_code_consumed_at).toBeTruthy();
  });

  it("expires a row that becomes stale after the transaction begins", async () => {
    const expiryEnrollmentId = "enroll-live-clock-boundary";
    await db.app.query(
      `SELECT device_enrollment_create(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )`,
      [
        expiryEnrollmentId, "Clock-boundary desktop", "clock-public-key", "kid-clock", "ecdsa-p256",
        "challenge-clock", "S256", "state-clock", "loopback",
        "http://127.0.0.1:54324/callback", new Date(Date.now() + 100),
      ],
    );
    await db.app.query("BEGIN");
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const expired = await db.app.query<{ expired: boolean }>(
        "SELECT device_enrollment_expire($1) AS expired",
        [expiryEnrollmentId],
      );
      expect(expired.rows[0]?.expired).toBe(true);
      await db.app.query("COMMIT");
    } catch (error) {
      await db.app.query("ROLLBACK");
      throw error;
    }

    const enrollment = await db.owner.query<{ state: string }>(
      "SELECT state FROM device_enrollments WHERE id = $1",
      [expiryEnrollmentId],
    );
    expect(enrollment.rows).toEqual([{ state: "EXPIRED" }]);
  });

  it("allows exactly one concurrent redemption across independent app connections", async () => {
    const concurrentEnrollmentId = "enroll-live-concurrent";
    const concurrentCode = "concurrent-authorization-code";
    const concurrentNonce = "concurrent-completion-nonce";
    const concurrentVerifier = "concurrent-pkce-verifier";
    await db.app.query(
      `SELECT device_enrollment_create(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes'
      )`,
      [
        concurrentEnrollmentId, "Concurrent desktop", "concurrent-public-key", "kid-live", "ecdsa-p256",
        computePkceCodeChallengeS256(concurrentVerifier), "S256", "concurrent-state", "loopback",
        "http://127.0.0.1:54325/callback",
      ],
    );
    await db.app.query(
      "SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        concurrentEnrollmentId, "concurrent-state", principalId, groupId, workspaceId,
        hashAuthorizationCode(concurrentCode), new Date(Date.now() + 60_000),
        concurrentNonce, new Date(Date.now() + 60_000),
      ],
    );
    const poolConfig = {
      host: process.env.POSTGRES_HOST ?? "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT ?? "5432"),
      database: db.databaseName,
      user: process.env.POSTGRES_USER ?? "allura",
      password: process.env.POSTGRES_PASSWORD ?? "",
      options: "-c role=allura_app",
      max: 1,
    };
    const contenderA = new Pool(poolConfig);
    const contenderB = new Pool(poolConfig);
    const input = {
      enrollment_transaction_id: concurrentEnrollmentId,
      authorization_code: concurrentCode,
      completion_nonce: concurrentNonce,
      pkce_verifier: concurrentVerifier,
      request_target: "/api/device-pairing/complete",
      request_body: new Uint8Array(),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
        audience: "https://api.allura.example.com/device-auth", nonce: concurrentNonce,
        proof_id: concurrentEnrollmentId, signature_input: "sig1=()", signature: "ZmFrZQ==",
      },
    };
    try {
      const outcomes = await Promise.allSettled([
        completePairing(contenderA, input),
        completePairing(contenderB, input),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === "rejected");
      expect(rejected).toMatchObject({ reason: { code: "ENROLLMENT_CONSUMED" } });
    } finally {
      await Promise.all([contenderA.end(), contenderB.end()]);
    }

    const [devices, tokens, audits, enrollment] = await Promise.all([
      db.owner.query("SELECT id FROM paired_devices WHERE enrollment_id = $1", [concurrentEnrollmentId]),
      db.owner.query("SELECT id FROM mcp_tokens WHERE paired_device_id IN (SELECT id FROM paired_devices WHERE enrollment_id = $1)", [concurrentEnrollmentId]),
      db.owner.query("SELECT id FROM events WHERE event_type = 'DEVICE_PAIRING_COMPLETE' AND metadata->>'enrollment_transaction_id' = $1", [concurrentEnrollmentId]),
      db.owner.query("SELECT state FROM device_enrollments WHERE id = $1", [concurrentEnrollmentId]),
    ]);
    expect(devices.rows).toHaveLength(1);
    expect(tokens.rows).toHaveLength(1);
    expect(audits.rows).toHaveLength(1);
    expect(enrollment.rows).toEqual([{ state: "CONSUMED" }]);
  });

  it("rolls back device insertion when linked token minting fails", async () => {
    const failedEnrollmentId = "enroll-live-rollback";
    const failedPrincipalId = "user-live-rollback";
    const failedCode = "rollback-authorization-code";
    const failedNonce = "rollback-completion-nonce";
    const failedVerifier = "rollback-pkce-verifier";
    await db.owner.query(
      "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, $4)",
      [groupId, failedPrincipalId, "rollback@example.test", "curator"],
    );
    await db.app.query(
      `SELECT device_enrollment_create(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes'
      )`,
      [
        failedEnrollmentId, "Rollback desktop", "rollback-public-key", "kid-live", "ecdsa-p256",
        computePkceCodeChallengeS256(failedVerifier), "S256", "rollback-state", "loopback",
        "http://127.0.0.1:54322/callback",
      ],
    );
    await db.app.query(
      "SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        failedEnrollmentId, "rollback-state", failedPrincipalId, groupId, workspaceId,
        hashAuthorizationCode(failedCode), new Date(Date.now() + 60_000),
        failedNonce, new Date(Date.now() + 60_000),
      ],
    );
    await db.owner.query(`
      CREATE FUNCTION fail_live_device_token_mint() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.agent_name = 'user-live-rollback' THEN
          RAISE EXCEPTION 'forced token mint failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_live_device_token_mint_trigger
      BEFORE INSERT ON mcp_tokens FOR EACH ROW EXECUTE FUNCTION fail_live_device_token_mint();
    `);

    try {
      await expect(completePairing(db.app, {
        enrollment_transaction_id: failedEnrollmentId,
        authorization_code: failedCode,
        completion_nonce: failedNonce,
        pkce_verifier: failedVerifier,
        request_target: "/api/device-pairing/complete",
        request_body: new Uint8Array(),
        headers: {
          content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
          audience: "https://api.allura.example.com/device-auth", nonce: failedNonce,
          proof_id: failedEnrollmentId, signature_input: "sig1=()", signature: "ZmFrZQ==",
        },
      })).rejects.toThrow("forced token mint failure");
    } finally {
      await db.owner.query("DROP TRIGGER IF EXISTS fail_live_device_token_mint_trigger ON mcp_tokens");
      await db.owner.query("DROP FUNCTION IF EXISTS fail_live_device_token_mint()");
    }

    const [devices, tokens, audits, enrollment] = await Promise.all([
      db.owner.query("SELECT id FROM paired_devices WHERE enrollment_id = $1", [failedEnrollmentId]),
      db.owner.query("SELECT id FROM mcp_tokens WHERE agent_name = $1", [failedPrincipalId]),
      db.owner.query("SELECT id FROM events WHERE metadata->>'enrollment_transaction_id' = $1 AND event_type = 'DEVICE_PAIRING_COMPLETE'", [failedEnrollmentId]),
      db.owner.query("SELECT state, consumed_at FROM device_enrollments WHERE id = $1", [failedEnrollmentId]),
    ]);
    expect(devices.rows).toHaveLength(0);
    expect(tokens.rows).toHaveLength(0);
    expect(audits.rows).toHaveLength(0);
    expect(enrollment.rows[0]).toMatchObject({ state: "APPROVED", consumed_at: null });
  });

  it("rolls back device and token when completion audit insertion fails", async () => {
    const failedEnrollmentId = "enroll-live-audit-rollback";
    const failedPrincipalId = "user-live-audit-rollback";
    const failedCode = "audit-rollback-authorization-code";
    const failedNonce = "audit-rollback-completion-nonce";
    const failedVerifier = "audit-rollback-pkce-verifier";
    await db.owner.query(
      "INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, $4)",
      [groupId, failedPrincipalId, "audit-rollback@example.test", "curator"],
    );
    await db.app.query(
      `SELECT device_enrollment_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes')`,
      [
        failedEnrollmentId, "Audit rollback desktop", "audit-rollback-public-key", "kid-live", "ecdsa-p256",
        computePkceCodeChallengeS256(failedVerifier), "S256", "audit-rollback-state", "loopback",
        "http://127.0.0.1:54323/callback",
      ],
    );
    await db.app.query(
      "SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        failedEnrollmentId, "audit-rollback-state", failedPrincipalId, groupId, workspaceId,
        hashAuthorizationCode(failedCode), new Date(Date.now() + 60_000),
        failedNonce, new Date(Date.now() + 60_000),
      ],
    );
    await db.owner.query(`
      CREATE FUNCTION fail_live_completion_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'DEVICE_PAIRING_COMPLETE' AND NEW.metadata->>'enrollment_transaction_id' = 'enroll-live-audit-rollback' THEN
          RAISE EXCEPTION 'forced completion audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_live_completion_audit_trigger
      BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_live_completion_audit();
    `);

    try {
      await expect(completePairing(db.app, {
        enrollment_transaction_id: failedEnrollmentId,
        authorization_code: failedCode,
        completion_nonce: failedNonce,
        pkce_verifier: failedVerifier,
        request_target: "/api/device-pairing/complete",
        request_body: new Uint8Array(),
        headers: {
          content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
          audience: "https://api.allura.example.com/device-auth", nonce: failedNonce,
          proof_id: failedEnrollmentId, signature_input: "sig1=()", signature: "ZmFrZQ==",
        },
      })).rejects.toThrow("forced completion audit failure");
    } finally {
      await db.owner.query("DROP TRIGGER IF EXISTS fail_live_completion_audit_trigger ON events");
      await db.owner.query("DROP FUNCTION IF EXISTS fail_live_completion_audit()");
    }

    const [devices, tokens, audits, enrollment] = await Promise.all([
      db.owner.query("SELECT id FROM paired_devices WHERE enrollment_id = $1", [failedEnrollmentId]),
      db.owner.query("SELECT id FROM mcp_tokens WHERE agent_name = $1", [failedPrincipalId]),
      db.owner.query("SELECT id FROM events WHERE metadata->>'enrollment_transaction_id' = $1 AND event_type = 'DEVICE_PAIRING_COMPLETE'", [failedEnrollmentId]),
      db.owner.query("SELECT state, consumed_at FROM device_enrollments WHERE id = $1", [failedEnrollmentId]),
    ]);
    expect(devices.rows).toHaveLength(0);
    expect(tokens.rows).toHaveLength(0);
    expect(audits.rows).toHaveLength(0);
    expect(enrollment.rows[0]).toMatchObject({ state: "APPROVED", consumed_at: null });
  });
});
