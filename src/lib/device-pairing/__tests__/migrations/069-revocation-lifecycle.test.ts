import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./postgres-test-harness"

const migrationPath = path.resolve(
  process.cwd(),
  "docker/postgres-init/69-device-revocation-lifecycle.sql",
)

const liveDbConfigPath = path.resolve(process.cwd(), "vitest.config.live-db.ts")

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8")
}

describe("Story 29.15 migration 069 revocation lifecycle contract", () => {
  it("adds an ordered atomic migration", () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = migrationSql()
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("VALUES ('069',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("exposes only a same-tenant lifecycle bootstrap resolver to allura_app", () => {
    const sql = migrationSql()
    expect(sql).toMatch(/FUNCTION resolve_device_lifecycle_context\(\s*p_device_id TEXT,\s*p_group_id TEXT\s*\)/)
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = pg_catalog, public/)
    expect(sql).toContain("WHERE d.id = p_device_id")
    expect(sql).toContain("AND p_group_id = current_setting('app.current_group_id', true)")
    expect(sql).toContain("AND d.group_id = p_group_id")
    expect(sql).not.toMatch(/RETURNS TABLE \([\s\S]*lifecycle_state TEXT/)
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION resolve_device_lifecycle_context(TEXT, TEXT) FROM PUBLIC")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION resolve_device_lifecycle_context(TEXT, TEXT) TO allura_app")
  })

  it("makes REVOKED and LOST terminal at the database boundary", () => {
    const sql = migrationSql()
    expect(sql).toContain("FUNCTION paired_devices_reject_terminal_lifecycle_transition()")
    expect(sql).toContain("OLD.lifecycle_state IN ('REVOKED', 'LOST')")
    expect(sql).toContain("NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state")
    expect(sql).toContain("TRIGGER trg_paired_devices_terminal_lifecycle")
    expect(sql).toContain("BEFORE UPDATE OF lifecycle_state ON paired_devices")
  })

  it("registers the lifecycle migration enforcement test in the live-DB inventory", () => {
    expect(readFileSync(liveDbConfigPath, "utf8")).toContain(
      "src/lib/device-pairing/__tests__/migrations/069-revocation-lifecycle.test.ts",
    )
  })
})

describeMigrationLive("Story 29.15 migration 069 live PostgreSQL enforcement", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("m069", "69-device-revocation-lifecycle.sql")
    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ('ws-069-a', 'allura-069-a', 'Workspace A'),
              ('ws-069-b', 'allura-069-b', 'Workspace B')`,
    )
    await db.owner.query(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id, lifecycle_state)
       VALUES
         ('dev-069-approved', 'human-a', 'allura-069-a', 'ws-069-a', 'Approved', 'pub-a', 'kid-a', 'APPROVED'),
         ('dev-069-revoked', 'human-a', 'allura-069-a', 'ws-069-a', 'Revoked', 'pub-r', 'kid-r', 'REVOKED'),
         ('dev-069-lost', 'human-b', 'allura-069-b', 'ws-069-b', 'Lost', 'pub-l', 'kid-l', 'LOST')`,
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it("bootstraps lifecycle authority only for the caller's already-authenticated tenant", async () => {
    const client = await db.app.connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT set_config('app.current_group_id', $1, true)", ["allura-069-a"])
      const sameTenant = await client.query(
        "SELECT * FROM resolve_device_lifecycle_context($1, $2)",
        ["dev-069-revoked", "allura-069-a"],
      )
      const crossTenant = await client.query(
        "SELECT * FROM resolve_device_lifecycle_context($1, $2)",
        ["dev-069-lost", "allura-069-a"],
      )
      const suppliedOtherTenant = await client.query(
        "SELECT * FROM resolve_device_lifecycle_context($1, $2)",
        ["dev-069-lost", "allura-069-b"],
      )
      const missing = await client.query(
        "SELECT * FROM resolve_device_lifecycle_context($1, $2)",
        ["dev-069-missing", "allura-069-a"],
      )

      expect(sameTenant.rows).toEqual([{
        group_id: "allura-069-a",
        workspace_id: "ws-069-a",
        principal_id: "human-a",
      }])
      expect(crossTenant.rows).toEqual([])
      expect(suppliedOtherTenant.rows).toEqual([])
      expect(missing.rows).toEqual([])
    } finally {
      await client.query("ROLLBACK")
      client.release()
    }
  })

  it("rejects direct SQL restoration and terminal-state switching", async () => {
    await expect(db.owner.query(
      "UPDATE paired_devices SET lifecycle_state = 'APPROVED' WHERE id = 'dev-069-revoked'",
    )).rejects.toThrow(/terminal/i)
    await expect(db.owner.query(
      "UPDATE paired_devices SET lifecycle_state = 'LOST' WHERE id = 'dev-069-revoked'",
    )).rejects.toThrow(/terminal/i)
    await expect(db.owner.query(
      "UPDATE paired_devices SET lifecycle_state = 'APPROVED' WHERE id = 'dev-069-lost'",
    )).rejects.toThrow(/terminal/i)

    const states = await db.owner.query(
      "SELECT id, lifecycle_state FROM paired_devices WHERE id IN ('dev-069-revoked', 'dev-069-lost') ORDER BY id",
    )
    expect(states.rows).toEqual([
      { id: "dev-069-lost", lifecycle_state: "LOST" },
      { id: "dev-069-revoked", lifecycle_state: "REVOKED" },
    ])
  })
})
