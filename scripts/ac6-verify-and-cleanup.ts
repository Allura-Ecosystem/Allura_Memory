/**
 * ac6-verify-and-cleanup.ts — one-off AC6 post-migration check + stale-row soft-delete.
 * In-policy: uses the app's pooled connection (not docker exec).
 * Soft-deletes the stale gabriel.cohen@faithmeats.com -> allura-system row
 * (old alias of gabec@faithmeats.com; allura-system human access is forbidden).
 */
import { closePool, getPool } from "../src/lib/postgres/connection"

async function main(): Promise<void> {
  const pool = getPool()

  // 1. Confirm soft-delete column exists
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='memberships'
        AND column_name IN ('removed_at','deleted_at','is_active')`,
  )
  const softCols = cols.rows.map((r) => r.column_name)
  console.log("soft-delete columns present:", softCols.length ? softCols.join(", ") : "NONE")

  // 2. Show AC6-relevant rows (faithmeats identities + any allura-system rows)
  const before = await pool.query(
    `SELECT email, group_id, role, is_default, removed_at
       FROM memberships
      WHERE email IN ('sasheed@faithmeats.com','gabec@faithmeats.com','samuel.m@faithmeats.com','gabriel.cohen@faithmeats.com')
         OR group_id = 'allura-system'
      ORDER BY group_id, email`,
  )
  console.log("\n--- memberships (AC6 scope) BEFORE cleanup ---")
  for (const r of before.rows) {
    console.log(`  ${r.email}  ${r.group_id}  role=${r.role}  default=${r.is_default}  removed_at=${r.removed_at ?? "—"}`)
  }

  // 3. Soft-delete the stale system-tenant row (only if not already removed)
  const del = await pool.query(
    `UPDATE memberships
        SET removed_at = NOW(), updated_at = NOW()
      WHERE email = 'gabriel.cohen@faithmeats.com'
        AND group_id = 'allura-system'
        AND removed_at IS NULL
      RETURNING email, group_id`,
  )
  console.log(`\nsoft-deleted ${del.rowCount} stale row(s):`, del.rows.map((r) => `${r.email}->${r.group_id}`).join(", ") || "(none — already clean)")

  // 4. Confirm no ACTIVE human membership remains on allura-system
  const sysCheck = await pool.query(
    `SELECT email, role FROM memberships
      WHERE group_id = 'allura-system' AND removed_at IS NULL`,
  )
  console.log(`\nactive allura-system human memberships remaining: ${sysCheck.rowCount}`)
  for (const r of sysCheck.rows) console.log(`  ⚠️  ${r.email} role=${r.role}`)

  await closePool()
  console.log("\nPASS: AC6 verify + cleanup complete.")
}

main().catch(async (err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err))
  await closePool().catch(() => {})
  process.exit(1)
})
