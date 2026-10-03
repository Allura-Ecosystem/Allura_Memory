import { lstatSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

/** Refuse dotenv files by name, never by opening their possibly-secret contents. */
export function assertSafeWorktree(root: string): void {
  const git = join(root, ".git")
  if (!lstatSync(git).isFile() || !readFileSync(git, "utf8").startsWith("gitdir: ")) {
    throw new Error("Use a dedicated linked Git worktree, not the live checkout")
  }
  function inspect(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if ([".git", "node_modules", ".next"].includes(entry.name)) continue
      const path = join(directory, entry.name)
      if (/^\.env(?:\.|$)/.test(entry.name) && !entry.name.endsWith(".example")) {
        throw new Error(`Environment file refused: ${relative(root, path)}; never copy production env`)
      }
      if (entry.isDirectory()) inspect(path)
    }
  }
  inspect(root)
}

/** Only PATH/HOME survive; all application settings below are non-secret fixtures. */
export function buildEnvironment(
  inherited: Readonly<Record<string, string | undefined>>,
  command = "dev"
): Record<string, string> & { NODE_ENV: "development" | "production" | "test" } {
  const unit = command === "test:unit" || command === "test:launcher"
  return {
    NODE_ENV: unit ? "test" : command === "build" ? "production" : "development",
    PATH: inherited.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: inherited.HOME || "/tmp",
    POSTGRES_HOST: "127.0.0.1",
    POSTGRES_PORT: "55432",
    POSTGRES_DB: "allura_dev",
    POSTGRES_USER: "allura",
    POSTGRES_PASSWORD: "allura-dev-local-only",
    POSTGRES_APP_USER: "allura_app",
    ...(unit ? {} : { POSTGRES_APP_PASSWORD: "change-me-in-production" }),
    POSTGRES_POOL_MAX: "3",
    ALLURA_BRAIN_URL: "http://127.0.0.1:6410/mcp",
    GRAPH_BACKEND: "ruvector",
    ALLURA_DASHBOARD_PORT: "4100",
    ALLURA_MCP_HTTP_HOST: "127.0.0.1",
    ALLURA_MCP_HTTP_PORT: "6410",
    ALLURA_MCP_TOKEN_SECRET: "allura-dev-safe-local-only-not-a-production-secret",
    ALLURA_DEV_AUTH_ENABLED: command === "dev" ? "true" : "false",
    ALLURA_DEMO_DEV_AUTH_FORCE: command === "dev" ? "true" : "false",
    ALLURA_DEV_AUTH_ROLE: "admin",
    ALLURA_DEV_AUTH_GROUP_ID: "allura-system",
    ALLURA_DEV_AUTH_WORKSPACE_ID: "workspace-allura",
    ALLURA_DEV_AUTH_USER_ID: "dev-user-allura",
    ALLURA_DEV_AUTH_EMAIL: "dev@allura.local",
    NEXT_TELEMETRY_DISABLED: "1",
    UV_THREADPOOL_SIZE: "2",
    RAYON_NUM_THREADS: "1",
    // Next's default is max(1, CIRCLE_NODE_TOTAL - 1); covered against installed Next.
    CIRCLE_NODE_TOTAL: "2",
  }
}
