import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { ensurePortfolioEnvironment } from "../../scripts/portfolio-demo-env"

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

  it("uses a build-time initializer image and no host migration bind mount", () => {
    const compose = readFileSync("docker-compose.portfolio.yml", "utf8")
    const dockerfile = readFileSync("docker/portfolio-postgres/Dockerfile", "utf8")

    expect(compose).toContain("dockerfile: docker/portfolio-postgres/Dockerfile")
    expect(compose).not.toContain("./docker/postgres-init:/docker-entrypoint-initdb.d")
    expect(compose).toContain('"127.0.0.1:${PORTFOLIO_POSTGRES_PORT:-5433}:5432"')
    expect(dockerfile).toContain("COPY docker/postgres-init/ /docker-entrypoint-initdb.d/")
    expect(dockerfile).toContain("COPY docker/portfolio-postgres/99-portfolio-demo-workspace.sql")
  })

  it("uses agent-browser and rejects the retired Playwright capture client", () => {
    const capture = readFileSync("scripts/agent-browser-dashboard.ts", "utf8")
    expect(capture).toContain('"agent-browser"')
    expect(capture).toContain("loadPortfolioEnv()")
    expect(capture).toContain('config({ path: envPath, override: true })')
    expect(capture).not.toContain('from "playwright"')
    expect(capture).toContain("redirect: \"manual\"")
    expect(capture).toContain("consoleErrors.length === 0")
    expect(capture).toContain("pageErrors.length === 0")
    expect(capture).toContain("evidence.length !== DASHBOARD_ROUTES.length")
  })

  it("keeps the checked-in example non-secret and enables the explicit local demo auth mode", () => {
    const example = readFileSync(".env.portfolio.example", "utf8")
    expect(example).toContain("ALLURA_DEMO_DEV_AUTH_FORCE=true")
    expect(example).not.toContain("<required")
    expect(existsSync(".env.portfolio.example")).toBe(true)
  })
})
