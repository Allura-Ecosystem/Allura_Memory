/**
 * Contract proof for the real Next HTTP/auth boundary. This deliberately does
 * not import pages, requireDashboardScope, or mock any dashboard dependency.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type ChildProcess, spawn } from "node:child_process"
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import net from "node:net"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/mission-control",
  "/dashboard/kanban",
  "/dashboard/search",
  "/dashboard/teams",
  "/dashboard/graph",
  "/dashboard/curator",
] as const

const PROJECT_ROOT = process.cwd()
const COMPOSE_FILE = join(PROJECT_ROOT, "docker-compose.portfolio.yml")
const NEXT_BIN = join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next")
const READY_TIMEOUT_MS = 90_000
const CLEANUP_TIMEOUT_MS = 10_000

type Child = ChildProcess

let tempDirectory = ""
let appDirectory = ""
let composeProject = ""
let databasePort = 0

function silentChild(command: string[], env: Record<string, string | undefined>, cwd = PROJECT_ROOT): Child {
  return spawn(command[0], command.slice(1), { cwd, env: env as NodeJS.ProcessEnv, stdio: "ignore" })
}

async function runQuietly(command: string[], env: Record<string, string | undefined>): Promise<void> {
  const child = spawn(command[0], command.slice(1), { cwd: PROJECT_ROOT, env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] })
  let output = ""
  child.stdout?.on("data", (chunk) => { output += String(chunk) })
  child.stderr?.on("data", (chunk) => { output += String(chunk) })
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  if (exitCode !== 0) throw new Error(`local command failed (${command.slice(0, 3).join(" ")}): ${output.slice(-1_500).trim()}`)
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address === "string" || address === null) {
        server.close(() => reject(new Error("could not allocate an isolated local port")))
        return
      }
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function contractEnvironment(overrides: Record<string, string>): Record<string, string | undefined> {
  const environment = { ...process.env }
  for (const key of ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]) delete environment[key]
  return {
    ...environment,
    NODE_ENV: "development",
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_PORT: String(databasePort),
    POSTGRES_DB: "allura",
    POSTGRES_USER: "allura",
    POSTGRES_PASSWORD: "allura-dashboard-contract-local-only",
    POSTGRES_APP_USER: "allura_app",
    POSTGRES_APP_PASSWORD: "change-me-in-production",
    ALLURA_DEV_AUTH_ROLE: "admin",
    ALLURA_DEV_AUTH_GROUP_ID: "allura-system",
    ALLURA_DEV_AUTH_WORKSPACE_ID: "workspace-allura",
    ALLURA_DEV_AUTH_USER_ID: "dashboard-http-contract",
    ALLURA_DEV_AUTH_EMAIL: "dashboard-http-contract@allura.local",
    ...overrides,
  }
}

async function waitForDatabase(env: Record<string, string | undefined>): Promise<void> {
  const { Client } = await import("pg")
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const client = new Client({ host: env.POSTGRES_HOST, port: databasePort, database: env.POSTGRES_DB, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD })
    try {
      await client.connect()
      await client.query("SELECT 1")
      return
    } catch {
      await sleep(500)
    } finally {
      await client.end().catch(() => undefined)
    }
  }
  throw new Error("disposable portfolio database did not become ready")
}

async function waitForHttp(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/dashboard`, { redirect: "manual", signal: AbortSignal.timeout(2_000) })
      if (response.status > 0) return
    } catch {
      // The server has not started listening yet.
    }
    await sleep(500)
  }
  throw new Error("local Next process did not become ready")
}

async function stop(child: Child): Promise<void> {
  if (child.exitCode !== null) return
  child.kill("SIGTERM")
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(CLEANUP_TIMEOUT_MS)])
  if (child.exitCode === null) {
    child.kill("SIGKILL")
    await new Promise((resolve) => child.once("exit", resolve))
  }
}

async function withNextServer<T>(env: Record<string, string | undefined>, work: (port: number) => Promise<T>): Promise<T> {
  const port = await freePort()
  const child = silentChild([process.execPath, NEXT_BIN, "dev", "--webpack", "-p", String(port)], { ...env, PORT: String(port) }, appDirectory)
  try {
    await waitForHttp(port)
    return await work(port)
  } finally {
    await stop(child)
  }
}

beforeAll(async () => {
  databasePort = await freePort()
  tempDirectory = await mkdtemp(join(tmpdir(), "allura-dashboard-http-"))
  appDirectory = join(tempDirectory, "app")
  await cp(PROJECT_ROOT, appDirectory, {
    recursive: true,
    filter: (source) => ![".git", ".next", "node_modules", "artifacts", ".env", ".env.local", ".env.portfolio"].includes(basename(source)),
  })
  await symlink(join(PROJECT_ROOT, "node_modules"), join(appDirectory, "node_modules"), "junction")
  composeProject = `allura-dashboard-http-${process.pid}`
  const envFile = join(tempDirectory, "portfolio.env")
  await writeFile(envFile, [
    `PORTFOLIO_POSTGRES_PORT=${databasePort}`,
    "POSTGRES_DB=allura",
    "POSTGRES_USER=allura",
    "POSTGRES_PASSWORD=allura-dashboard-contract-local-only",
  ].join("\n"))
  const env = contractEnvironment({ PORTFOLIO_POSTGRES_PORT: String(databasePort) })
  await runQuietly(["docker", "compose", "--project-name", composeProject, "--env-file", envFile, "-f", COMPOSE_FILE, "up", "--detach", "--build", "--force-recreate"], env)
  await waitForDatabase(env)
}, 180_000)

afterAll(async () => {
  const envFile = tempDirectory ? join(tempDirectory, "portfolio.env") : ""
  if (composeProject && envFile) {
    await runQuietly(["docker", "compose", "--project-name", composeProject, "--env-file", envFile, "-f", COMPOSE_FILE, "down", "--remove-orphans"], contractEnvironment({})).catch(() => undefined)
  }
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true })
}, 30_000)

describe("dashboard HTTP/auth contract", () => {
  it("returns 200 without redirects for all seven routes with explicit DevAuth", async () => {
    await withNextServer(contractEnvironment({ ALLURA_DEV_AUTH_ENABLED: "true", ALLURA_DEMO_DEV_AUTH_FORCE: "true" }), async (port) => {
      for (const route of DASHBOARD_ROUTES) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) })
        expect(response.status, route).toBe(200)
        expect(response.headers.get("location"), route).toBeNull()
      }
    })
  }, 180_000)

  it("redirects or denies every protected route when DevAuth is disabled", async () => {
    await withNextServer(contractEnvironment({ ALLURA_DEV_AUTH_ENABLED: "false", ALLURA_DEMO_DEV_AUTH_FORCE: "false" }), async (port) => {
      for (const route of DASHBOARD_ROUTES) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`, { redirect: "manual", signal: AbortSignal.timeout(30_000) })
        expect(response.status, route).not.toBe(200)
        if (response.status >= 300 && response.status < 400) {
          expect(response.headers.get("location"), route).toContain("/auth/v2/login")
        } else {
          expect([401, 403], route).toContain(response.status)
        }
      }
    })
  }, 180_000)
})
