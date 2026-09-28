import { join } from "node:path"

/** Fixed argv only: no shell, forwarded flags, implicit compose files or projects. */
export function createPlan(root: string, args: string[], bun: string): { name: string; argv: string[] } {
  if (args.length !== 1) throw new Error("Exactly one command is required; no extra arguments allowed")
  const name = args[0]
  const node = (file: string, ...flags: string[]) => [
    "node",
    "--max-old-space-size=2048",
    join(root, "node_modules", file),
    ...flags,
  ]
  const unit = node(
    "vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.config.unit.ts",
    "--maxWorkers=1",
    "--minWorkers=1",
    "--no-file-parallelism"
  )
  const compose = [
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
  ]
  const plans: Record<string, string[]> = {
    doctor: [],
    install: [bun, "install", "--frozen-lockfile", "--ignore-scripts"],
    status: [...compose, "ps"],
    "db-up": [...compose, "up", "--detach", "--build", "--wait", "--wait-timeout", "120", "postgres"],
    "db-down": [...compose, "down"],
    dev: node("next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "4100"),
    typecheck: node("typescript/bin/tsc", "--noEmit", "--incremental", "false"),
    "test:unit": unit,
    "test:launcher": [...unit, "tests/scripts/dev-safe.test.ts"],
    build: node("next/dist/bin/next", "build", "--webpack"),
  }
  if (!Object.hasOwn(plans, name)) throw new Error(`Unknown command. Choose: ${Object.keys(plans).join(", ")}`)
  return { name, argv: plans[name] }
}
