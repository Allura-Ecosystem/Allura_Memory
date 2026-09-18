// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { MyWorkWorkspace } from "../my-work-workspace"

const DOCUMENTS = [
  {
    id: "shipment",
    groupId: "allura-epic30-local",
    workspaceId: "epic30-local-workspace",
    ownerId: "owner-user",
    departmentId: null,
    visibility: "private" as const,
    title: "Shipment exception review",
    content: "Synthetic owner-only content.",
    updatedAt: "2026-09-17T00:00:00.000Z",
  },
  {
    id: "checklist",
    groupId: "allura-epic30-local",
    workspaceId: "epic30-local-workspace",
    ownerId: "department-curator",
    departmentId: "operations",
    visibility: "department" as const,
    title: "Deployment checklist",
    content: "Synthetic Operations content.",
    updatedAt: "2026-09-16T00:00:00.000Z",
  },
]

afterEach(cleanup)

describe("MyWorkWorkspace", () => {
  it("returns keyboard focus to the comparison opener", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="ready" />)
    const opener = screen.getByRole("button", { name: "Open deployment checklist" })
    fireEvent.click(opener)
    const close = screen.getByRole("button", { name: "Close pane" })
    close.focus()
    fireEvent.click(close)
    expect(document.activeElement).toBe(opener)
    expect(screen.queryByRole("complementary", { name: "Comparison pane" })).toBeNull()
  })

  it("navigates the main document and restores a private selection", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="ready" />)
    fireEvent.click(screen.getByRole("button", { name: "Deployment checklist operations" }))
    expect(screen.getByRole("heading", { name: "Deployment checklist" })).toBeTruthy()
    expect(screen.getByText("Synthetic Operations content.")).toBeTruthy()
    expect(screen.queryByText("Synthetic owner-only content.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Shipment exception review Private" }))
    expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy()
    expect(screen.getByText("Synthetic owner-only content.")).toBeTruthy()
  })

  it("falls back to the main document if navigation removed the opener", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="ready" />)
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    fireEvent.click(screen.getByRole("button", { name: "Deployment checklist operations" }))
    const close = screen.getByRole("button", { name: "Close pane" })
    close.focus(); fireEvent.click(close)
    expect(document.activeElement?.tagName).toBe("ARTICLE")
  })
  it("keeps the synthetic workspace clearly labeled and opens a second reading pane", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="ready" />)

    expect(screen.getByText("Synthetic local test data")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))

    expect(screen.getByRole("heading", { name: "Deployment checklist" })).toBeTruthy()
    expect(screen.getByText("Comparison pane — synthetic database")).toBeTruthy()
  })

  it("does not invent relationships between co-visible documents", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="ready" />)
    expect(screen.queryByRole("heading", { name: "Linked context" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Available department document" })).toBeTruthy()
    expect(screen.getByText("Available for comparison; no document relationship has been verified.")).toBeTruthy()
  })

  it("keeps Ask allura unavailable rather than fabricating an AI response", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="ready" />)

    fireEvent.click(screen.getByRole("button", { name: "Ask allura" }))

    expect(screen.getByText("Unavailable in this local fixture")).toBeTruthy()
    expect(screen.queryByText(/generated answer/i)).toBeNull()
  })

  it("fails closed when the explicit local database is unavailable", () => {
    render(<MyWorkWorkspace documents={[]} dataState="unavailable" />)

    expect(screen.getByRole("heading", { name: "Local data unavailable" })).toBeTruthy()
    expect(screen.queryByText("Shipment exception review")).toBeNull()
  })
})
