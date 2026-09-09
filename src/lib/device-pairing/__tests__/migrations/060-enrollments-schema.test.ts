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
  "docker/postgres-init/60-device-enrollments.sql",
)
const liveDbConfigPath = path.resolve(process.cwd(), "vitest.config.live-db.ts")

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8")
}

describe("Story 29.1 migration 060 enrollment contract", () => {
  it("keeps every Story 29.1 migration test in the canonical live-DB inventory", () => {
    const config = readFileSync(liveDbConfigPath, "utf8")
    for (const testFile of [
      "060-enrollments-schema.test.ts",
      "061-paired-devices-schema.test.ts",
      "062-agent-name-trigger.test.ts",
      "063-challenges-schema.test.ts",
    ]) {
      expect(config).toContain(
        `src/lib/device-pairing/__tests__/migrations/${testFile}`,
      )
    }
  })

  it("uses the repository-safe filename and records logical schema version 060 atomically", () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = migrationSql()
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("VALUES ('060',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("defines enrollment state and post-approval authority constraints", () => {
    const sql = migrationSql()
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS device_enrollments")
    expect(sql).toContain("chk_enroll_pending_no_auth")
    expect(sql).toContain("chk_enroll_approved_has_auth")
    expect(sql).toContain("chk_enroll_consumed_has_consumed_at")
    expect(sql).toContain("chk_enroll_expired_cleared_code")
    expect(sql).not.toMatch(/private_key/i)
  })

  it("exposes only five fixed-search-path SECURITY DEFINER functions to allura_app", () => {
    const sql = migrationSql()
    for (const functionName of [
      "device_enrollment_create",
      "device_enrollment_approve",
      "device_enrollment_lock_for_complete",
      "device_enrollment_consume",
      "device_enrollment_expire",
    ]) {
      expect(sql).toContain(`FUNCTION ${functionName}`)
    }
    expect(sql.match(/SECURITY DEFINER SET search_path = pg_catalog, public/g)).toHaveLength(5)
    expect(sql).toContain("REVOKE ALL ON device_enrollments FROM PUBLIC")
    expect(sql).toContain("REVOKE ALL ON device_enrollments FROM allura_app")
    expect(sql).toContain("FROM PUBLIC;")
    expect(sql).toContain("TO allura_app;")
  })
})

describeMigrationLive("Story 29.1 migration 060 live PostgreSQL enforcement", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("m060", "60-device-enrollments.sql")
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it("records schema version 060 and denies direct allura_app table access", async () => {
    const versions = await db.owner.query(
      "SELECT version FROM schema_versions WHERE version = '060'",
    )
    expect(versions.rows).toEqual([{ version: "060" }])
    await expect(db.app.query("SELECT * FROM device_enrollments")).rejects.toThrow(
      /permission denied/i,
    )
  })

  it("allows allura_app to create a PENDING enrollment through the scoped function", async () => {
    await db.app.query(
      `SELECT device_enrollment_create(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW() + INTERVAL '10 minutes'
      )`,
      [
        "enroll_live_060",
        "Workstation-1",
        "public-key-only",
        "kid-060",
        "ecdsa-p256",
        "challenge-060",
        "S256",
        "state-060",
        "deep_link",
      ],
    )
    const row = await db.owner.query(
      `SELECT state, approved_group_id, authorization_code_hash
       FROM device_enrollments WHERE id = 'enroll_live_060'`,
    )
    expect(row.rows).toEqual([
      {
        state: "PENDING",
        approved_group_id: null,
        authorization_code_hash: null,
      },
    ])
  })

  it("rejects invalid PENDING, APPROVED, CONSUMED, and EXPIRED state shapes", async () => {
    const base = `
      INSERT INTO device_enrollments
        (id, display_label, public_key, key_id, key_algo,
         pkce_code_challenge, pkce_code_challenge_method, pkce_state,
         callback_type, state, expires_at`

    await expect(
      db.owner.query(
        `${base}, approved_group_id)
         VALUES ('bad_pending','x','pub','kid','ecdsa-p256','cc','S256','s',
                 'deep_link','PENDING',NOW()+INTERVAL '10 minutes','allura-forged')`,
      ),
    ).rejects.toThrow(/chk_enroll_pending_no_auth/i)

    await expect(
      db.owner.query(
        `${base})
         VALUES ('bad_approved','x','pub','kid','ecdsa-p256','cc','S256','s',
                 'deep_link','APPROVED',NOW()+INTERVAL '10 minutes')`,
      ),
    ).rejects.toThrow(/chk_enroll_approved_has_auth/i)

    await expect(
      db.owner.query(
        `${base})
         VALUES ('bad_consumed','x','pub','kid','ecdsa-p256','cc','S256','s',
                 'deep_link','CONSUMED',NOW()+INTERVAL '10 minutes')`,
      ),
    ).rejects.toThrow(/chk_enroll_consumed_has_consumed_at/i)

    await expect(
      db.owner.query(
        `${base}, authorization_code_consumed_at)
         VALUES ('bad_expired','x','pub','kid','ecdsa-p256','cc','S256','s',
                 'deep_link','EXPIRED',NOW()-INTERVAL '1 minute',NOW())`,
      ),
    ).rejects.toThrow(/chk_enroll_expired_cleared_code/i)
  })
})
