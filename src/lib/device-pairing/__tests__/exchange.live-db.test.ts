import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const routePool = vi.hoisted(() => ({ owner: undefined as unknown as MigrationDatabase["owner"] }));

vi.mock("@/lib/auth/config", () => ({ getAuthConfig: () => ({ ALLURA_MCP_BASE_URL: "https://mcp.example.test" }) }));
vi.mock("@/lib/device-pairing/config", () => ({ getDeviceAuthAudience: () => "https://device.example.test", getDeviceAuthOrigin: () => "https://device.example.test" }));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  hasExactCoveredComponents: (covered: readonly string[], expected: readonly string[]) =>
    covered.length === expected.length && new Set(covered.map((component) => component.toLowerCase())).size === expected.length &&
    expected.every((component) => covered.map((value) => value.toLowerCase()).includes(component)),
  parseSignatureInput: () => ({ label: "sig1", coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"], created: Math.floor(Date.now() / 1000) - 1, expires: Math.floor(Date.now() / 1000) + 60, keyid: "kid-exchange", alg: "ecdsa-p256" }),
  verifyDeviceSignature: () => ({ valid: true, purpose: "exchange" }),
}));

vi.mock("@/lib/postgres/connection", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/postgres/connection")>(),
  getAppPool: () => routePool.owner,
}));

import { exchangeToken } from "@/lib/device-pairing/exchange-service";
import { closePool } from "@/lib/postgres/connection";
import { createMigrationDatabase, describeMigrationLive, type MigrationDatabase } from "./migrations/postgres-test-harness";

describeMigrationLive("Story 29.9 exchange live PostgreSQL", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;
  const groupId = "allura-live-exchange";
  const workspaceId = "ws-live-exchange";
  const principalId = "principal-live-exchange";

  beforeAll(async () => {
    db = await createMigrationDatabase("exchange", "67-device-exchange-denial-audit.sql");
    routePool.owner = db.owner;
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    process.env["ALLURA_MCP_TOKEN_SECRET"] = ["test", "secret", "at", "least", "16", "chars", "long"].join("-");
    await closePool();
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Exchange workspace')", [workspaceId, groupId]);
    await db.owner.query("INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')", [groupId, principalId, "exchange@example.test"]);
    await db.owner.query(
      `INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo, lifecycle_state)
       VALUES ('dev-live-exchange', $1, $2, $3, 'Exchange device', 'public-key', 'kid-exchange', 'ecdsa-p256', 'APPROVED')`,
      [principalId, groupId, workspaceId],
    );
    await db.owner.query(
      `INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, server_context, expires_at)
       VALUES ('challenge-live-exchange', $1, 'dev-live-exchange', 'nonce-live-exchange', 'https://device.example.test', 'exchange', '{}'::jsonb, NOW() + INTERVAL '60 seconds')`,
      [groupId],
    );
    await db.owner.query(
      `INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id)
       VALUES ('tok-live-old', $1, $2, $3, 'prefix-live-old', 'hash-live-old', ARRAY['memory:write'], 'dev-live-exchange')`,
      [groupId, workspaceId, principalId],
    );
  }, 120_000);

  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("consumes the challenge and atomically replaces the active device token", async () => {
    const result = await exchangeToken(db.owner as never, {
      device_id: "dev-live-exchange", challenge_id: "challenge-live-exchange", request_target: "/api/device-pairing/exchange", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "exchange", audience: "https://device.example.test", nonce: "nonce-live-exchange", proof_id: "challenge-live-exchange", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    });
    expect(result.mcp_endpoint).toBe("https://mcp.example.test/mcp");
    const tokens = await db.owner.query<{ id: string; revoked: boolean; agent_name: string; paired_device_id: string | null }>(
      "SELECT id, revoked_at IS NOT NULL AS revoked, agent_name, paired_device_id FROM mcp_tokens WHERE paired_device_id = 'dev-live-exchange' ORDER BY id",
    );
    expect(tokens.rows).toHaveLength(2);
    expect(tokens.rows.find((token) => token.id === "tok-live-old")).toMatchObject({ revoked: true });
    const replacement = tokens.rows.find((token) => token.id !== "tok-live-old");
    expect(replacement).toMatchObject({ revoked: false, agent_name: principalId, paired_device_id: "dev-live-exchange" });
    const consumed = await db.owner.query<{ consumed: boolean; consumed_by_token_id: string | null }>(
      "SELECT consumed_at IS NOT NULL AS consumed, consumed_by_token_id FROM device_challenges WHERE id = 'challenge-live-exchange'",
    );
    expect(consumed.rows).toEqual([{ consumed: true, consumed_by_token_id: replacement?.id ?? null }]);
    const [device, audit] = await Promise.all([
      db.owner.query<{ last_exchange_at: Date | null }>("SELECT last_exchange_at FROM paired_devices WHERE id = 'dev-live-exchange'"),
      db.owner.query<{ group_id: string; workspace_id: string | null; agent_id: string; metadata: Record<string, unknown> }>("SELECT group_id, workspace_id, agent_id, metadata FROM events WHERE event_type = 'DEVICE_EXCHANGE_ALLOWED' AND metadata->>'device_id' = 'dev-live-exchange'"),
    ]);
    expect(device.rows[0]?.last_exchange_at).toBeTruthy();
    expect(audit.rows).toEqual([{
      group_id: groupId,
      workspace_id: workspaceId,
      agent_id: principalId,
      metadata: { device_id: "dev-live-exchange", challenge_id: "challenge-live-exchange" },
    }]);
  });

  function input(deviceId: string, challengeId: string, nonce: string) {
    return {
      device_id: deviceId, challenge_id: challengeId, request_target: "/api/device-pairing/exchange", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "exchange", audience: "https://device.example.test", nonce, proof_id: challengeId, signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    };
  }

  async function seed(deviceId: string, challengeId: string, nonce: string, principal = principalId): Promise<void> {
    await db.owner.query(
      `INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo, lifecycle_state)
       VALUES ($1, $2, $3, $4, 'Exchange device', 'public-key', 'kid-exchange', 'ecdsa-p256', 'APPROVED')`,
      [deviceId, principal, groupId, workspaceId],
    );
    await db.owner.query(
      `INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, server_context, expires_at)
       VALUES ($1, $2, $3, $4, 'https://device.example.test', 'exchange', '{}'::jsonb, NOW() + INTERVAL '60 seconds')`,
      [challengeId, groupId, deviceId, nonce],
    );
    await db.owner.query(
      `INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id)
       VALUES ($1, $2, $3, $4, $5, $6, ARRAY['memory:write'], $7)`,
      [`tok-${deviceId}`, groupId, workspaceId, principal, `prefix-${deviceId}`, `hash-${deviceId}`, deviceId],
    );
  }

  it("keeps old token, challenge, last_exchange, and audit absent when allowed audit insertion fails", async () => {
    const deviceId = "dev-live-exchange-rollback";
    const challengeId = "challenge-live-exchange-rollback";
    await seed(deviceId, challengeId, "nonce-live-exchange-rollback");
    await db.owner.query(`
      CREATE FUNCTION fail_live_exchange_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'DEVICE_EXCHANGE_ALLOWED' AND NEW.metadata->>'device_id' = 'dev-live-exchange-rollback' THEN
          RAISE EXCEPTION 'forced exchange audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_live_exchange_audit_trigger BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_live_exchange_audit();
    `);
    try {
      await expect(exchangeToken(db.owner as never, input(deviceId, challengeId, "nonce-live-exchange-rollback"))).rejects.toThrow("forced exchange audit failure");
    } finally {
      await db.owner.query("DROP TRIGGER IF EXISTS fail_live_exchange_audit_trigger ON events");
      await db.owner.query("DROP FUNCTION IF EXISTS fail_live_exchange_audit()");
    }
    const [tokens, challenge, device, audits] = await Promise.all([
      db.owner.query<{ count: string; revoked: boolean }>("SELECT COUNT(*)::text AS count, bool_or(revoked_at IS NOT NULL) AS revoked FROM mcp_tokens WHERE paired_device_id = $1", [deviceId]),
      db.owner.query<{ consumed_at: Date | null }>("SELECT consumed_at FROM device_challenges WHERE id = $1", [challengeId]),
      db.owner.query<{ last_exchange_at: Date | null }>("SELECT last_exchange_at FROM paired_devices WHERE id = $1", [deviceId]),
      db.owner.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_EXCHANGE_ALLOWED' AND metadata->>'device_id' = $1", [deviceId]),
    ]);
    expect(tokens.rows).toEqual([{ count: "1", revoked: false }]);
    expect(challenge.rows).toEqual([{ consumed_at: null }]);
    expect(device.rows).toEqual([{ last_exchange_at: null }]);
    expect(audits.rows).toEqual([{ count: "0" }]);
  });

  it("commits a resolved physical-workspace denial audit for inactive membership without minting a secret", async () => {
    const deviceId = "dev-live-exchange-member-denied";
    const challengeId = "challenge-live-exchange-member-denied";
    const removedPrincipal = "principal-live-exchange-removed";
    await seed(deviceId, challengeId, "nonce-live-exchange-member-denied", removedPrincipal);
    await expect(exchangeToken(db.owner as never, input(deviceId, challengeId, "nonce-live-exchange-member-denied")))
      .rejects.toMatchObject({ code: "MEMBERSHIP_INACTIVE" });
    const [token, audit] = await Promise.all([
      db.owner.query<{ revoked: boolean }>("SELECT revoked_at IS NOT NULL AS revoked FROM mcp_tokens WHERE paired_device_id = $1", [deviceId]),
      db.owner.query<{ group_id: string; workspace_id: string | null; agent_id: string; metadata: Record<string, unknown> }>("SELECT group_id, workspace_id, agent_id, metadata FROM events WHERE event_type = 'DEVICE_EXCHANGE_DENIED' AND metadata->>'device_id' = $1", [deviceId]),
    ]);
    expect(token.rows).toEqual([{ revoked: true }]);
    expect(audit.rows).toEqual([{ group_id: groupId, workspace_id: workspaceId, agent_id: removedPrincipal, metadata: { device_id: deviceId, challenge_id: challengeId, reason_code: "MEMBERSHIP_INACTIVE" } }]);
  });

  it("rejects a consumed challenge replay without another token secret", async () => {
    await expect(exchangeToken(db.owner as never, input("dev-live-exchange", "challenge-live-exchange", "nonce-live-exchange")))
      .rejects.toMatchObject({ code: "AUTH_EXPIRED" });
    const tokens = await db.owner.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM mcp_tokens WHERE paired_device_id = 'dev-live-exchange'");
    expect(tokens.rows).toEqual([{ count: "2" }]);
  });

  it("rejects a cross-tenant selector before exchange service authority resolution", async () => {
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "dev-live-exchange", challenge_id: "challenge-live-exchange", group_id: "allura-other-tenant" }),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_REQUEST" });
    const audit = await db.owner.query<{ group_id: string; workspace_id: string | null; agent_id: string; metadata: Record<string, unknown> }>(
      "SELECT group_id, workspace_id, agent_id, metadata FROM events WHERE event_type = 'DEVICE_EXCHANGE_DENIED' AND metadata->>'reason_code' = 'INVALID_REQUEST' ORDER BY created_at DESC LIMIT 1",
    );
    expect(audit.rows).toEqual([{ group_id: "allura-system", workspace_id: null, agent_id: "device-enrollment", metadata: { device_id: "dev-live-exchange", challenge_id: "challenge-live-exchange", reason_code: "INVALID_REQUEST" } }]);
  });
});
