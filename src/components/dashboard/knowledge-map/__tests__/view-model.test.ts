import { describe, expect, it } from "vitest"

import { completeFocusedSubgraph } from "@/test/fixtures/focused-subgraph"

import { filterGraph, mergeStableByKey } from "../view-model"

describe("knowledge map view model", () => {
  it("keeps edge endpoint closure while filtering", () => {
    const page = completeFocusedSubgraph()
    if (page.state !== "complete") throw new Error("fixture contract")
    const visible = filterGraph(page.nodes, page.edges, new Set(["product:Memory"]), new Set())
    expect(visible.nodes.map(({ key }) => key)).toEqual(["structural:artifact"])
    expect(visible.edges).toEqual([])
  })

  it("deduplicates continuation pages by stable key", () => {
    expect(mergeStableByKey([{ key: "a", value: 1 }], [{ key: "a", value: 1 }, { key: "b", value: 3 }])).toEqual({
      items: [{ key: "a", value: 1 }, { key: "b", value: 3 }],
      added: 1,
      conflictKey: null,
    })
  })

  it("fails closed when a stable key changes payload", () => {
    expect(mergeStableByKey([{ key: "a", value: 1 }], [{ key: "a", value: 2 }])).toEqual({
      items: [{ key: "a", value: 1 }],
      added: 0,
      conflictKey: "a",
    })
  })
})
