import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockQuery, mockGenerateEmbedding } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGenerateEmbedding: vi.fn(),
}))

vi.mock("./connection", () => ({
  getRuVectorPool: vi.fn(() => ({ query: mockQuery })),
  isRuVectorEnabled: vi.fn(() => true),
  checkRuVectorHealth: vi.fn(),
}))

vi.mock("./embedding-service", () => ({
  generateEmbedding: mockGenerateEmbedding,
}))

import { retrieveMemories } from "./bridge"

describe("RuVector retrieval embedding budget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateEmbedding.mockResolvedValue(null)
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it("bounds query embedding generation to five seconds", async () => {
    await retrieveMemories({
      userId: "allura-test",
      query: "test",
    })

    expect(mockGenerateEmbedding).toHaveBeenCalledWith("test", 5_000)
  })
})
