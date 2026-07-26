/**
 * Connection Management for Canonical MCP Tools
 *
 * Manages PostgreSQL and Neo4j singleton connections.
 * dotenv config is loaded here since connection setup needs env vars.
 */

import { parse } from "dotenv"
import neo4j, { Driver } from "neo4j-driver"
import { Pool } from "pg"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { resetBudgetState } from "./budget-circuit"

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

let pgPool: Pool | null = null
let neo4jDriver: Driver | null = null

export async function getConnections(): Promise<{ pg: Pool; neo4j: Driver | null }> {
  if (!pgPool) {
    const pgPassword = process.env.POSTGRES_PASSWORD
    if (!pgPassword) {
      throw new Error("POSTGRES_PASSWORD environment variable is required")
    }
    pgPool = new Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      database: process.env.POSTGRES_DB || "memory",
      user: process.env.POSTGRES_USER || "allura",
      password: pgPassword,
      connectionTimeoutMillis: 10000,
      max: 10,
    })
  }

  // Neo4j is optional — skip driver creation when GRAPH_BACKEND=ruvector (AD-49)
  const graphBackend = process.env.GRAPH_BACKEND?.toLowerCase() || "ruvector"
  if (graphBackend === "ruvector" || graphBackend === "ruvector-crate") {
    // PostgreSQL-only mode — no Neo4j driver needed
    return { pg: pgPool, neo4j: null }
  }

  // Neo4j mode — driver required
  if (!neo4jDriver) {
    const password = process.env.NEO4J_PASSWORD;
    if (!password) {
      throw new Error("NEO4J_PASSWORD environment variable is required");
    }
    neo4jDriver = neo4j.driver(
      process.env.NEO4J_URI || "bolt://localhost:7687",
      neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", password),
      { maxConnectionPoolSize: 50 }
    )
  }

  return { pg: pgPool, neo4j: neo4jDriver }
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
  if (neo4jDriver) {
    neo4jDriver.close().catch(() => {})
    neo4jDriver = null
  }
  resetBudgetState()
}

/**
 * Close cached connections and wait for their resources to terminate.
 * Intended for scripts and graceful process shutdown.
 */
export async function closeConnections(): Promise<void> {
  const pg = pgPool
  const graph = neo4jDriver
  pgPool = null
  neo4jDriver = null

  await Promise.allSettled([pg?.end(), graph?.close()])
  resetBudgetState()
}
