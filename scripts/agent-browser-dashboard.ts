#!/usr/bin/env bun
/**
 * Dashboard browser walkthrough + evidence capture.
 *
 * This deliberately drives the installed agent-browser CLI rather than a
 * Playwright client. A route is eligible for a screenshot only after both the
 * HTTP probe and browser session prove it did not redirect, error, or omit a
 * required manifest entry.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { config } from "dotenv"

import { dashboardEvidenceFailures, isSettledDashboardSnapshot } from "./dashboard-evidence-contract"

const DASHBOARD_ROUTES = [
  { route: "/dashboard", name: "overview" },
  { route: "/dashboard/mission-control", name: "mission-control" },
  { route: "/dashboard/kanban", name: "kanban" },
  { route: "/dashboard/search", name: "search" },
  { route: "/dashboard/teams", name: "teams" },
  { route: "/dashboard/graph", name: "graph" },
  { route: "/dashboard/curator", name: "curator" },
] as const

type RouteEvidence = {
  route: string
  name: string
  status: number
  finalUrl: string
  redirected: boolean
  consoleErrors: string[]
  pageErrors: string[]
  screenshot: string | null
  snapshot: string | null
  ok: boolean
}

function runAgentBrowser(session: string, args: string[]): string {
  const result = Bun.spawnSync({
    cmd: ["agent-browser", "--session", session, ...args],
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = new TextDecoder().decode(result.stdout)
  const stderr = new TextDecoder().decode(result.stderr)
  if (result.exitCode !== 0) {
    throw new Error(`agent-browser ${args.join(" ")} failed: ${(stderr || stdout).trim()}`)
  }
  return stdout.trim()
}

function errorLines(output: string, source: "console" | "page"): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length === 0 || !/^\[[a-z]+\]/i.test(line)) return false
      return source === "console" ? /^\[error\]/i.test(line) : /^\[(error|pageerror)\]/i.test(line)
    })
}

function artifactDir(): string {
  const dir = join(process.cwd(), "artifacts", "dashboard-demo")
  mkdirSync(dir, { recursive: true })
  return dir
}

async function waitForSettledSnapshot(session: string): Promise<string> {
  let snapshot = ""
  // A cold local Next compile plus the curator queue request can take longer
  // than the former five-second window. Keep the evidence gate fail-closed,
  // but allow a bounded fifteen seconds for the supported local stack.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    snapshot = runAgentBrowser(session, ["snapshot"])
    if (isSettledDashboardSnapshot(snapshot)) return snapshot
    await Bun.sleep(250)
  }
  throw new Error("dashboard route did not settle before evidence capture")
}

function loadPortfolioEnv(): void {
  const envPath = process.env.ALLURA_PORTFOLIO_ENV_FILE || join(process.cwd(), ".env.portfolio")
  if (existsSync(envPath)) config({ path: envPath, override: true })
}

async function probe(url: string): Promise<number> {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) })
  return response.status
}

async function main(): Promise<void> {
  loadPortfolioEnv()
  const port = process.env.ALLURA_DASHBOARD_PORT || "3100"
  const base = `http://127.0.0.1:${port}`
  const dir = artifactDir()
  const session = `allura-dashboard-${process.pid}`
  const evidence: RouteEvidence[] = []

  try {
    runAgentBrowser(session, ["set", "media", "light"])
    for (const { route, name } of DASHBOARD_ROUTES) {
      const target = `${base}${route}`
      let status = 0
      let finalUrl = ""
      let consoleErrors: string[] = []
      let pageErrors: string[] = []
      let snapshot: string | null = null
      let screenshot: string | null = null

      try {
        status = await probe(target)
        runAgentBrowser(session, ["console", "--clear"])
        runAgentBrowser(session, ["errors", "--clear"])
        runAgentBrowser(session, ["open", target])
        finalUrl = runAgentBrowser(session, ["get", "url"])
        const snapshotName = `${name}.snapshot.txt`
        const snapshotText = await waitForSettledSnapshot(session)
        writeFileSync(join(dir, snapshotName), `${snapshotText}\n`)
        snapshot = snapshotName
        consoleErrors = errorLines(runAgentBrowser(session, ["console"]), "console")
        pageErrors = errorLines(runAgentBrowser(session, ["errors"]), "page")
        pageErrors.push(...dashboardEvidenceFailures(snapshotText))

        const redirected = finalUrl !== target
        const clean = status === 200 && !redirected && consoleErrors.length === 0 && pageErrors.length === 0
        if (clean) {
          screenshot = `${name}.png`
          runAgentBrowser(session, ["screenshot", "--full", join(dir, screenshot)])
        }
      } catch (error) {
        pageErrors = [error instanceof Error ? error.message : String(error)]
      }

      const redirected = finalUrl !== "" && finalUrl !== target
      evidence.push({
        route,
        name,
        status,
        finalUrl,
        redirected,
        consoleErrors,
        pageErrors,
        screenshot,
        snapshot,
        ok: status === 200 && !redirected && consoleErrors.length === 0 && pageErrors.length === 0 && screenshot !== null && snapshot !== null,
      })
    }
  } finally {
    try {
      runAgentBrowser(session, ["close", "--all"])
    } catch {
      // Browser cleanup must not erase route failure evidence.
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    base,
    routes: evidence,
    summary: { total: evidence.length, ok: evidence.filter((entry) => entry.ok).length, failed: evidence.filter((entry) => !entry.ok).length },
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2))

  const malformed = evidence.length !== DASHBOARD_ROUTES.length || evidence.some((entry) => !entry.snapshot)
  const failed = evidence.filter((entry) => !entry.ok)
  for (const entry of evidence) console.log(`  ${entry.ok ? "✅" : "❌"} ${entry.route} → ${entry.status}${entry.redirected ? " (redirected)" : ""}`)
  if (failed.length > 0 || malformed) {
    for (const entry of failed) if (entry.screenshot) rmSync(join(dir, entry.screenshot), { force: true })
    throw new Error(`${failed.length} route(s) failed or the evidence manifest is incomplete; failed routes have no screenshots.`)
  }
  console.log(`\n✅ ${evidence.length} routes captured with agent-browser; manifest at ${join(dir, "manifest.json")}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
