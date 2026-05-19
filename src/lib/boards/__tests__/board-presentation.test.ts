import { describe, expect, it } from "vitest"

import {
  buildBoardEvidencePanels,
  buildBoardSwitcherItems,
  createDefaultBoardRegistry,
  getBoardStatusModel,
} from "@/lib/boards"

describe("board presentation model", () => {
  it("derives a board status from the current config sections", () => {
    const registry = createDefaultBoardRegistry()
    const memoryBoard = registry.byId["memory-ops"]
    const readinessBoard = registry.byId["agent-readiness"]

    expect(memoryBoard).toBeTruthy()
    expect(readinessBoard).toBeTruthy()
    expect(getBoardStatusModel(memoryBoard!).status).toBe("blocked")
    expect(getBoardStatusModel(readinessBoard!).status).toBe("degraded")
  })

  it("builds switcher items from the registry", () => {
    const registry = createDefaultBoardRegistry()
    const items = buildBoardSwitcherItems(registry)

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "memory-ops",
          href: "/boards/memory-ops",
          sourceLabel: "Allura Brain",
          publicLabel: "Public",
        }),
        expect.objectContaining({
          id: "agent-readiness",
          href: "/boards/agent-readiness",
          sourceLabel: "Repository Config",
          publicLabel: "Private",
        }),
      ])
    )
  })

  it("builds evidence panels from the existing board config data", () => {
    const registry = createDefaultBoardRegistry()
    const board = registry.byId["memory-ops"]

    expect(board).toBeTruthy()

    const panels = buildBoardEvidencePanels(board!)

    expect(panels.map((panel) => panel.title)).toEqual([
      "Source of truth",
      "Board status model",
      "Write policy",
      "Evidence policy",
    ])
    expect(panels[0].entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Label", value: "Allura Brain" })])
    )
  })

  it("keeps bundled public examples free of private config paths", () => {
    const registry = createDefaultBoardRegistry()
    const serialized = JSON.stringify(registry.boards)

    expect(serialized).not.toContain("board-configs/private")
    expect(serialized).not.toContain(".allura/boards")
  })
})
