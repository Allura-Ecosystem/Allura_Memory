import { describe, expect, it } from "vitest"

import { BOARD_EXAMPLES } from "@/lib/boards/examples"
import {
  addBoard,
  createBoardRegistry,
  createDefaultBoardRegistry,
  getBoardConfig,
  getBoardByRoute,
  listBoardConfigs,
  loadBoardRegistry,
  seedDefaultBoards,
  validateBoardRegistry,
} from "@/lib/boards"

describe("board registry", () => {
  it("seeds sanitized example boards", () => {
    const boards = seedDefaultBoards()

    expect(boards.map((board) => board.id)).toEqual(["memory-ops", "agent-readiness"])
    expect(boards.every((board) => board.source.public === true || board.source.public === false)).toBe(true)
  })

  it("accepts the bundled examples as valid board configs", () => {
    for (const board of BOARD_EXAMPLES) {
      expect(() => addBoard(createBoardRegistry(), board)).not.toThrow()
    }
  })

  it("indexes boards by id and route", () => {
    const registry = createDefaultBoardRegistry()

    expect(getBoardConfig("memory-ops", registry)?.title).toBe("Memory Operations")
    expect(getBoardByRoute("/boards/agent-readiness", registry)?.title).toBe("Agent Readiness")
  })

  it("reports a valid default registry", () => {
    const registry = createDefaultBoardRegistry()
    const result = validateBoardRegistry(registry)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("rejects duplicate board ids", () => {
    const board = listBoardConfigs()[0]

    expect(() => loadBoardRegistry([board, board])).toThrow("Duplicate board config id")
  })
})
