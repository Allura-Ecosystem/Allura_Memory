import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { createDatabaseReadinessPlan, createPlan } from "./commands"
import {
  assertActivationAllowed,
  assertLocalPrerequisites,
  assertSafeWorktree,
  buildEnvironment,
  inspectExecutable,
  readPortConfiguration,
} from "./environment"

const root = resolve(import.meta.dir, "../..")

function execute(argv: string[], environment: Record<string, string>): string {
  const result = Bun.spawnSync(argv, {
    cwd: root,
    env: environment,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = result.stdout.toString().trim()
  const stderr = result.stderr.toString().trim()
  if (result.exitCode !== 0) {
    throw new Error(`${argv[0]} failed (${result.exitCode}): ${stderr || stdout || "no output"}`)
  }
  return stdout
}

function pinnedRuntime(): string {
  const parsed = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    packageManager?: unknown
  }
  if (typeof parsed.packageManager !== "string" || !/^bun@\d+\.\d+\.\d+$/.test(parsed.packageManager)) {
    throw new Error("package.json must pin packageManager to an exact bun@x.y.z version")
  }
  return parsed.packageManager
}

async function main(): Promise<number> {
  const runtime = inspectExecutable(process.execPath, "selected Bun runtime")
  const docker = inspectExecutable(Bun.which("docker") ?? undefined, "Docker CLI")
  const tools = { runtime, docker }
  const args = process.argv.slice(2)
  const command = args[0] ?? ""
  const ports = readPortConfiguration(process.env)

  assertSafeWorktree(root)
  assertLocalPrerequisites(root, command)
  assertActivationAllowed(command, process.env)

  const plan = createPlan(root, args, tools, ports)
  const environment = buildEnvironment(root, plan.name, tools, ports)
  const runtimeVersion = execute([runtime, "--version"], environment)
  const pinned = pinnedRuntime()
  if (`bun@${runtimeVersion}` !== pinned) {
    throw new Error(`Use ${pinned}; selected runtime is bun@${runtimeVersion}`)
  }

  if (plan.name === "doctor") {
    const composeVersion = execute(
      [docker, "--host", "unix:///var/run/docker.sock", "compose", "version", "--short"],
      environment
    )
    const major = Number(/^v?(\d+)\./.exec(composeVersion)?.[1])
    if (!Number.isInteger(major) || major < 2) {
      throw new Error(`Docker Compose v2+ plugin required; found ${composeVersion || "unknown"}`)
    }
    console.log(`Bun runtime: ${runtimeVersion} (${runtime})`)
    console.log(`Docker Compose plugin: ${composeVersion} (${docker})`)
    console.log("No services queried or changed. Service activation remains gated by AD-45.")
    return 0
  }

  if (plan.name === "dev") {
    execute(createDatabaseReadinessPlan(root, tools, ports), environment)
  }

  const child = Bun.spawn(plan.argv, {
    cwd: root,
    env: environment,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const interrupt = (): void => child.kill("SIGINT")
  const terminate = (): void => child.kill("SIGTERM")
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", terminate)
  try {
    return await child.exited
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", terminate)
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    console.error(`dev-safe: ${error instanceof Error ? error.message : "preflight failed"}`)
    process.exitCode = 1
  })
