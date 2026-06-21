import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Guards against gateway<->stdio tool drift.
 *
 * The HTTP gateway (canonical-http-gateway.ts, served at :5888/mcp) historically
 * forwarded only a subset of the stdio canonical server's memory verbs, so tools
 * like memory_promote were implemented but unreachable from Cowork/Claude. This
 * static-analysis test fails if that drift returns. No DB / network required.
 */

const GATEWAY = "src/mcp/canonical-http-gateway.ts"
const STDIO = "src/mcp/memory-server-canonical.ts"

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8")
}

/** Advertised tool names: `name: "memory_..."` descriptors. */
function advertisedMemoryVerbs(src: string): Set<string> {
  return new Set(
    [...src.matchAll(/name:\s*"(memory_[a-z_]+)"/g)].map((m) => m[1]),
  )
}

/** Dispatched tool names: `case "memory_...":` branches. */
function dispatchedMemoryVerbs(src: string): Set<string> {
  return new Set(
    [...src.matchAll(/case\s*"(memory_[a-z_]+)":/g)].map((m) => m[1]),
  )
}

describe("Gateway <-> stdio memory-verb parity", () => {
  const gateway = read(GATEWAY)
  const stdio = read(STDIO)

  it("HTTP gateway advertises every memory verb the stdio server advertises", () => {
    const stdioVerbs = advertisedMemoryVerbs(stdio)
    const gatewayVerbs = advertisedMemoryVerbs(gateway)
    const missing = [...stdioVerbs].filter((v) => !gatewayVerbs.has(v))
    expect(missing, `gateway is missing advertised verbs: ${missing.join(", ")}`).toEqual([])
  })

  it("HTTP gateway dispatches every verb it advertises (no advertised-but-unhandled tool)", () => {
    const advertised = advertisedMemoryVerbs(gateway)
    const dispatched = dispatchedMemoryVerbs(gateway)
    const undispatched = [...advertised].filter((v) => !dispatched.has(v))
    expect(undispatched, `gateway advertises but does not dispatch: ${undispatched.join(", ")}`).toEqual([])
  })

  it("covers the full canonical memory surface (regression floor of 11 verbs)", () => {
    const advertised = advertisedMemoryVerbs(gateway)
    for (const verb of [
      "memory_add",
      "memory_search",
      "memory_get",
      "memory_list",
      "memory_delete",
      "memory_update",
      "memory_promote",
      "memory_export",
      "memory_restore",
      "memory_list_deleted",
      "memory_cleanup",
    ]) {
      expect(advertised.has(verb), `gateway must expose ${verb}`).toBe(true)
    }
  })
})
