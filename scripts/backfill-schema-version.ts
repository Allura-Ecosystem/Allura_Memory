#!/usr/bin/env bun
/**
 * Backfill Schema Version (FR-1, FR-2, NFR-3)
 *
 * Sets schema_version = 1 on all existing rows where null.
 * This script is idempotent — safe to re-run.
 *
 * Usage:
 *   bun run scripts/backfill-schema-version.ts
 *
 * Environment:
 *   DATABASE_URL       — Main PostgreSQL connection string
 *   RUVECTOR_DATABASE_URL — RuVector PostgreSQL connection string (or same as DATABASE_URL)
 */

import { Pool } from "pg"

const SCHEMA_VERSION = 1

async function backfillPostgres(pool: Pool, tableName: string): Promise<number> {
  console.log(`[backfill] Checking ${tableName} for rows needing schema_version...`)

  // Count rows needing backfill
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM ${tableName} WHERE schema_version IS NULL OR schema_version != $1`,
    [SCHEMA_VERSION]
  )
  const needsBackfill = parseInt(countResult.rows[0].count, 10)

  if (needsBackfill === 0) {
    console.log(`[backfill] ${tableName}: all rows already at schema_version = ${SCHEMA_VERSION}`)
    return 0
  }

  console.log(`[backfill] ${tableName}: ${needsBackfill} rows need backfill`)

  // Update rows — idempotent, sets version to current
  const updateResult = await pool.query(
    `UPDATE ${tableName} SET schema_version = $1 WHERE schema_version IS NULL OR schema_version != $1`,
    [SCHEMA_VERSION]
  )

  const updated = updateResult.rowCount ?? 0
  console.log(`[backfill] ${tableName}: ${updated} rows updated to schema_version = ${SCHEMA_VERSION}`)

  // Verify
  const verifyResult = await pool.query(
    `SELECT schema_version, COUNT(*) as count FROM ${tableName} GROUP BY schema_version ORDER BY schema_version`
  )
  console.log(`[backfill] ${tableName} verification:`, verifyResult.rows)

  return updated
}

async function main(): Promise<void> {
  console.log("[backfill] Starting schema version backfill...")
  console.log(`[backfill] Target schema_version: ${SCHEMA_VERSION}`)

  // ── PostgreSQL: events table ──────────────────────────────────────────────
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[backfill] ERROR: DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const mainPool = new Pool({ connectionString: databaseUrl })

  try {
    await backfillPostgres(mainPool, "events")
  } catch (err) {
    console.error("[backfill] Error backfilling events:", err)
  }

  // ── PostgreSQL: allura_memories table (RuVector) ──────────────────────────
  const ruvectorUrl = process.env.RUVECTOR_DATABASE_URL || databaseUrl
  const ruvectorPool = ruvectorUrl === databaseUrl ? mainPool : new Pool({ connectionString: ruvectorUrl })

  try {
    await backfillPostgres(ruvectorPool, "allura_memories")
  } catch (err) {
    console.error("[backfill] Error backfilling allura_memories:", err)
  }

  if (ruvectorPool !== mainPool) {
    await ruvectorPool.end()
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await mainPool.end()

  console.log("[backfill] Backfill complete!")
}

main().catch((err) => {
  console.error("[backfill] Fatal error:", err)
  process.exit(1)
})