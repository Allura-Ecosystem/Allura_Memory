import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migrationDir = join(process.cwd(), "docker/postgres-init")
const legacyDuplicatePrefixes = new Set(["00", "17", "20", "31"])

function migrationFiles(): string[] {
  return readdirSync(migrationDir).filter((name) => /^\d+-.*\.sql$/.test(name)).sort()
}

describe("PostgreSQL migration identity registry", () => {
  it("rejects new duplicate numeric filename prefixes except explicit historical exceptions", () => {
    const grouped = new Map<string, string[]>()
    for (const file of migrationFiles()) {
      const prefix = file.match(/^(\d+)-/)?.[1]
      if (!prefix) continue
      grouped.set(prefix, [...(grouped.get(prefix) ?? []), file])
    }
    const unexpected = [...grouped].filter(([prefix, files]) => files.length > 1 && !legacyDuplicatePrefixes.has(prefix))
    expect(unexpected).toEqual([])
  })

  it("rejects duplicate schema ledger identities except the same explicit historical exceptions", () => {
    const grouped = new Map<string, string[]>()
    for (const file of migrationFiles()) {
      const sql = readFileSync(join(migrationDir, file), "utf8")
      const identities = Array.from(
        sql.matchAll(/INSERT\s+INTO\s+schema_versions[\s\S]{0,500}?(?:VALUES\s*\(\s*|SELECT\s+)['"](\d+)['"]/gi),
        (match) => match[1],
      )
      for (const identity of new Set(identities)) {
        grouped.set(identity, [...(grouped.get(identity) ?? []), file])
      }
    }
    const unexpected = Array.from(grouped.entries()).filter(
      ([identity, files]) => files.length > 1 && !legacyDuplicatePrefixes.has(identity),
    )
    expect(unexpected).toEqual([])
  })

  it("reserves 071 and gives reviewed-version DDL unique identity 072 with a pre-DDL collision check", () => {
    const files = migrationFiles()
    expect(files).not.toContain("71-reviewed-proposal-version.sql")
    expect(files).toContain("72-reviewed-proposal-version.sql")
    const sql = readFileSync(join(migrationDir, "72-reviewed-proposal-version.sql"), "utf8")
    const collisionCheck = sql.indexOf("SELECT TRUE, description INTO existing_found, existing_description")
    const ddl = sql.indexOf("ALTER TABLE governance_receipts")
    expect(collisionCheck).toBeGreaterThanOrEqual(0)
    expect(collisionCheck).toBeLessThan(ddl)
    expect(sql).toContain("SELECT '072', 'Persist the exact human-reviewed proposal version on governance receipts'")
    expect(sql).not.toMatch(/ON CONFLICT\s*\(version\)\s*DO NOTHING/i)
    expect(sql).toContain("existing_description IS DISTINCT FROM")
    expect(sql).toMatch(/RAISE EXCEPTION.*migration 072/i)
  })
})
