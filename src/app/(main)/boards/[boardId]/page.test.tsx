import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import BoardsPage from "../page"
import { generateMetadata, generateStaticParams } from "./page"
import BoardDetailPage from "./page"

describe("/boards/[boardId] route loading", () => {
  it("generates params for registered boards", () => {
    expect(generateStaticParams()).toEqual(
      expect.arrayContaining([{ boardId: "memory-ops" }, { boardId: "agent-readiness" }])
    )
  })

  it("generates metadata from board config", async () => {
    await expect(generateMetadata({ params: Promise.resolve({ boardId: "memory-ops" }) })).resolves.toMatchObject({
      title: "Memory Operations | Allura Boards",
      description: expect.stringContaining("governed memory work"),
    })
  })

  it("renders the board switcher, status model, and evidence panels", async () => {
    const listMarkup = renderToStaticMarkup(BoardsPage())
    const detailPage = await BoardDetailPage({ params: Promise.resolve({ boardId: "memory-ops" }) })
    const detailMarkup = renderToStaticMarkup(detailPage)

    expect(listMarkup).toContain("Board switcher")
    expect(listMarkup).toContain("Board status")
    expect(listMarkup).toContain("Source truth")

    expect(detailMarkup).toContain("Status and contract")
    expect(detailMarkup).toContain("Source of truth")
    expect(detailMarkup).toContain("Evidence panels")
    expect(detailMarkup).toContain("Board lanes")
  })
})
