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
  "docker/postgres-init/61-paired-devices.sql",
)
const idempotencyScopeMigrationPath = path.resolve(
  process.cwd(),
  "docker/postgres-init/68-device-rotation-idempotency-scope.sql",
)

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8")
}

describe("Story 29.1 migration 061 paired-device contract", () => {
  it("uses the repository-safe filename and records logical schema version 061 atomically", () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = migrationSql()
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("VALUES ('061',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("requires authority, constrains lifecycle, and keeps enrollment_id audit-only", () => {
    const sql = migrationSql()
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS paired_devices")
    for (const column of ["principal_id", "group_id", "workspace_id"]) {
      expect(sql).toMatch(new RegExp(`${column}\\s+TEXT NOT NULL`))
    }
    expect(sql).toContain("lifecycle_state IN ('APPROVED', 'REVOKED', 'LOST')")
    expect(sql).toContain("grace_exchange_count")
    expect(sql).not.toMatch(/enrollment_id[^,\n]*REFERENCES/i)
    expect(sql).not.toMatch(/private_key/i)
  })

  it("scopes rotation idempotency uniqueness to a device and grants the RLS policy", () => {
    const sql = migrationSql()
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_paired_devices_principal_workspace",
    )
    expect(sql).not.toContain(
      "CREATE INDEX IF NOT EXISTS idx_paired_devices_approved_count",
    )
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_paired_devices_rotation_idem")
    expect(sql).toContain("ON paired_devices (id, rotation_idempotency_key)")
    expect(sql).toContain("ALTER TABLE paired_devices FORCE ROW LEVEL SECURITY")
    expect(sql).toContain("CREATE POLICY paired_devices_policy")
    expect(sql).toContain("group_id = current_setting('app.current_group_id', true)")
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON paired_devices TO allura_app",
    )
  })
})

describeMigrationLive("Story 29.1 migration 061 live PostgreSQL enforcement", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("m061", "61-paired-devices.sql")
    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ('ws-061-a','allura-061-a','Workspace A'),
              ('ws-061-b','allura-061-b','Workspace B')`,
    )
    await db.owner.query(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id, enrollment_id)
       VALUES
         ('dev-061-a','user-061-a','allura-061-a','ws-061-a','Device A','pub-a','kid-a','enroll-a'),
         ('dev-061-b','user-061-b','allura-061-b','ws-061-b','Device B','pub-b','kid-b','enroll-b')`,
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it("records version 061 and enforces NOT NULL authority and lifecycle values", async () => {
    const versions = await db.owner.query(
      "SELECT version FROM schema_versions WHERE version = '061'",
    )
    expect(versions.rows).toEqual([{ version: "061" }])

    const columns = await db.owner.query(
      `SELECT column_name, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'paired_devices'
          AND column_name IN ('principal_id','group_id','workspace_id')
        ORDER BY column_name`,
    )
    expect(columns.rows).toEqual([
      { column_name: "group_id", is_nullable: "NO" },
      { column_name: "principal_id", is_nullable: "NO" },
      { column_name: "workspace_id", is_nullable: "NO" },
    ])

    await expect(
      db.owner.query(
        `INSERT INTO paired_devices
           (id, principal_id, group_id, workspace_id, display_label,
            current_public_key, current_key_id, lifecycle_state)
         VALUES ('dev-bad-state','user','allura-061-a','ws-061-a','Bad','pub','kid','PENDING')`,
      ),
    ).rejects.toThrow(/lifecycle_state/i)
  })

  it("keeps enrollment_id free of foreign-key constraints", async () => {
    const constraints = await db.owner.query(
      `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'paired_devices'
          AND c.contype = 'f'`,
    )
    expect(constraints.rows.map((row) => row.definition).join("\n")).not.toContain(
      "enrollment_id",
    )
  })

  it("enforces group RLS for reads and writes instead of blanket-denying table access", async () => {
    const app = await db.app.connect()
    try {
      await app.query("BEGIN")
      await app.query("SELECT set_config('app.current_group_id', $1, true)", [
        "allura-061-a",
      ])
      const visible = await app.query("SELECT id FROM paired_devices ORDER BY id")
      expect(visible.rows).toEqual([{ id: "dev-061-a" }])

      await expect(
        app.query(
          `INSERT INTO paired_devices
             (id, principal_id, group_id, workspace_id, display_label,
              current_public_key, current_key_id)
           VALUES ('dev-061-cross','user','allura-061-b','ws-061-b','Cross','pub','kid')`,
        ),
      ).rejects.toThrow(/row-level security/i)
      await app.query("ROLLBACK")
    } finally {
      app.release()
    }
  })

  it("allows reuse of a rotation idempotency key across devices", async () => {
    await db.owner.query(
      "UPDATE paired_devices SET rotation_idempotency_key = 'rotation-061' WHERE id = 'dev-061-a'",
    )
    await expect(
      db.owner.query(
        "UPDATE paired_devices SET rotation_idempotency_key = 'rotation-061' WHERE id = 'dev-061-b'",
      ),
    ).resolves.toBeDefined()
  })

  it("migration 068 replaces the deployed legacy global idempotency index", async () => {
    await db.owner.query("UPDATE paired_devices SET rotation_idempotency_key = NULL")
    await db.owner.query("DROP INDEX idx_paired_devices_rotation_idem")
    await db.owner.query(`CREATE UNIQUE INDEX idx_paired_devices_rotation_idem
      ON paired_devices (rotation_idempotency_key) WHERE rotation_idempotency_key IS NOT NULL`)
    await db.owner.query(
      "UPDATE paired_devices SET rotation_idempotency_key = 'rotation-068' WHERE id = 'dev-061-a'",
    )
    await expect(
      db.owner.query(
        "UPDATE paired_devices SET rotation_idempotency_key = 'rotation-068' WHERE id = 'dev-061-b'",
      ),
    ).rejects.toThrow(/idx_paired_devices_rotation_idem/i)

    await db.owner.query(readFileSync(idempotencyScopeMigrationPath, "utf8"))

    await expect(
      db.owner.query(
        "UPDATE paired_devices SET rotation_idempotency_key = 'rotation-068' WHERE id = 'dev-061-b'",
      ),
    ).resolves.toBeDefined()
  })
})
