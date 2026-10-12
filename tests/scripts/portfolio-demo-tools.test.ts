import { afterEach, describe, expect, it } from "vitest"

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { browserDiagnosticErrors, browserSnapshot, dashboardEvidenceFailures, isSettledDashboardSnapshot } from "../../scripts/dashboard-evidence-contract"
import { ensurePortfolioEnvironment } from "../../scripts/portfolio-demo-env"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("portfolio demo tooling", () => {
  it("closes only its owned session and captures both explicit viewports", () => {
    const capture = readFileSync("scripts/agent-browser-dashboard.ts", "utf8")
    expect(capture).not.toContain('"close", "--all"')
    expect(capture).toContain('runAgentBrowser(session, ["close"])')
    expect(capture).toContain('{ name: "desktop", width: 1440, height: 1000 }')
    expect(capture).toContain('{ name: "mobile", width: 390, height: 844 }')
    expect(capture).toContain('for (const viewport of VIEWPORTS)')
    expect(capture).toContain('["set", "viewport", String(viewport.width), String(viewport.height)]')
    expect(capture).toContain('`${name}-${viewport.name}`')
    expect(capture).toContain('viewport: viewport.name')
    expect(capture).toContain('width: viewport.width')
    expect(capture).toContain('height: viewport.height')
    expect(capture).toContain('DASHBOARD_ROUTES.length * VIEWPORTS.length')
    expect(capture).toContain('["snapshot", "--json"]')
    expect(capture).toContain('["get", "html", "body", "--json"]')
    expect(capture).toContain('["console", "--json"]')
    expect(capture).toContain('["errors", "--json"]')
    expect(capture).not.toContain('"network", "route"')
  })

  it("reads installed CLI JSON diagnostics without silently dropping errors", () => {
    const output = (data: unknown): string => JSON.stringify({ success: true, data })
    expect(browserDiagnosticErrors(output({ messages: [{ type: "log", text: "ready" }, { type: "error", text: "failed fetch" }] }), "console")).toEqual(["failed fetch"])
    expect(browserDiagnosticErrors(output({ errors: [{ text: "Uncaught TypeError", url: "local", line: 1, column: 2 }] }), "page")).toEqual(["Uncaught TypeError"])
    expect(browserDiagnosticErrors(output({ messages: [] }), "console")).toEqual([])
    expect(browserDiagnosticErrors(output({ errors: [] }), "page")).toEqual([])
    for (const malformed of ["", "not json", '{"success":false,"error":"capture failed"}', output({}), output({ errors: [{}] })]) {
      expect(() => browserDiagnosticErrors(malformed, "page")).toThrow()
    }
  })

  it("rejects failed or empty snapshot responses and visible failure states", () => {
    expect(browserSnapshot('{"success":true,"data":{"snapshot":"- heading Overview"}}')).toBe("- heading Overview")
    for (const value of ["", '{"success":false,"error":"snapshot failed"}', '{"success":true,"data":{}}', '{"success":true,"data":{"snapshot":""}}']) {
      expect(() => browserSnapshot(value)).toThrow()
    }
    for (const text of ["", "Data temporarily unavailable.", "This surface could not load."]) {
      expect(isSettledDashboardSnapshot(text)).toBe(false)
    }
  })

  it("uses port 4100 for the supported demo and binds portfolio dev to loopback", () => {
    expect(readFileSync(".env.portfolio.example", "utf8")).toContain("ALLURA_DASHBOARD_PORT=4100")
    for (const file of ["scripts/dashboard-doctor.ts", "scripts/agent-browser-dashboard.ts"]) {
      expect(readFileSync(file, "utf8")).toContain('process.env.ALLURA_DASHBOARD_PORT || "4100"')
    }
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts
    expect(scripts.dev).toContain("${ALLURA_DASHBOARD_PORT:-4100}")
    expect(scripts.start).toContain("${ALLURA_DASHBOARD_PORT:-4100}")
    expect(readFileSync("scripts/portfolio-demo.ts", "utf8")).toContain('["bun", "run", "dev", "--hostname", "127.0.0.1"]')
  })

  it("binds the HTTP/auth contract's direct Next launch to loopback", () => {
    const contract = readFileSync("tests/e2e/dashboard-http-auth.contract.test.ts", "utf8")
    const launch = contract.match(/silentChild\(\s*(\[process\.execPath,\s*NEXT_BIN,[^\]]*\])/)

    expect(launch).not.toBeNull()
    expect(launch?.[1]).toMatch(/"--hostname"\s*,\s*"127\.0\.0\.1"/)
  })

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

  it("runs the founder seed after the workspace initializer and all numbered base migrations", () => {
    const dockerfile = readFileSync("docker/portfolio-postgres/Dockerfile", "utf8")
    const destinations = new Map(
      [...dockerfile.matchAll(/^COPY docker\/portfolio-postgres\/(\S+) \/docker-entrypoint-initdb\.d\/(\S+)$/gm)]
        .map((match) => [match[1], match[2]]),
    )
    const seed = destinations.get("100-founder-demo-seed.sql")!
    const workspace = destinations.get("99-portfolio-demo-workspace.sql")!
    const migrations = readdirSync("docker/postgres-init").filter((name) => /^\d+.*\.sql$/.test(name))

    expect(seed).toBeDefined()
    expect(workspace).toBeDefined()
    expect(migrations.length).toBeGreaterThan(0)
    for (const initializer of [...migrations, workspace]) {
      expect(initializer < seed, `${initializer} must run before ${seed}`).toBe(true)
    }
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
    expect(example).toContain("ALLURA_DEV_AUTH_ENABLED=true")
    expect(example).not.toContain("<required")
    expect(existsSync(".env.portfolio.example")).toBe(true)
  })
})
