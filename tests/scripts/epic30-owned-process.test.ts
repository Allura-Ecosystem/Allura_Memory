import { createServer } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { afterEach, expect, it } from "vitest"
import { startOwnedProcess, preflightPort } from "../../scripts/epic30/owned-process"
import { startupCancellation } from "../../scripts/epic30/demo"
import { EventEmitter } from "node:events"
const dirs: string[] = []
it("cancels during readiness and releases only its owned child and lock", async () => {
  const o = await options()
  o.args = ["-e", "setInterval(()=>{},1000)"]
  const source = new EventEmitter()
  const cancellation = startupCancellation(source)
  const timer = setTimeout(() => source.emit("SIGTERM"), 100)
  try { await expect(startOwnedProcess({ ...o, signal: cancellation.signal })).rejects.toMatchObject({ name: "AbortError" }) }
  finally { clearTimeout(timer); cancellation.dispose() }
  expect(await preflightPort(o.port)).toBe(o.port)
  const second = await startOwnedProcess({ ...o, args: ["-e", "require('http').createServer((q,s)=>s.end(process.env.ALLURA_EPIC30_PROCESS_ID)).listen(process.env.PORT,'127.0.0.1')"] }); await second.stop()
})
async function options() {
  const cwd = await mkdtemp(`${tmpdir()}/epic30-lifecycle-`); dirs.push(cwd)
  const port = await preflightPort(0)
  return { cwd, port, command: "node", args: ["-e", `require('http').createServer((q,s)=>s.end(process.env.ALLURA_EPIC30_PROCESS_ID)).listen(process.env.PORT,'127.0.0.1')`], env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" as const }, readyPath: "/", timeoutMs: 1500, stopMs: 300 }
}
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })
it("refuses occupied listener and leaves occupant responsive", async () => {
  const o = await options()
  const occupant = createServer((_q,s) => s.end("unrelated"))
  await new Promise<void>(r => occupant.listen(o.port,"127.0.0.1",r))
  try {
    await expect(startOwnedProcess(o)).rejects.toThrow(/occupied/)
    expect(await (await fetch(`http://127.0.0.1:${o.port}`)).text()).toBe("unrelated")
  } finally { await new Promise<void>(r => occupant.close(() => r())) }
})
it("binds responder to child, refuses second owner, and releases port/lock", async () => {
  const o = await options(); const process = await startOwnedProcess(o)
  try {
    expect(await (await fetch(process.url)).text()).toBe(process.runId)
    await expect(startOwnedProcess(o)).rejects.toThrow(/owned/)
  } finally { await process.stop() }
  expect(await preflightPort(o.port)).toBe(o.port)
  const second = await startOwnedProcess(o); await second.stop()
})
it.each(["spawn", "exit", "timeout", "wrong-responder"])("bounds %s failure and releases owned resources", async mode => {
  const o = await options()
  if (mode === "spawn") o.command = "/definitely-missing-epic30"
  if (mode === "exit") o.args = ["-e", "process.exit(7)"]
  if (mode === "timeout") o.args = ["-e", "setInterval(()=>{},1000)"]
  if (mode === "wrong-responder") o.args = ["-e", "require('http').createServer((q,s)=>s.end('not-owned')).listen(process.env.PORT,'127.0.0.1')"]
  await expect(startOwnedProcess(o)).rejects.toThrow(/spawn|exit|readiness/)
  expect(await preflightPort(o.port)).toBe(o.port)
})
it("sanitizes arbitrary child diagnostics", async () => {
  const o = await options()
  o.args[1] += ";console.error('Error password=not-a-real-secret')"
  const server = await startOwnedProcess(o)
  try {
    expect(server.diagnostics()).toContain("output:Error")
    expect(server.diagnostics()).not.toContain("not-a-real-secret")
    expect(server.diagnostics()).not.toContain("password")
  } finally { await server.stop() }
})
it("reports cleanup failure without killing a replacement occupant", async () => {
  const o = await options(); const server = await startOwnedProcess(o)
  const exited = new Promise<void>(resolve => server.child.once("close", () => resolve()))
  server.child.kill("SIGTERM"); await exited
  const occupant = createServer((_q,s) => s.end("replacement"))
  await new Promise<void>(resolve => occupant.listen(o.port,"127.0.0.1",resolve))
  try {
    await expect(server.stop()).rejects.toThrow(/port not released/)
    expect(await (await fetch(server.url)).text()).toBe("replacement")
  } finally { await new Promise<void>(resolve => occupant.close(() => resolve())) }
  await server.stop()
})
it("releases lock on synchronous spawn argument rejection", async () => {
  const o = await options()
  await expect(startOwnedProcess({ ...o, command: "" })).rejects.toThrow()
  const server = await startOwnedProcess(o); await server.stop()
})
it("escalates only owned uncooperative child and bounds shutdown", async () => {
  const o = await options()
  o.args[1] += ";process.on('SIGTERM',()=>{})"
  const server = await startOwnedProcess(o)
  await server.stop()
  expect(server.diagnostics()).toContain("shutdown:SIGKILL")
  expect(await preflightPort(o.port)).toBe(o.port)
})
