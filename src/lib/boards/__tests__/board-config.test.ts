import { describe, expect, it } from "vitest"

import { BoardConfigSchema, getBoardConfig, listBoardConfigs, listBoardIds, loadBoardRegistry } from "@/lib/boards"

describe("board config registry", () => {
  it("validates every registered board", () => {
    for (const board of listBoardConfigs()) {
      expect(BoardConfigSchema.safeParse(board).success).toBe(true)
    }
  })

  it("loads a board config by ID", () => {
    const board = getBoardConfig("memory-ops")

    expect(board?.title).toBe("Memory Operations")
    expect(board?.source.public).toBe(true)
    expect(board?.writePolicy.requiresHumanApproval).toBe(true)
  })

  it("returns null for unknown board IDs", () => {
    expect(getBoardConfig("private-customer-board")).toBeNull()
  })

  it("exposes route params for registered boards", () => {
    expect(listBoardIds()).toContain("memory-ops")
    expect(listBoardIds()).toContain("agent-readiness")
  })

  it("rejects duplicate board IDs", () => {
    const board = listBoardConfigs()[0]

    expect(() => loadBoardRegistry([board, board])).toThrow("Duplicate board config id")
  })

  it("rejects invalid config shape loudly", () => {
    const result = BoardConfigSchema.safeParse({
      id: "bad board id",
      title: "",
      summary: "Missing required policy fields",
      adapter: "static-example",
      sections: [],
    })

    expect(result.success).toBe(false)
  })
})
