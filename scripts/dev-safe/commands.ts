import { createHash } from "node:crypto"
import { join, resolve } from "node:path"

export interface DevSafeTools {
  runtime: string
  docker: string
}

export interface DevSafePorts {
  dashboard?: number
  postgres?: number
}

export interface CommandPlan {
  name: string
  argv: string[]
}

/** Give each linked worktree its own Compose resources without trusting user input. */
export function devSafeProjectName(root: string): string {
  const suffix = createHash("sha256").update(resolve(root)).digest("hex").slice(0, 12)
  return `allura-dev-safe-${suffix}`
}

function composeCommand(root: string, tools: DevSafeTools): string[] {
  return [
    tools.docker,
    "--host",
    "unix:///var/run/docker.sock",
    "compose",
    "--project-name",
    devSafeProjectName(root),
    "--project-directory",
    root,
    "--env-file",
    "/dev/null",
    "--file",
    join(root, "docker-compose.dev-safe.yml"),
  ]
}

/** Verify the already-started disposable database; never start it as a side effect of dev. */
export function createDatabaseReadinessPlan(root: string, tools: DevSafeTools, ports: DevSafePorts): string[] {
  if (ports.postgres === undefined) {
    throw new Error("ALLURA_DEV_SAFE_POSTGRES_PORT is required for database readiness")
  }
  return [
    ...composeCommand(root, tools),
    "exec",
    "--no-TTY",
    "postgres",
    "pg_isready",
    "-h",
    "127.0.0.1",
    "-U",
    "allura",
    "-d",
    "allura_dev",
  ]
}

/** Build fixed argv only; callers cannot forward flags or invoke a shell. */
export function createPlan(root: string, args: string[], tools: DevSafeTools, ports: DevSafePorts): CommandPlan {
  if (args.length !== 1) {
    throw new Error("Exactly one command is required; no extra arguments are allowed")
  }

  const name = args[0]
  const runtime = (file: string, ...flags: string[]) => [tools.runtime, join(root, "node_modules", file), ...flags]
  const compose = composeCommand(root, tools)
  const unit = runtime("vitest/vitest.mjs", "run", "--config", "vitest.config.unit.ts")
  const plans: Record<string, string[]> = {
    doctor: [],
    status: [...compose, "ps"],
    "db-up": [...compose, "up", "--detach", "--build", "--wait", "--wait-timeout", "120", "postgres"],
    "db-down": [...compose, "down"],
    typecheck: runtime("typescript/bin/tsc", "--noEmit", "--incremental", "false"),
    "test:unit": [...unit, "--maxWorkers=1", "--minWorkers=1", "--no-file-parallelism"],
    "test:launcher": [
      ...runtime("vitest/vitest.mjs", "run", "--config", "tests/scripts/vitest.config.dev-safe.ts"),
      "tests/scripts/dev-safe.test.ts",
      "--maxWorkers=1",
      "--minWorkers=1",
      "--no-file-parallelism",
    ],
  }

  if (ports.dashboard !== undefined) {
    plans.dev = runtime(
      "next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(ports.dashboard)
    )
  }
  if (name === "dev" && ports.dashboard === undefined) {
    throw new Error("ALLURA_DEV_SAFE_DASHBOARD_PORT is required for dev")
  }
  if (["dev", "status", "db-up", "db-down"].includes(name) && ports.postgres === undefined) {
    throw new Error(`ALLURA_DEV_SAFE_POSTGRES_PORT is required for ${name}`)
  }
  if (!Object.hasOwn(plans, name)) {
    throw new Error(`Unknown command. Choose: ${Object.keys(plans).join(", ")}, dev`)
  }
  return { name, argv: plans[name] }
}
