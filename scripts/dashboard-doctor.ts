#!/usr/bin/env bun
/**
 * Dashboard demo doctor.
 *
 * Verifies the supported portfolio demo path end-to-end:
 *   1. The restricted app role can connect to PostgreSQL.
 *   2. RLS is enforced on a nonempty, app-role-owned scoped probe.
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
type AppScope = { groupId: string; workspaceId: string }

function loadEnv(): void {
  const envPath = process.env.ALLURA_PORTFOLIO_ENV_FILE || join(process.cwd(), ".env.portfolio")
  if (existsSync(envPath)) {
    const { config } = require("dotenv")
    // The selected demo file is the source of truth for its scoped database
    // proof; inherited shell values must not point doctor at another stack.
    config({ path: envPath, override: true })
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
  const scope: AppScope = {
    groupId: process.env.ALLURA_DEV_AUTH_GROUP_ID || "allura-system",
    workspaceId: process.env.ALLURA_DEV_AUTH_WORKSPACE_ID || "workspace-allura",
  }
  const runId = `dashboard-doctor-${Date.now()}-${process.pid}`
  const markerType = "dashboard_doctor_rls_probe"
  const auditType = "dashboard_doctor_audit"
  try {
    await client.connect()
    await client.query("BEGIN")
    await client.query("SELECT set_config('app.current_group_id', $1, true)", [scope.groupId])
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [scope.workspaceId])
    const marker = await client.query<{ id: string }>(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
       VALUES ($1, $2, $3, 'dashboard-doctor', 'completed', jsonb_build_object('run_id', $4::text, 'kind', 'rls-marker'))
       RETURNING id::text`,
      [scope.groupId, scope.workspaceId, markerType, runId],
    )
    const markerId = marker.rows[0]?.id
    if (!markerId) throw new Error("app-role RLS marker insert returned no id")

    const visible = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM events WHERE id = $1", [markerId])
    if (Number(visible.rows[0]?.count ?? 0) !== 1) throw new Error("app-role scoped marker is not visible in its intended group/workspace")

    await client.query("SELECT set_config('app.current_group_id', $1, true)", [`allura-doctor-other-${runId}`])
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [`workspace-doctor-other-${runId}`])
    const hidden = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM events WHERE id = $1", [markerId])
    if (Number(hidden.rows[0]?.count ?? -1) !== 0) throw new Error("app-role marker remained visible under a different RLS scope")

    await client.query("SELECT set_config('app.current_group_id', $1, true)", [scope.groupId])
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [scope.workspaceId])
    const audit = await client.query<{ id: string }>(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
       VALUES ($1, $2, $3, 'dashboard-doctor', 'completed', jsonb_build_object('run_id', $4::text, 'marker_event_id', $5::text, 'kind', 'durable-audit'))
       RETURNING id::text`,
      [scope.groupId, scope.workspaceId, auditType, runId, markerId],
    )
    const auditId = audit.rows[0]?.id
    if (!auditId) throw new Error("app-role audit insert returned no id")
    const durable = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM events WHERE id = $1 AND event_type = $2", [auditId, auditType])
    if (Number(durable.rows[0]?.count ?? 0) !== 1) throw new Error("durable app-role audit event was not readable after insertion")
    await client.query("COMMIT")
    return { name: "App-role RLS and audit proof", status: "ok", detail: `run ${runId}: scoped marker hidden cross-scope and durable audit event ${auditId} verified` }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    return { name: "App-role RLS and audit proof", status: "fail", detail: error instanceof Error ? error.message : String(error) }
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
