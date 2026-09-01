import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { ensurePortfolioEnvironment } from "../../scripts/portfolio-demo-env"
import { dashboardEvidenceFailures, isSettledDashboardSnapshot } from "../../scripts/dashboard-evidence-contract"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("portfolio demo tooling", () => {
  it("creates .env.portfolio from its non-secret example only when absent", () => {
    const directory = mkdtempSync(join(tmpdir(), "allura-portfolio-env-"))
    temporaryDirectories.push(directory)
    writeFileSync(join(directory, ".env.portfolio.example"), "POSTGRES_PASSWORD=local-demo-only\n")

    expect(ensurePortfolioEnvironment(directory)).toBe("created")
    expect(readFileSync(join(directory, ".env.portfolio"), "utf8")).toBe("POSTGRES_PASSWORD=local-demo-only\n")
    expect(ensurePortfolioEnvironment(directory)).toBe("existing")
  })

  it("uses a build-time initializer image and a strictly mount-free disposable database", () => {
    const compose = readFileSync("docker-compose.portfolio.yml", "utf8")
    const dockerfile = readFileSync("docker/portfolio-postgres/Dockerfile", "utf8")

    expect(compose).toContain("dockerfile: docker/portfolio-postgres/Dockerfile")
    expect(compose).not.toContain("./docker/postgres-init:/docker-entrypoint-initdb.d")
    expect(compose).not.toMatch(/^\s*volumes:/m)
    expect(compose).toContain("tmpfs:")
    expect(compose).toContain("- /var/lib/postgresql/data")
    expect(compose).not.toContain("container_name:")
    expect(compose).toContain('"127.0.0.1:${PORTFOLIO_POSTGRES_PORT:-5433}:5432"')
    expect(dockerfile).toContain("COPY docker/postgres-init/ /docker-entrypoint-initdb.d/")
    expect(dockerfile).toContain("COPY docker/portfolio-postgres/99-portfolio-demo-workspace.sql")
  })

  it("recreates the portfolio database rather than preserving a prior container", () => {
    const launcher = readFileSync("scripts/portfolio-demo.ts", "utf8")

    expect(launcher).toContain('"--force-recreate"')
  })

  it("uses agent-browser and rejects the retired Playwright capture client", () => {
    const capture = readFileSync("scripts/agent-browser-dashboard.ts", "utf8")
    expect(capture).toContain('"agent-browser"')
    expect(capture).toContain("loadPortfolioEnv()")
    expect(capture).toContain("ALLURA_PORTFOLIO_ENV_FILE")
    expect(capture).toContain('config({ path: envPath, override: true })')
    expect(capture).not.toContain('from "playwright"')
    expect(capture).toContain("redirect: \"manual\"")
    expect(capture).toContain("consoleErrors.length === 0")
    expect(capture).toContain("pageErrors.length === 0")
    expect(capture).toContain("evidence.length !== DASHBOARD_ROUTES.length")
  })

  it("rejects degraded, errored, unavailable, and unsettled browser evidence", () => {
    for (const snapshot of [
      '<div data-surface-state="degraded">Data temporarily unavailable.</div>',
      '<div data-surface-state="error">This surface could not load.</div>',
      '<div data-source-state="loading">Loading the governed proposal queue…</div>',
      '<div data-source-state="error"><strong>Queue unavailable</strong></div>',
      '<section data-shell-state="error">Curator workflow access is unavailable because audit recording failed.</section>',
      '<section data-shell-state="partial">Curator workflow data is partial.</section>',
      '<section data-shell-state="degraded">Curator workflow data is degraded.</section>',
    ]) {
      expect(dashboardEvidenceFailures(snapshot)).not.toEqual([])
      expect(isSettledDashboardSnapshot(snapshot)).toBe(false)
    }
  })

  it("permits truthful empty data and the documented optional module-disabled state", () => {
    expect(dashboardEvidenceFailures('<div data-surface-state="empty">No governed records yet.</div>')).toEqual([])
    expect(dashboardEvidenceFailures('<section data-shell-state="degraded">Bumblebee is currently unavailable.</section>')).toEqual([])
  })

  it("keeps doctor proof app-role scoped, nonempty, cross-scope, and append-only", () => {
    const doctor = readFileSync("scripts/dashboard-doctor.ts", "utf8")
    expect(doctor).toContain("ALLURA_DEV_AUTH_GROUP_ID")
    expect(doctor).toContain("ALLURA_PORTFOLIO_ENV_FILE")
    expect(doctor).toContain("config({ path: envPath, override: true })")
    expect(doctor).toContain("ALLURA_DEV_AUTH_WORKSPACE_ID")
    expect(doctor).toContain("dashboard_doctor_rls_probe")
    expect(doctor).toContain("dashboard_doctor_audit")
    expect(doctor).toContain("marker remained visible under a different RLS scope")
    expect(doctor).toContain("durable app-role audit event")
    expect(doctor).not.toMatch(/DELETE\s+FROM\s+events/i)
  })

  it("keeps the checked-in example non-secret and enables the explicit local demo auth mode", () => {
    const example = readFileSync(".env.portfolio.example", "utf8")
    expect(example).toContain("ALLURA_DEMO_DEV_AUTH_FORCE=true")
    expect(example).not.toContain("<required")
    expect(existsSync(".env.portfolio.example")).toBe(true)
  })
})
