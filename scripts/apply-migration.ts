/**
 * apply-migration.ts — controlled, explicit migration applier.
 *
 * Applies ONLY the SQL files named on the command line, in order, against the
 * live PostgreSQL configured by .env / .env.local. This is the in-policy path
 * for DDL: it uses the application's own pooled connection (src/lib/postgres/
 * connection.ts), not `docker exec`.
 *
 * The migrations it is intended for are additive and idempotent
 * (CREATE TABLE/INDEX IF NOT EXISTS), so re-running is safe and no existing
 * row is ever mutated.
 *
 * Usage:
 *   bun scripts/apply-migration.ts docker/postgres-init/25-process-engine.sql docker/postgres-init/26-work-plane.sql
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { closePool, getPool } from "../src/lib/postgres/connection"

async function main(): Promise<void> {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("FAIL: no migration files supplied")
    console.error(
      "Usage: bun scripts/apply-migration.ts <file.sql> [<file.sql> ...]",
    )
    process.exit(1)
  }

  const pool = getPool()

  for (const file of files) {
    const path = resolve(process.cwd(), file)
    const sql = readFileSync(path, "utf8")
    console.log(`Applying: ${file} (${sql.length} bytes)`)
    await pool.query(sql)
    console.log(`  OK: ${file}`)
  }

  await closePool()
  console.log("PASS: all migrations applied.")
}

main().catch(async (err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err))
  await closePool().catch(() => {})
  process.exit(1)
})
