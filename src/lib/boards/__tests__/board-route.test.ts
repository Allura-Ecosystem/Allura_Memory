import { describe, expect, it } from "vitest"

import { resolveBoard, resolveBoardRoute } from "@/lib/boards"

describe("board route resolution", () => {
  it("resolves a board from its board id", () => {
    const board = resolveBoard("memory-ops")

    expect(board?.id).toBe("memory-ops")
    expect(board?.title).toBe("Memory Operations")
    expect(board?.source.type).toBe("allura-brain")
  })

  it("resolves a board from its route", () => {
    const board = resolveBoardRoute("/boards/agent-readiness")

    expect(board?.id).toBe("agent-readiness")
    expect(board?.writePolicy.mode).toBe("read-only")
  })

  it("returns null for an unknown board", () => {
    expect(resolveBoard("unknown-board")).toBeNull()
    expect(resolveBoardRoute("/boards/unknown-board")).toBeNull()
  })
})
