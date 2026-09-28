import ts from "typescript"
import { afterEach, describe, expect, it } from "vitest"
import { parse } from "yaml"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as commands from "../../scripts/dev-safe/commands"
import * as safe from "../../scripts/dev-safe/environment"
const { buildEnvironment } = safe

const temporaryRoots: string[] = []
afterEach(() => temporaryRoots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
function worktree() {
  const root = mkdtempSync(join(tmpdir(), "allura-dev-safe-"))
  temporaryRoots.push(root)
  writeFileSync(join(root, ".git"), "gitdir: /tmp/fixture-repo/worktrees/dev\n")
  return root
}

describe("worktree preflight", () => {
  it("accepts example files but rejects an ordinary checkout", () => {
    const root = worktree()
    writeFileSync(join(root, ".env.production.example"), "not read")
    expect(() => safe.assertSafeWorktree(root)).not.toThrow()
    rmSync(join(root, ".git"))
    mkdirSync(join(root, ".git"))
    expect(() => safe.assertSafeWorktree(root)).toThrow(/linked Git worktree/)
  })

  it.each([
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
    ".env.test",
    ".env.test.local",
    ".env.portfolio",
  ])("rejects %s without reading or echoing its contents", (filename) => {
    const root = worktree()
    mkdirSync(join(root, "nested"))
    writeFileSync(join(root, "nested", filename), "PRIVATE_SENTINEL")
    expect(() => safe.assertSafeWorktree(root)).toThrow(/Environment file refused/)
    try {
      safe.assertSafeWorktree(root)
    } catch (error) {
      expect(String(error)).not.toContain("PRIVATE_SENTINEL")
    }
  })

  it("rejects dangling dotenv symlinks", () => {
    const root = worktree()
    symlinkSync("/missing/secret", join(root, ".env.local"))
    expect(() => safe.assertSafeWorktree(root)).toThrow(/Environment file refused/)
  })
})

describe("launcher entrypoint and compose boundary", () => {
  it("runs doctor without querying Docker or starting services", () => {
    const root = worktree()
    cpSync(join(process.cwd(), "scripts/dev-safe"), join(root, "scripts/dev-safe"), { recursive: true })
    cpSync(join(process.cwd(), "package.json"), join(root, "package.json"))
    const result = spawnSync("bun", ["--no-env-file", "scripts/dev-safe/index.ts", "doctor"], {
      cwd: root,
      env: buildEnvironment(process.env),
      encoding: "utf8",
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("Preflight OK")
    expect(result.stdout).toContain("127.0.0.1:55432/allura_dev")
  })
  it("rejects command forwarding at the actual CLI", () => {
    const result = spawnSync("bun", ["--no-env-file", "scripts/dev-safe/index.ts", "dev", "--port", "3200"], {
      cwd: process.cwd(),
      env: buildEnvironment(process.env),
      encoding: "utf8",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Exactly one command")
  })
  it("declares only disposable loopback PostgreSQL with capped resources", () => {
    const text = readFileSync(join(process.cwd(), "docker-compose.dev-safe.yml"), "utf8")
    const config = parse(text)
    expect(Object.keys(config.services)).toEqual(["postgres"])
    expect(config.services.postgres).toMatchObject({
      image: "allura-dev-safe-postgres:local",
      build: { context: ".", dockerfile: "docker/portfolio-postgres/Dockerfile" },
      ports: ["127.0.0.1:55432:5432"],
      environment: { POSTGRES_DB: "allura_dev", POSTGRES_USER: "allura", POSTGRES_PASSWORD: "allura-dev-local-only" },
      tmpfs: ["/var/lib/postgresql/data:size=512m"],
      mem_limit: "768m",
      cpus: 1,
      pids_limit: 128,
    })
    expect(config.services.postgres.healthcheck.test).toEqual([
      "CMD",
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "allura",
      "-d",
      "allura_dev",
    ])
    expect(config.services.postgres).not.toHaveProperty("volumes")
    expect(config.services.postgres).not.toHaveProperty("container_name")
    expect(config).not.toHaveProperty("volumes")
    expect(config.networks).toEqual({ default: {} })
    expect(text).not.toContain("${")
  })
})

describe("fixed command plans", () => {
  const root = "/tmp/worktree"
  const plan = (name: string) => commands.createPlan(root, [name], "/tools/bun")
  it("does not accept arbitrary commands or forwarded flags", () => {
    expect(() => plan("brain:down")).toThrow(/Unknown command/)
    expect(() => commands.createPlan(root, ["dev", "--port", "3200"], "/tools/bun")).toThrow(/Exactly one command/)
  })
  it("installs with the pinned executable without lifecycle scripts or lock drift", () => {
    expect(plan("install").argv).toEqual(["/tools/bun", "install", "--frozen-lockfile", "--ignore-scripts"])
  })
  it.each(["db-up", "db-down", "status"])(
    "scopes %s exclusively to its own compose file, project and local daemon",
    (name) => {
      const argv = plan(name).argv
      expect(argv.slice(0, 12)).toEqual([
        "docker",
        "--host",
        "unix:///var/run/docker.sock",
        "compose",
        "--project-name",
        "allura-dev-safe",
        "--project-directory",
        root,
        "--env-file",
        "/dev/null",
        "--file",
        join(root, "docker-compose.dev-safe.yml"),
      ])
      expect(argv.slice(12)).toEqual(
        name === "db-up"
          ? ["up", "--detach", "--build", "--wait", "--wait-timeout", "120", "postgres"]
          : name === "db-down"
            ? ["down"]
            : ["ps"]
      )
    }
  )
  it("binds development to loopback 4100 and bounds unit concurrency", () => {
    expect(plan("dev").argv.slice(-6)).toEqual(["dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4100"])
    expect(plan("test:unit").argv).toEqual(
      expect.arrayContaining([
        "--config",
        "vitest.config.unit.ts",
        "--maxWorkers=1",
        "--minWorkers=1",
        "--no-file-parallelism",
      ])
    )
    expect(plan("test:launcher").argv).toContain("tests/scripts/dev-safe.test.ts")
    expect(plan("typecheck").argv.slice(-3)).toEqual(["--noEmit", "--incremental", "false"])
    expect(plan("build").argv.slice(-2)).toEqual(["build", "--webpack"])
  })
  it("passes flags accepted by the installed TypeScript compiler", () => {
    const parsed = ts.parseCommandLine(plan("typecheck").argv.slice(3))
    expect(parsed.errors).toEqual([])
    expect(parsed.options).toMatchObject({ noEmit: true, incremental: false })
  })
  it("actually limits installed Next's default build worker count to one", () => {
    const result = spawnSync(
      "node",
      ["-e", "console.log(require('next/dist/server/config-shared').defaultConfig.experimental.cpus)"],
      {
        cwd: process.cwd(),
        env: buildEnvironment(process.env),
        encoding: "utf8",
      }
    )
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe("1")
  })
})

describe("isolated development environment", () => {
  it("keeps unit tests out of live DB lanes without losing the local token fixture", () => {
    const env = buildEnvironment({ POSTGRES_APP_PASSWORD: "production", RUN_E2E_TESTS: "true" }, "test:unit")
    expect(env.NODE_ENV).toBe("test")
    expect(env.ALLURA_DEV_AUTH_ENABLED).toBe("false")
    expect(env.ALLURA_DEMO_DEV_AUTH_FORCE).toBe("false")
    expect(env).not.toHaveProperty("POSTGRES_APP_PASSWORD")
    expect(env).not.toHaveProperty("RUN_E2E_TESTS")
    expect(env.ALLURA_MCP_TOKEN_SECRET).toBe("allura-dev-safe-local-only-not-a-production-secret")
    expect(buildEnvironment({}, "build")).toMatchObject({
      NODE_ENV: "production",
      ALLURA_DEV_AUTH_ENABLED: "false",
      ALLURA_DEMO_DEV_AUTH_FORCE: "false",
      POSTGRES_APP_PASSWORD: "change-me-in-production",
    })
  })
  it("replaces inherited application settings instead of merging secrets", () => {
    const env = buildEnvironment({
      PATH: "/usr/bin",
      HOME: "/tmp/dev-home",
      DATABASE_URL: "production",
      POSTGRES_HOST: "production",
      POSTGRES_PORT: "5432",
      POSTGRES_PASSWORD: "secret",
      OPENAI_API_KEY: "secret",
      CLERK_SECRET_KEY: "secret",
      COMPOSE_FILE: "production.yml",
      DOCKER_HOST: "ssh://production",
      NODE_OPTIONS: "--require=/tmp/evil.js",
      ALLURA_DASHBOARD_PORT: "3200",
      ALLURA_MCP_HTTP_PORT: "6477",
    })
    expect(env).toMatchObject({
      ALLURA_BRAIN_URL: "http://127.0.0.1:6410/mcp",
      GRAPH_BACKEND: "ruvector",
      NODE_ENV: "development",
      ALLURA_MCP_TOKEN_SECRET: "allura-dev-safe-local-only-not-a-production-secret",
      PATH: "/usr/bin",
      HOME: "/tmp/dev-home",
      POSTGRES_HOST: "127.0.0.1",
      POSTGRES_PORT: "55432",
      POSTGRES_DB: "allura_dev",
      POSTGRES_USER: "allura",
      POSTGRES_PASSWORD: "allura-dev-local-only",
      POSTGRES_APP_USER: "allura_app",
      POSTGRES_APP_PASSWORD: "change-me-in-production",
      ALLURA_DASHBOARD_PORT: "4100",
      ALLURA_MCP_HTTP_HOST: "127.0.0.1",
      ALLURA_MCP_HTTP_PORT: "6410",
      ALLURA_DEV_AUTH_ENABLED: "true",
      ALLURA_DEV_AUTH_GROUP_ID: "allura-system",
      ALLURA_DEV_AUTH_WORKSPACE_ID: "workspace-allura",
      ALLURA_DEV_AUTH_USER_ID: "dev-user-allura",
    })
    for (const key of [
      "DATABASE_URL",
      "OPENAI_API_KEY",
      "CLERK_SECRET_KEY",
      "COMPOSE_FILE",
      "DOCKER_HOST",
      "NODE_OPTIONS",
    ])
      expect(env).not.toHaveProperty(key)
    expect(Object.values(env)).not.toContain("secret")
  })
})
