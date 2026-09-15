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
  "docker/postgres-init/63-device-challenges.sql",
)

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8")
}

describe("Story 29.1 migration 063 challenge contract", () => {
  it("uses the repository-safe filename and records logical schema version 063 atomically", () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = migrationSql()
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("VALUES ('063',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("defines post-device challenges without pairing_complete as a row purpose", () => {
    const sql = migrationSql()
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS device_challenges")
    expect(sql).toMatch(
      /paired_device_id\s+TEXT NOT NULL REFERENCES paired_devices\(id\)/,
    )
    expect(sql).toContain("chk_device_challenges_group_id_format")
    expect(sql).toContain(
      "purpose IN ('exchange', 'rotation_stage', 'rotation_activate', 'recovery_status')",
    )
    const purposeCheck = sql.match(/purpose IN \(([^)]+)\)/)?.[1]
    expect(purposeCheck).not.toContain("pairing_complete")
  })

  it("defines explicitly granted RLS and a narrow fixed-path route resolver", () => {
    const sql = migrationSql()
    expect(sql).toContain("ALTER TABLE device_challenges FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("CREATE POLICY device_challenges_policy")
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON device_challenges TO allura_app",
    )
    expect(sql).toContain("FUNCTION resolve_device_route(p_device_id TEXT)")
    expect(sql).toContain("SECURITY DEFINER SET search_path = pg_catalog, public")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION resolve_device_route(TEXT) TO allura_app")
  })
})

describeMigrationLive("Story 29.1 migration 063 live PostgreSQL enforcement", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("m063", "63-device-challenges.sql")
    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ('ws-063-a','allura-063-a','Workspace A'),
              ('ws-063-b','allura-063-b','Workspace B')`,
    )
    await db.owner.query(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id, lifecycle_state)
       VALUES
         ('dev-063-a','human-a','allura-063-a','ws-063-a','Device A','pub-a','kid-a','APPROVED'),
         ('dev-063-b','human-b','allura-063-b','ws-063-b','Device B','pub-b','kid-b','APPROVED'),
         ('dev-063-revoked','human-a','allura-063-a','ws-063-a','Revoked','pub-r','kid-r','REVOKED')`,
    )
    await db.owner.query(
      `INSERT INTO device_challenges
         (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
       VALUES
         ('chal-063-a','allura-063-a','dev-063-a','nonce-063-a','aud','exchange',NOW()+INTERVAL '60 seconds'),
         ('chal-063-b','allura-063-b','dev-063-b','nonce-063-b','aud','rotation_stage',NOW()+INTERVAL '60 seconds')`,
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it("records version 063 and rejects invalid group identifiers and row purposes", async () => {
    const versions = await db.owner.query(
      "SELECT version FROM schema_versions WHERE version = '063'",
    )
    expect(versions.rows).toEqual([{ version: "063" }])

    await expect(
      db.owner.query(
        `INSERT INTO device_challenges
           (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
         VALUES ('chal-bad-group','forged','dev-063-a','nonce-bg','aud','exchange',NOW()+INTERVAL '60 seconds')`,
      ),
    ).rejects.toThrow(/chk_device_challenges_group_id_format/i)

    await expect(
      db.owner.query(
        `INSERT INTO device_challenges
           (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
         VALUES ('chal-bad-purpose','allura-063-a','dev-063-a','nonce-bp','aud','pairing_complete',NOW()+INTERVAL '60 seconds')`,
      ),
    ).rejects.toThrow(/purpose/i)
  })

  it("enforces tenant RLS while allowing same-tenant challenge reads", async () => {
    const app = await db.app.connect()
    try {
      await app.query("BEGIN")
      await app.query("SELECT set_config('app.current_group_id', $1, true)", [
        "allura-063-a",
      ])
      const visible = await app.query("SELECT id FROM device_challenges ORDER BY id")
      expect(visible.rows).toEqual([{ id: "chal-063-a" }])
      await app.query("COMMIT")
    } finally {
      app.release()
    }
  })

  it("resolves only the group id of APPROVED devices without tenant bootstrap input", async () => {
    const approved = await db.app.query(
      "SELECT resolve_device_route('dev-063-a') AS group_id",
    )
    const revoked = await db.app.query(
      "SELECT resolve_device_route('dev-063-revoked') AS group_id",
    )
    const missing = await db.app.query(
      "SELECT resolve_device_route('dev-063-missing') AS group_id",
    )

    expect(approved.rows).toEqual([{ group_id: "allura-063-a" }])
    expect(revoked.rows).toEqual([{ group_id: null }])
    expect(missing.rows).toEqual([{ group_id: null }])
  })
})
