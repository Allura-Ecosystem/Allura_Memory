import { mkdir, writeFile, readFile, rename, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import type { EventEmitter } from "node:events"
import path from "node:path"
import { provisionSyntheticDatabase, manifest } from "./synthetic-database"
import { preflightPort, startOwnedProcess } from "./owned-process"

/** Retention is opt-in. Tests call the same launcher with drop-on-stop. */
export async function launchSyntheticDemo(retainDatabase = false, port = 4100, signal?: AbortSignal) {
  signal?.throwIfAborted()
  await preflightPort(port) // No database creation when an unrelated listener owns the port.
  const database = await provisionSyntheticDatabase(signal)
  let server: Awaited<ReturnType<typeof startOwnedProcess>> | undefined
  try {
    signal?.throwIfAborted()
    server = await startOwnedProcess({ cwd: process.cwd(), port, command: "node",
      signal,
      args: ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
      env: { ...process.env, ...database.appEnvironment, NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
        ALLURA_DEV_AUTH_ENABLED: "true", ALLURA_DEMO_DEV_AUTH_FORCE: "true", ALLURA_DEV_AUTH_GROUP_ID: "allura-epic30-local",
        ALLURA_DEV_AUTH_WORKSPACE_ID: "epic30-local-workspace", ALLURA_DEV_AUTH_USER_ID: "owner-user", ALLURA_DEV_AUTH_ROLE: "viewer" },
    })
    const response = await fetch(server.url + "/dashboard", { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)]) })
    const html = await response.text()
    const docs = await database.ownerPool.query<{id: string; content: string}>("SELECT id,content FROM brain_documents ORDER BY id")
    signal?.throwIfAborted()
    const expected: string[] = [...manifest.principals["owner-user"]].sort()
    const visible = docs.rows.filter(d => html.includes(d.id)).map(d => d.id)
    if (response.status !== 200 || !html.includes(server.runId) || html.includes("Local data unavailable") ||
        JSON.stringify(visible) !== JSON.stringify(expected) || docs.rows.some(d => html.includes(d.content) !== expected.includes(d.id))) {
      throw new Error("Synthetic demo HTTP content verification failed")
    }
    const receipt = { ...database.receipt, url: server.url + "/dashboard", processRunId: server.runId,
      childPid: server.pid, supervisorPid: process.pid, supervisorStartTicks: await processStartTicks(process.pid),
      cwd: process.cwd(), retainDatabase, httpStatus: response.status, visibleDocumentIds: visible,
      status: "running", verifiedAt: new Date().toISOString() }
    signal?.throwIfAborted()
    return { receipt, server,
      async stop() { await cleanupOwnedResources(server, database, !retainDatabase) },
      async discard() { await cleanupOwnedResources(server, database, true) },
    }
  } catch (error) { await cleanupOwnedResources(server, database, true); throw error }
}

export async function cleanupOwnedResources(server: { stop(): Promise<void> } | undefined, database: { close(drop: boolean): Promise<void> }, drop: boolean): Promise<void> {
  let failed = false
  try { await server?.stop() } catch { failed = true }
  try { await database.close(drop) } catch { failed = true }
  if (failed) throw new Error("Owned demo cleanup failed; owned resources require inspection")
}

export async function persistInitialReceipt(receiptPath: string, demo: { receipt: unknown; discard(): Promise<void> }): Promise<void> {
  try {
    await mkdir(path.dirname(receiptPath), { recursive: true, mode: 0o700 })
    await writeFile(receiptPath, JSON.stringify(demo.receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" })
  } catch {
    await demo.discard()
    throw new Error("Demo receipt persistence failed; owned startup resources discarded")
  }
}

export async function replaceReceipt(receiptPath: string, receipt: unknown, io = { writeFile, rename, unlink }): Promise<void> {
  const temporary = `${receiptPath}.${randomUUID()}.tmp`
  try {
    await io.writeFile(temporary, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" })
    await io.rename(temporary, receiptPath)
  } finally { await io.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error }) }
}

async function processStartTicks(pid: number): Promise<string> {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8")
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]
}

/** Installed before acquisition, retained throughout startup and running state. */
export function startupCancellation(source: Pick<EventEmitter, "on" | "off"> = process) {
  const controller = new AbortController()
  let stopRunning: (() => Promise<void>) | undefined
  const onSignal = () => { controller.abort(); void stopRunning?.() }
  source.on("SIGTERM", onSignal); source.on("SIGINT", onSignal)
  return {
    signal: controller.signal,
    setStop(stop: () => Promise<void>) { stopRunning = stop },
    dispose() { source.off("SIGTERM", onSignal); source.off("SIGINT", onSignal) },
  }
}

async function main() {
  if (process.argv[2] === "stop") {
    const receipt = JSON.parse(await readFile(process.argv[3], "utf8"))
    const pid = receipt.supervisorPid
    if (!Number.isInteger(pid) || pid <= 1 || receipt.status !== "running" ||
        await processStartTicks(pid) !== receipt.supervisorStartTicks ||
        !(await readFile(`/proc/${pid}/cmdline`, "utf8")).includes("scripts/epic30/demo.ts") ||
        receipt.cwd !== process.cwd()) throw new Error("Owned demo supervisor identity mismatch; no signal sent")
    process.kill(pid,"SIGTERM")
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const state = JSON.parse(await readFile(process.argv[3], "utf8"))
      if (state.status === "stopped") { console.info(state.retainDatabase ? "Owned demo stopped; synthetic database retained as documented" : "Owned demo stopped; disposable test database dropped and absence verified"); return }
      await new Promise(resolve => setTimeout(resolve,100))
    }
    throw new Error("Owned demo stop not verified; inspect retained receipt; no other process signalled")
  }
  if (process.argv[2] !== "launch") throw new Error("Use: bun scripts/epic30/demo.ts launch | stop <receipt.json>")
  const cancellation = startupCancellation()
  let demo: Awaited<ReturnType<typeof launchSyntheticDemo>>
  try { demo = await launchSyntheticDemo(process.argv[3] !== "--discard-on-stop", 4100, cancellation.signal) }
  catch (error) { cancellation.dispose(); throw error }
  const directory = path.resolve("artifacts/epic30-local", demo.receipt.runId)
  const receiptPath = path.join(directory,"receipt.json")
  try {
    await persistInitialReceipt(receiptPath, demo)
  } catch (error) { cancellation.dispose(); throw error }
  console.info(JSON.stringify({ url: demo.receipt.url, receipt: receiptPath,
    database: demo.receipt.databaseName, supervisorPid: process.pid,
    stop: `bun scripts/epic30/demo.ts stop ${receiptPath}`, documents: demo.receipt.visibleDocumentIds }))
  let stopping = false
  const stop = async () => {
    if (stopping) return; stopping = true
    try {
      await demo.stop()
      await replaceReceipt(receiptPath, { ...demo.receipt, status: "stopped", stoppedAt: new Date().toISOString() })
      process.exit(0)
    } catch { console.error("Owned demo cleanup failed; receipt retained, no unrelated resources touched"); process.exit(1) }
  }
  cancellation.setStop(stop)
  demo.server.child.once("exit",stop)
  if (cancellation.signal.aborted || demo.server.child.exitCode !== null || demo.server.child.signalCode !== null) await stop()
}

if (import.meta.main) main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : ""
  const category = ["POSTGRES_PASSWORD", "POSTGRES_APP_USER", "Synthetic provisioning", "Synthetic demo HTTP", "Synthetic database", "Owned process", "Local demo port", "Worktree process", "Demo receipt"].find(prefix => message.startsWith(prefix)) ?? "unexpected launcher error"
  console.error(`Epic30 local demo failed: ${category} (details suppressed)`)
  process.exitCode = 1
})
