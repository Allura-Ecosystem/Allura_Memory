import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPlan } from "./commands"
import { assertSafeWorktree, buildEnvironment } from "./environment"

const root = resolve(import.meta.dir, "../..")

async function main(): Promise<number> {
  const plan = createPlan(root, process.argv.slice(2), process.execPath)
  assertSafeWorktree(root)
  const pinned = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).packageManager
  if (`bun@${Bun.version}` !== pinned) throw new Error(`Use ${pinned}; current runtime is bun@${Bun.version}`)
  if (plan.name === "doctor") {
    console.log(`Preflight OK: ${pinned}; linked worktree; no actual dotenv files`)
    console.log("Database: 127.0.0.1:55432/allura_dev; dashboard: http://127.0.0.1:4100")
    console.log(`Dependencies: ${existsSync(resolve(root, "node_modules/next")) ? "present" : "missing (run install)"}`)
    console.log("No services queried or started. Use status to inspect only allura-dev-safe.")
    return 0
  }
  const child = Bun.spawn(plan.argv, {
    cwd: root,
    env: buildEnvironment(process.env, plan.name),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const interrupt = () => child.kill("SIGINT")
  const terminate = () => child.kill("SIGTERM")
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
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(`dev-safe: ${error instanceof Error ? error.message : "preflight failed"}`)
    process.exitCode = 1
  })
