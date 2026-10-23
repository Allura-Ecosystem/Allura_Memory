import { spawnSync } from "node:child_process"
import { accessSync, constants, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { delimiter, dirname, isAbsolute, join, normalize, relative } from "node:path"

import type { DevSafePorts, DevSafeTools } from "./commands"

/** Resolve and verify the exact executable that will cross the sanitized boundary. */
export function inspectExecutable(candidate: string | undefined, label: string): string {
  if (!candidate || !isAbsolute(candidate)) {
    throw new Error(`${label} executable was not resolved to an absolute path`)
  }
  let resolved: string
  try {
    resolved = realpathSync(candidate)
    if (!statSync(resolved).isFile()) throw new Error("not a regular file")
    accessSync(resolved, constants.X_OK)
  } catch {
    throw new Error(`${label} is not executable: ${candidate}`)
  }
  return resolved
}

export interface LocalDockerEndpointPolicy {
  defaultSocket: string
  desktopSocket: string
  currentUid: number
  defaultOwnerUid: number
}

function currentAccount(): { homedir: string; uid: number } {
  const uid = process.getuid?.()
  if (!Number.isSafeInteger(uid) || uid === undefined || uid < 0) {
    throw new Error("Current Unix account could not be determined")
  }

  let result
  try {
    result = spawnSync("/usr/bin/getent", ["passwd", String(uid)], {
      encoding: "utf8",
      env: { LANG: "C", LC_ALL: "C", NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2_000,
    })
  } catch {
    throw new Error("Current Unix account could not be resolved")
  }
  if (result.status !== 0 || result.error) {
    throw new Error("Current Unix account could not be resolved")
  }

  const record = result.stdout.endsWith("\n") ? result.stdout.slice(0, -1) : result.stdout
  if (!record || record.includes("\n") || record.includes("\r")) {
    throw new Error("Current Unix account lookup returned an ambiguous record")
  }
  const fields = record.split(":")
  if (fields.length !== 7 || fields[2] !== String(uid)) {
    throw new Error("Current Unix account lookup returned an invalid record")
  }
  const homedir = fields[5]
  if (!homedir || !isAbsolute(homedir) || normalize(homedir) !== homedir) {
    throw new Error("Current Unix account lookup returned an invalid home directory")
  }
  return { homedir, uid }
}

function localDockerEndpointPolicy(): LocalDockerEndpointPolicy {
  const account = currentAccount()
  return {
    defaultSocket: "/var/run/docker.sock",
    desktopSocket: join(account.homedir, ".docker", "desktop", "docker.sock"),
    currentUid: account.uid,
    defaultOwnerUid: 0,
  }
}

function inspectSocketParents(socketPath: string): void {
  const parents: string[] = []
  for (let current = dirname(socketPath); ; current = dirname(current)) {
    parents.push(current)
    if (dirname(current) === current) break
  }

  for (const parent of parents.reverse()) {
    let entry
    try {
      entry = lstatSync(parent)
    } catch {
      throw new Error(`Docker endpoint parent is unavailable: ${parent}`)
    }
    if (entry.isSymbolicLink()) {
      if (entry.uid !== 0) {
        throw new Error(`Docker endpoint has an untrusted parent symlink: ${parent}`)
      }
      try {
        if (!statSync(parent).isDirectory()) throw new Error("not a directory")
      } catch {
        throw new Error(`Docker endpoint parent is unavailable: ${parent}`)
      }
    } else if (!entry.isDirectory()) {
      throw new Error(`Docker endpoint parent is not a directory: ${parent}`)
    }
  }
}

/** Accept only a verified local engine socket; never resolve Docker contexts or remote transports. */
export function inspectLocalDockerEndpoint(
  candidate: string | undefined,
  policy: LocalDockerEndpointPolicy = localDockerEndpointPolicy()
): string {
  const endpoint = candidate || `unix://${policy.defaultSocket}`
  const owners = new Map([
    [`unix://${policy.defaultSocket}`, policy.defaultOwnerUid],
    [`unix://${policy.desktopSocket}`, policy.currentUid],
  ])
  const expectedOwner = owners.get(endpoint)
  if (expectedOwner === undefined) {
    throw new Error("Docker endpoint must be an approved local Unix socket")
  }

  const socketPath = endpoint.slice("unix://".length)
  inspectSocketParents(socketPath)
  let socket
  try {
    socket = lstatSync(socketPath)
  } catch {
    throw new Error(`Docker endpoint is unavailable: ${socketPath}`)
  }
  if (!socket.isSocket()) {
    throw new Error(`Docker endpoint is not a Unix socket: ${socketPath}`)
  }
  if (socket.uid !== expectedOwner) {
    const ownership = endpoint === `unix://${policy.desktopSocket}` ? "the current user" : `uid ${expectedOwner}`
    throw new Error(`Docker endpoint is not owned by ${ownership}: ${socketPath}`)
  }
  return endpoint
}

const REQUIRED_LOCAL_FILES = [
  "package.json",
  "docker-compose.dev-safe.yml",
  "docker/portfolio-postgres/Dockerfile",
  "docker/portfolio-postgres/Dockerfile.dockerignore",
] as const

const COMMAND_REQUIRED_LOCAL_FILES: Readonly<Record<string, readonly string[]>> = {
  doctor: ["node_modules/next/dist/bin/next", "node_modules/vitest/vitest.mjs", "node_modules/typescript/bin/tsc"],
  dev: ["node_modules/next/dist/bin/next"],
  typecheck: ["node_modules/typescript/bin/tsc"],
  "test:launcher": ["node_modules/vitest/vitest.mjs"],
  "test:unit": ["node_modules/vitest/vitest.mjs"],
}

/** Fail before launcher commands when their local app or disposable DB inputs are incomplete. */
export function assertLocalPrerequisites(root: string, command: string): void {
  const required = [...REQUIRED_LOCAL_FILES, ...(COMMAND_REQUIRED_LOCAL_FILES[command] ?? [])]
  for (const path of required) {
    try {
      if (!statSync(join(root, path)).isFile()) throw new Error("not a regular file")
    } catch {
      throw new Error(`Missing dev-safe prerequisite: ${path}; run bun install --frozen-lockfile in this worktree`)
    }
  }
}

/** Service startup remains closed until AD-45 records the chosen host ports. */
export function assertActivationAllowed(
  command: string,
  environment: Readonly<Record<string, string | undefined>>
): void {
  if (["dev", "db-up"].includes(command) && environment.ALLURA_DEV_SAFE_PORTS_APPROVED !== "true") {
    throw new Error("Dev-safe port decision is pending; do not activate services before AD-45 approval")
  }
}

function parseHostPort(name: string, value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a valid TCP port`)
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a valid TCP port`)
  }
  if (port >= 3000 && port <= 3999) {
    throw new Error(`${name} is in the banned 3000-3999 band`)
  }
  return port
}

const PROPOSED_DEV_SAFE_PORTS = {
  ALLURA_DEV_SAFE_DASHBOARD_PORT: 4002,
  ALLURA_DEV_SAFE_POSTGRES_PORT: 7002,
} as const

/** Require explicit values matching the pending AD-45 registration proposal. */
export function readPortConfiguration(environment: Readonly<Record<string, string | undefined>>): DevSafePorts {
  const dashboard = parseHostPort("ALLURA_DEV_SAFE_DASHBOARD_PORT", environment.ALLURA_DEV_SAFE_DASHBOARD_PORT)
  const postgres = parseHostPort("ALLURA_DEV_SAFE_POSTGRES_PORT", environment.ALLURA_DEV_SAFE_POSTGRES_PORT)
  if (dashboard !== undefined && dashboard !== PROPOSED_DEV_SAFE_PORTS.ALLURA_DEV_SAFE_DASHBOARD_PORT) {
    throw new Error("ALLURA_DEV_SAFE_DASHBOARD_PORT must match the proposed AD-45 allocation 4002")
  }
  if (postgres !== undefined && postgres !== PROPOSED_DEV_SAFE_PORTS.ALLURA_DEV_SAFE_POSTGRES_PORT) {
    throw new Error("ALLURA_DEV_SAFE_POSTGRES_PORT must match the proposed AD-45 allocation 7002")
  }
  return {
    ...(dashboard === undefined ? {} : { dashboard }),
    ...(postgres === undefined ? {} : { postgres }),
  }
}

/** Refuse dotenv files by name without opening their potentially secret contents. */
export function assertSafeWorktree(root: string): void {
  const gitPath = join(root, ".git")
  let linked = false
  try {
    linked = lstatSync(gitPath).isFile() && readFileSync(gitPath, "utf8").startsWith("gitdir: ")
  } catch {
    linked = false
  }
  if (!linked) {
    throw new Error("Use a dedicated linked Git worktree, not a primary checkout")
  }

  const inspect = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", ".next", "node_modules"].includes(entry.name)) continue
      const entryPath = join(directory, entry.name)
      if (/^\.env(?:\.|$)/.test(entry.name) && !entry.name.endsWith(".example")) {
        throw new Error(`Environment file refused: ${relative(root, entryPath)}; do not copy production env`)
      }
      if (entry.isDirectory()) inspect(entryPath)
    }
  }

  inspect(root)
}

export type DevSafeEnvironment = Record<string, string> & {
  NODE_ENV: "development" | "test"
}

function executablePath(tools: DevSafeTools): string {
  return [...new Set([dirname(tools.runtime), dirname(tools.docker), "/usr/local/bin", "/usr/bin", "/bin"])].join(
    delimiter
  )
}

/** Reconstruct the child environment from explicit non-secret fixture values. */
export function buildEnvironment(
  root: string,
  command: string,
  tools: DevSafeTools,
  ports: DevSafePorts
): DevSafeEnvironment {
  const unit = command === "test:unit" || command === "test:launcher"
  const developmentServer = command === "dev"
  const environment: DevSafeEnvironment = {
    HOME: join(root, ".dev-safe-home"),
    PATH: executablePath(tools),
    NODE_ENV: unit ? "test" : "development",
    NEXT_TELEMETRY_DISABLED: "1",
  }

  if (ports.postgres !== undefined) {
    environment.ALLURA_DEV_SAFE_POSTGRES_PORT = String(ports.postgres)
  }
  if (ports.dashboard !== undefined) {
    environment.ALLURA_DEV_SAFE_DASHBOARD_PORT = String(ports.dashboard)
  }
  if (developmentServer) {
    Object.assign(environment, {
      ALLURA_DASHBOARD_PORT: String(ports.dashboard),
      POSTGRES_HOST: "127.0.0.1",
      POSTGRES_PORT: String(ports.postgres),
      POSTGRES_DB: "allura_dev",
      POSTGRES_USER: "allura",
      POSTGRES_PASSWORD: "allura-dev-local-only",
      POSTGRES_APP_USER: "allura_app",
      POSTGRES_APP_PASSWORD: "change-me-in-production",
    })
  }

  return environment
}
