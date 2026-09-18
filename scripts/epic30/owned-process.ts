import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { mkdir, rmdir } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function preflightPort(port: number): Promise<number> {
  const server = createServer()
  return new Promise((resolve, reject) => {
    server.once("error", () => reject(new Error("Local demo port occupied or unavailable; occupant untouched")))
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      const actual = (server.address() as { port: number }).port
      server.close(error => error ? reject(new Error("Port preflight cleanup failed")) : resolve(actual))
    })
  })
}

export interface OwnedProcessOptions {
  cwd: string; port: number; command: string; args: string[]; env: NodeJS.ProcessEnv
  readyPath?: string; timeoutMs?: number; stopMs?: number; signal?: AbortSignal
}

/** No global process lookup/kill. The lock is fail-closed; stale locks require human inspection. */
export async function startOwnedProcess(options: OwnedProcessOptions) {
  options.signal?.throwIfAborted()
  const lock = path.join(options.cwd, ".epic30-process-lock")
  await mkdir(lock).catch(() => { throw new Error("Worktree process already owned; lock retained") })
  try { options.signal?.throwIfAborted(); await preflightPort(options.port); options.signal?.throwIfAborted() } catch (error) { await rmdir(lock); throw error }
  const runId = randomUUID()
  const url = `http://127.0.0.1:${options.port}`
  // Separate session permits bounded cleanup of this child AND its Next worker only.
  let child: import("node:child_process").ChildProcess
  try {
    child = spawn(options.command, options.args, {
      cwd: options.cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...options.env, PORT: String(options.port), ALLURA_EPIC30_PROCESS_ID: runId },
    })
  } catch {
    await rmdir(lock)
    throw new Error("Owned process spawn arguments rejected; lock released")
  }
  const events: string[] = []
  const record = (event: string) => { events.push(event); if (events.length > 40) events.shift() }
  // Never retain arbitrary child logs: whitelist categories, not credential-bearing text.
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (data: Buffer) => {
    const text = data.toString()
    for (const category of ["EADDRINUSE", "Ready in", "Compiled", "synthetic local database read unavailable", "Error"]) {
      if (text.includes(category)) record(`output:${category}`)
    }
  })
  let closed = false; let failed = false
  child.once("error", () => { failed = true; record("spawn:error") })
  child.once("exit", code => record(`exit:${code}`))
  child.once("close", () => { closed = true })
  async function waitClosed(ms: number) {
    const deadline = Date.now() + ms
    while (!closed && Date.now() < deadline) await delay(20)
    return closed
  }
  function signal(signal: NodeJS.Signals) {
    if (!child.pid || closed) return
    try { process.kill(-child.pid, signal); record(`shutdown:${signal}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw new Error("Owned process signal failed") }
  }
  let stopped = false
  async function stop() {
    if (stopped) return
    signal("SIGTERM")
    if (!await waitClosed(options.stopMs ?? 3000)) {
      signal("SIGKILL")
      if (!await waitClosed(options.stopMs ?? 3000)) throw new Error("Owned process cleanup timed out; lock retained")
    }
    await preflightPort(options.port).catch(() => { throw new Error("Owned process exited but port not released; lock retained; no occupant killed") })
    await rmdir(lock)
    stopped = true
  }
  try {
    const deadline = Date.now() + (options.timeoutMs ?? 60_000)
    while (Date.now() < deadline) {
      options.signal?.throwIfAborted()
      if (failed || closed || child.exitCode !== null) throw new Error(`Owned process spawn/exit failure (${events.join(",")})`)
      try {
        const response = await fetch(url + (options.readyPath ?? "/dashboard"), {
          signal: AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(Math.min(2000, Math.max(1, deadline - Date.now())))]),
        })
        const html = await response.text()
        options.signal?.throwIfAborted()
        if (response.ok && html.includes(runId) && !closed && !failed && child.exitCode === null) {
          return { url, runId, pid: child.pid!, stop, diagnostics: () => events.join(","), child }
        }
      } catch { /* A bounded readiness retry is not a process respawn. */ }
      await delay(100)
    }
    throw new Error(`Owned process readiness timed out (${events.join(",")})`)
  } catch (error) { await stop(); throw error }
}
