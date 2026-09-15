import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./postgres-test-harness"

const migrationPath = path.resolve(
  process.cwd(),
  "docker/postgres-init/64-device-enrollment-approval-context.sql",
)
const liveDbConfigPath = path.resolve(process.cwd(), "vitest.config.live-db.ts")

describe("Story 29.5 migration 064 approval-context contract", () => {
  it("adds a fixed-search-path SECURITY DEFINER context function instead of granting direct enrollment reads", () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, "utf8")

    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("FUNCTION device_enrollment_approval_context")
    expect(sql).toContain("RETURNS TABLE")
    expect(sql).toContain("callback_type TEXT")
    expect(sql).toContain("callback_uri TEXT")
    expect(sql).toContain("SET callback_uri = 'allura-pairing://complete'")
    expect(sql).toContain("SET state = 'EXPIRED'")
    expect(sql).toContain("public_key TEXT")
    expect(sql).toContain("SECURITY DEFINER SET search_path = pg_catalog, public")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION")
    expect(sql).toContain("device_enrollment_approval_context(TEXT)")
    expect(sql).toContain("TO allura_app")
    expect(sql).toContain("FUNCTION device_enrollment_pre_human_audit")
    expect(sql).toContain("app.current_principal")
    expect(sql).toContain("app.current_group_id")
    expect(sql).toContain("app.current_workspace_id")
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION device_enrollment_pre_human_audit(TEXT, JSONB) FROM PUBLIC")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION device_enrollment_pre_human_audit(TEXT, JSONB) TO allura_app")
    expect(sql).toContain("VALUES ('064',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("registers the approval-context contract in the live-DB inventory", () => {
    const config = readFileSync(liveDbConfigPath, "utf8")
    expect(config).toContain(
      "src/lib/device-pairing/__tests__/migrations/064-approval-context-function.test.ts",
    )
  })
})

describeMigrationLive("Story 29.5 migration 064 live PostgreSQL enforcement", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("m064", "64-device-enrollment-approval-context.sql")
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it("allows allura_app to retrieve only scoped callback context while direct table reads stay denied", async () => {
    await db.app.query(
      `SELECT device_enrollment_create(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes'
      )`,
      [
        "enroll_live_064",
        "Workstation-064",
        "public-key-064",
        "kid-064",
        "ecdsa-p256",
        "challenge-064",
        "S256",
        "state-064",
        "loopback",
        "http://127.0.0.1:54321/callback",
      ],
    )

    await expect(db.app.query("SELECT * FROM device_enrollments")).rejects.toThrow(
      /permission denied/i,
    )
    const context = await db.app.query(
      "SELECT * FROM device_enrollment_approval_context($1)",
      ["enroll_live_064"],
    )
    expect(context.rows).toEqual([
      {
        callback_type: "loopback",
        callback_uri: "http://127.0.0.1:54321/callback",
        public_key: "public-key-064",
      },
    ])
  })

  it("rejects null or external callback targets and revokes both creation overloads from PUBLIC", async () => {
    await expect(db.app.query(
      `SELECT device_enrollment_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes')`,
      ["invalid-null", "label", "key", "kid", "ecdsa-p256", "challenge", "S256", "state", "loopback", null],
    )).rejects.toThrow(/invalid callback/i)
    await expect(db.app.query(
      `SELECT device_enrollment_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() + INTERVAL '10 minutes')`,
      ["invalid-external", "label", "key", "kid", "ecdsa-p256", "challenge", "S256", "state", "deep_link", "https://evil.example/callback"],
    )).rejects.toThrow(/invalid deep-link/i)

    const privileges = await db.owner.query<{ legacy_public: boolean; scoped_public: boolean }>(
      `SELECT
        has_function_privilege('public', 'device_enrollment_create(text,text,text,text,text,text,text,text,text,timestamptz)', 'EXECUTE') AS legacy_public,
        has_function_privilege('public', 'device_enrollment_create(text,text,text,text,text,text,text,text,text,text,timestamptz)', 'EXECUTE') AS scoped_public`,
    )
    expect(privileges.rows[0]).toEqual({ legacy_public: false, scoped_public: false })
  })

  it("returns NOT_PENDING on every replay, regardless of PKCE state", async () => {
    const args = ["enroll_live_064", "state-064", "principal-064", "allura-acme", "ws-064", "hash", new Date(Date.now() + 60_000), "nonce", new Date(Date.now() + 60_000)]
    await expect(db.app.query("SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status", args)).rejects.toThrow(
      /authenticated principal context required/i,
    )
    await db.app.query("SELECT set_config('app.current_principal', $1, false)", [args[2]])
    await db.app.query("SELECT set_config('app.current_group_id', $1, false)", [args[3]])
    await db.app.query("SELECT set_config('app.current_workspace_id', $1, false)", [args[4]])
    const first = await db.app.query("SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status", args)
    expect(first.rows[0].status).toBe("APPROVED")
    const replay = await db.app.query("SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status", args)
    expect(replay.rows[0].status).toBe("NOT_PENDING")
    const wrongStateReplay = await db.app.query("SELECT device_enrollment_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) AS status", [args[0], "wrong-state", ...args.slice(2)])
    expect(wrongStateReplay.rows[0].status).toBe("NOT_PENDING")
  })

  it("permits allura_app to write only allowed pre-human audits through the scoped function", async () => {
    await db.app.query(
      "SELECT device_enrollment_pre_human_audit($1, $2::jsonb)",
      ["DEVICE_ENROLL_DENIED", JSON.stringify({ enrollment_transaction_id: "prehuman-064", reason_code: "STATE_MISMATCH" })],
    )
    const event = await db.owner.query(
      "SELECT group_id, workspace_id, event_type, agent_id, metadata FROM events WHERE metadata->>'enrollment_transaction_id' = 'prehuman-064'",
    )
    expect(event.rows).toEqual([{
      group_id: "allura-system",
      workspace_id: null,
      event_type: "DEVICE_ENROLL_DENIED",
      agent_id: "device-enrollment",
      metadata: { enrollment_transaction_id: "prehuman-064", reason_code: "STATE_MISMATCH" },
    }])
    await expect(db.app.query(
      "SELECT device_enrollment_pre_human_audit($1, $2::jsonb)",
      ["ARBITRARY_EVENT", "{}"],
    )).rejects.toThrow(/invalid pre-human/i)
    const privilege = await db.owner.query(
      "SELECT has_function_privilege('public', 'device_enrollment_pre_human_audit(text,jsonb)', 'EXECUTE') AS public_execute",
    )
    expect(privilege.rows[0].public_execute).toBe(false)
  })
})
