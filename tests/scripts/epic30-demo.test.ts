import { expect, it, vi } from "vitest"
import { mkdtemp, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { cleanupOwnedResources, persistInitialReceipt, replaceReceipt } from "../../scripts/epic30/demo"

it("attempts database cleanup even when server stop rejects, suppressing secrets", async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  await expect(cleanupOwnedResources({ stop: vi.fn().mockRejectedValue(new Error("secret")) }, { close }, true)).rejects.toThrow("Owned demo cleanup failed")
  expect(close).toHaveBeenCalledWith(true)
})

it("atomically replaces receipts while concurrent readers always see complete JSON", async () => {
  const directory = await mkdtemp(`${tmpdir()}/epic30-receipt-`)
  const file = `${directory}/receipt.json`
  try {
    await replaceReceipt(file, { status: "running" })
    let finished = false
    const writing = (async () => {
      try { for (let i = 0; i < 30; i++) await replaceReceipt(file, { status: i % 2 ? "stopped" : "running", padding: "x".repeat(10000) }) }
      finally { finished = true }
    })()
    void writing.catch(() => {}) // Keep rejection handled until the reader exits and awaits it.
    while (!finished) expect(["running", "stopped"]).toContain(JSON.parse(await readFile(file, "utf8")).status)
    await writing
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it.each(["write", "rename"])("preserves the old receipt and removes temporary files on %s failure", async stage => {
  const directory = await mkdtemp(`${tmpdir()}/epic30-receipt-failure-`)
  const file = `${directory}/receipt.json`
  try {
    await replaceReceipt(file, { status: "running" })
    const failingWrite: typeof writeFile = async (...args) => { await writeFile(...args); throw new Error("write failure") }
    const failingRename: typeof rename = async () => { throw new Error("rename failure") }
    await expect(replaceReceipt(file, { status: "stopped" }, {
      writeFile: stage === "write" ? failingWrite : writeFile,
      rename: stage === "rename" ? failingRename : rename, unlink,
    })).rejects.toThrow(`${stage} failure`)
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ status: "running" })
    expect(await readdir(directory)).toEqual(["receipt.json"])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it("discards failed startup even when successful launches would retain the database", async () => {
  const directory = await mkdtemp(`${tmpdir()}/epic30-initial-receipt-`)
  const file = `${directory}/receipt.json`
  const close = vi.fn().mockResolvedValue(undefined)
  const stop = vi.fn().mockResolvedValue(undefined)
  const demo = { receipt: { retainDatabase: true }, discard: () => cleanupOwnedResources({ stop }, { close }, true) }
  try {
    await writeFile(file, "original") // Exclusive create must fail without overwriting.
    await expect(persistInitialReceipt(file, demo)).rejects.toThrow("startup resources discarded")
    expect(close).toHaveBeenCalledWith(true)
    expect(stop).toHaveBeenCalledOnce()
    expect(await readFile(file, "utf8")).toBe("original")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
