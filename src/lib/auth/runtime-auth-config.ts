import { readFileSync } from "node:fs"

import type { AlluraRole } from "./types"

const DEFAULT_MANIFEST_PATH = "/app/.allura/runtime-auth.json"

export type RuntimeAuthConfig = {
  environment: "development" | "production" | "test"
  devAuthEnabled: boolean
  devAuthForce: boolean
  devAuthRole: AlluraRole
  devAuthGroupId: string
  devAuthUserId: string
  devAuthEmail: string
  devAuthWorkspaceId: string
  clerkConfigured: boolean
}

type ReadOptions = {
  environment?: string
  manifestPath?: string
}

let testConfig: RuntimeAuthConfig | null = null
let cachedConfig: RuntimeAuthConfig | null = null

function normalizeEnvironment(value: string | undefined): RuntimeAuthConfig["environment"] {
  return value === "production" || value === "test" ? value : "development"
}

function parseRuntimeAuthConfig(value: unknown): RuntimeAuthConfig {
  if (typeof value !== "object" || value === null) throw new Error("manifest must be an object")
  const input = value as Record<string, unknown>
  const environment = input.environment
  const strings = ["devAuthRole", "devAuthGroupId", "devAuthUserId", "devAuthEmail", "devAuthWorkspaceId"] as const
  if (environment !== "development" && environment !== "production" && environment !== "test") {
    throw new Error("manifest environment is invalid")
  }
  if (typeof input.devAuthEnabled !== "boolean" || typeof input.devAuthForce !== "boolean" || typeof input.clerkConfigured !== "boolean") {
    throw new Error("manifest boolean fields are invalid")
  }
  if (strings.some((key) => typeof input[key] !== "string" || input[key].length === 0)) {
    throw new Error("manifest string fields are invalid")
  }
  return {
    environment,
    devAuthEnabled: input.devAuthEnabled,
    devAuthForce: input.devAuthForce,
    devAuthRole: input.devAuthRole as AlluraRole,
    devAuthGroupId: input.devAuthGroupId as string,
    devAuthUserId: input.devAuthUserId as string,
    devAuthEmail: input.devAuthEmail as string,
    devAuthWorkspaceId: input.devAuthWorkspaceId as string,
    clerkConfigured: input.clerkConfigured,
  }
}

function nonProductionFallback(environment: RuntimeAuthConfig["environment"]): RuntimeAuthConfig {
  return {
    environment,
    devAuthEnabled: process.env.ALLURA_DEV_AUTH_ENABLED !== "false",
    devAuthForce: process.env.ALLURA_DEMO_DEV_AUTH_FORCE === "true",
    devAuthRole: (process.env.ALLURA_DEV_AUTH_ROLE ?? "admin") as AlluraRole,
    devAuthGroupId: process.env.ALLURA_DEV_AUTH_GROUP_ID ?? "allura-system",
    devAuthUserId: process.env.ALLURA_DEV_AUTH_USER_ID ?? "dev-user-allura",
    devAuthEmail: process.env.ALLURA_DEV_AUTH_EMAIL ?? "dev@allura.local",
    devAuthWorkspaceId: process.env.ALLURA_DEV_AUTH_WORKSPACE_ID ?? "workspace-allura",
    clerkConfigured:
      Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) && Boolean(process.env.CLERK_SECRET_KEY),
  }
}

/**
 * Reads only non-secret runtime auth selection data. Production has no fallback:
 * the startup entrypoint must have generated this manifest before Next starts.
 */
export function readRuntimeAuthConfig(options: ReadOptions = {}): RuntimeAuthConfig {
  const environment = normalizeEnvironment(options.environment ?? process.env.NODE_ENV)
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH

  try {
    return parseRuntimeAuthConfig(JSON.parse(readFileSync(manifestPath, "utf8")))
  } catch (error) {
    if (environment === "production") {
      const reason = error instanceof Error ? error.message : "unknown error"
      const status = reason.includes("ENOENT") ? "required" : "invalid"
      throw new Error(`Runtime auth manifest is ${status} in production: ${reason}`)
    }
    return nonProductionFallback(environment)
  }
}

export function getRuntimeAuthConfig(): RuntimeAuthConfig {
  if (testConfig) return testConfig
  if (!cachedConfig) cachedConfig = readRuntimeAuthConfig()
  return cachedConfig
}

export function setRuntimeAuthConfigForTests(config: RuntimeAuthConfig): void {
  testConfig = parseRuntimeAuthConfig(config)
  cachedConfig = null
}

export function clearRuntimeAuthConfigForTests(): void {
  testConfig = null
  cachedConfig = null
}
