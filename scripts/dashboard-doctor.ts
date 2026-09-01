#!/usr/bin/env bun
/**
 * Dashboard demo doctor.
 *
 * Verifies the supported portfolio demo path end-to-end:
 *   1. The restricted app role can connect to PostgreSQL.
 *   2. RLS is enforced (a probe tenant sees zero rows, not the whole table).
 *   3. Every mapped live dashboard route returns HTTP 200 with a dev principal.
 *
 * Exits non-zero on any failure. Pass --json for machine-readable output.
 */

import { existsSync } from "node:fs"
import { join } from "node:path"

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/mission-control",
  "/dashboard/kanban",
  "/dashboard/search",
  "/dashboard/teams",
  "/dashboard/graph",
  "/dashboard/curator",
] as const

type Check = { name: string; status: "ok" | "fail"; detail?: string }

function loadEnv(): void {
  const envPath = join(process.cwd(), ".env.portfolio")
  if (existsSync(envPath)) {
    const { config } = require("dotenv")
    config({ path: envPath })
  }
}

async function checkAppRole(): Promise<Check> {
  const { Client } = await import("pg")
  const user = process.env.POSTGRES_APP_USER
  const password = process.env.POSTGRES_APP_PASSWORD
  if (!user || !password) {
    return { name: "App-role config", status: "fail", detail: "POSTGRES_APP_USER/POSTGRES_APP_PASSWORD are required" }
  }
  const client = new Client({
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
    database: process.env.POSTGRES_DB || "allura",
    user,
    password,
  })
  try {
    await client.connect()
    await client.query("SELECT 1")
    return { name: "App-role connectivity", status: "ok", detail: `${user}@${process.env.POSTGRES_HOST || "127.0.0.1"}` }
  } catch (error) {
    return { name: "App-role connectivity", status: "fail", detail: error instanceof Error ? error.message : String(error) }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function checkRls(): Promise<Check> {
  const { Client } = await import("pg")
  const user = process.env.POSTGRES_APP_USER
  const password = process.env.POSTGRES_APP_PASSWORD
  if (!user || !password) {
    return { name: "RLS enforcement", status: "fail", detail: "app-role config missing" }
  }
  const client = new Client({
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
    database: process.env.POSTGRES_DB || "allura",
    user,
    password,
  })
  try {
    await client.connect()
    await client.query("SET app.current_group_id = 'allura-doctor-probe'")
    await client.query("SET app.current_workspace_id = 'workspace-doctor-probe'")
    const result = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM events")
    const count = Number(result.rows[0]?.count ?? -1)
    if (count !== 0) {
      return { name: "RLS enforcement", status: "fail", detail: `probe tenant saw ${count} rows (RLS not isolating)` }
    }
    return { name: "RLS enforcement", status: "ok", detail: "probe tenant isolated to zero rows" }
  } catch (error) {
    return { name: "RLS enforcement", status: "fail", detail: error instanceof Error ? error.message : String(error) }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function checkHttp(route: string): Promise<Check> {
  const port = process.env.ALLURA_DASHBOARD_PORT || "3100"
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 200) {
      return { name: `HTTP ${route}`, status: "ok", detail: "200" }
    }
    return { name: `HTTP ${route}`, status: "fail", detail: `status ${response.status}` }
  } catch (error) {
    return { name: `HTTP ${route}`, status: "fail", detail: error instanceof Error ? error.message : String(error) }
  }
}

async function main(): Promise<void> {
  loadEnv()
  const json = process.argv.includes("--json")
  const checks: Check[] = []

  checks.push(await checkAppRole())
  checks.push(await checkRls())
  for (const route of DASHBOARD_ROUTES) {
    checks.push(await checkHttp(route))
  }

  const failed = checks.filter((c) => c.status === "fail")
  if (json) {
    console.log(JSON.stringify({ checks, overall: failed.length === 0 ? "ok" : "fail" }))
  } else {
    for (const check of checks) {
      const icon = check.status === "ok" ? "✅" : "❌"
      console.log(`  ${icon} ${check.name}: ${check.detail ?? check.status}`)
    }
  }

  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
