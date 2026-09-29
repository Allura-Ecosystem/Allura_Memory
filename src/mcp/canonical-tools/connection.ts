/**
 * Connection Management for Canonical MCP Tools
 *
 * Manages the PostgreSQL singleton connection (also hosts the RuVector semantic layer).
 * dotenv config is loaded here since connection setup needs env vars.
 */

import { parse } from "dotenv"

import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { resetBudgetState } from "./budget-circuit"
import { getAppPool, resetAppPoolSingleton } from "@/lib/postgres/connection"

// Load base config plus local overrides without clobbering already-injected
// runtime environment variables. This keeps Docker/CI/Varlock injection
// authoritative while still allowing .env.local to override .env on disk.
function loadEnvFiles(): void {
  const merged: Record<string, string> = {}

  for (const file of [".env", ".env.local"]) {
    const envPath = join(/* turbopackIgnore: true */ process.cwd(), file)
    if (!existsSync(envPath)) continue
    Object.assign(merged, parse(readFileSync(envPath)))
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

loadEnvFiles()

// ── Connection Management ─────────────────────────────────────────────────

let pgPool: import("pg").Pool | null = null

export async function getConnections(): Promise<{ pg: import("pg").Pool }> {
  if (!pgPool) {
    pgPool = getAppPool()
  }

  return { pg: pgPool }
}

/**
 * Reset cached connections. Used in tests to force reconnection
 * after changing environment variables.
 */
export function resetConnections(): void {
  if (pgPool) {
    pgPool.end().catch(() => {})
    pgPool = null
  }
  // Drop the upstream singleton too — it points at the pool we just ended.
  // Without this, the next getAppPool() returns the dead instance.
  resetAppPoolSingleton()
  resetBudgetState()
}

/**
 * Close cached connections and wait for their resources to terminate.
 * Intended for scripts and graceful process shutdown.
 */
export async function closeConnections(): Promise<void> {
  const pg = pgPool
  pgPool = null

  await pg?.end()
  resetBudgetState()
}
