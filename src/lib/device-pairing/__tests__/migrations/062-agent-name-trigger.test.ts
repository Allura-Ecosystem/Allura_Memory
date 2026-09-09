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
  "docker/postgres-init/62-mcp-tokens-paired-device.sql",
)

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8")
}

describe("Story 29.1 migration 062 device-token invariant contract", () => {
  it("uses the repository-safe filename and records logical schema version 062 atomically", () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = migrationSql()
    expect(sql).toMatch(/\nBEGIN;\n/)
    expect(sql).toContain("VALUES ('062',")
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true)
  })

  it("adds nullable paired-device linkage and one-active-token uniqueness", () => {
    const sql = migrationSql()
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS paired_device_id TEXT REFERENCES paired_devices(id)",
    )
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_one_active_per_device",
    )
    expect(sql).toContain("WHERE paired_device_id IS NOT NULL")
    expect(sql).toContain("AND revoked_at IS NULL")
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_mcp_tokens_paired_device")
  })

  it("defines a deferred constraint trigger for human-principal identity", () => {
    const sql = migrationSql()
    expect(sql).toContain(
      "Intentionally SECURITY INVOKER: paired_devices RLS must enforce the active tenant.",
    )
    expect(sql).toContain("FUNCTION verify_device_token_agent_name()")
    expect(sql).toContain("NEW.agent_name IS DISTINCT FROM expected_principal")
    expect(sql).toContain("CREATE CONSTRAINT TRIGGER trg_mcp_tokens_device_agent_name")
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED")
    expect(sql).toContain(
      "AFTER INSERT OR UPDATE OF agent_name, paired_device_id ON mcp_tokens",
    )
  })
})

describeMigrationLive("Story 29.1 migration 062 live PostgreSQL enforcement", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("m062", "62-mcp-tokens-paired-device.sql")
    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ('ws-062','allura-062','Workspace 062')`,
    )
    await db.owner.query(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id)
       VALUES ('dev-062','human-062','allura-062','ws-062','Device 062','pub','kid')`,
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it("records version 062 and installs a nullable foreign key", async () => {
    const versions = await db.owner.query(
      "SELECT version FROM schema_versions WHERE version = '062'",
    )
    expect(versions.rows).toEqual([{ version: "062" }])

    const column = await db.owner.query(
      `SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mcp_tokens'
          AND column_name = 'paired_device_id'`,
    )
    expect(column.rows).toEqual([{ is_nullable: "YES" }])
  })

  it("defers the device principal check until COMMIT and then rejects a mismatch", async () => {
    const client = await db.owner.connect()
    try {
      await client.query("BEGIN")
      await expect(
        client.query(
          `INSERT INTO mcp_tokens
             (id, group_id, workspace_id, agent_name, token_prefix, token_hash, paired_device_id)
           VALUES ('token-062-bad','allura-062','ws-062','wrong-human','pfx-062-bad','hash','dev-062')`,
        ),
      ).resolves.toBeDefined()
      await expect(client.query("COMMIT")).rejects.toThrow(
        /does not match paired_devices\.principal_id/i,
      )
    } finally {
      await client.query("ROLLBACK").catch(() => undefined)
      client.release()
    }
  })

  it("leaves non-device tokens unaffected", async () => {
    await expect(
      db.owner.query(
        `INSERT INTO mcp_tokens
           (id, group_id, workspace_id, agent_name, token_prefix, token_hash)
         VALUES ('token-062-agent','allura-062','ws-062','service-agent','pfx-062-agent','hash')`,
      ),
    ).resolves.toBeDefined()
  })

  it("allows only one non-revoked token per paired device", async () => {
    await db.owner.query(
      `INSERT INTO mcp_tokens
         (id, group_id, workspace_id, agent_name, token_prefix, token_hash, paired_device_id)
       VALUES ('token-062-live-a','allura-062','ws-062','human-062','pfx-062-a','hash','dev-062')`,
    )
    await expect(
      db.owner.query(
        `INSERT INTO mcp_tokens
           (id, group_id, workspace_id, agent_name, token_prefix, token_hash, paired_device_id)
         VALUES ('token-062-live-b','allura-062','ws-062','human-062','pfx-062-b','hash','dev-062')`,
      ),
    ).rejects.toThrow(/idx_mcp_tokens_one_active_per_device/i)
  })
})
