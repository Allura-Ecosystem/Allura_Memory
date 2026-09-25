// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
})

describe("MyWorkWorkspace", () => {
  it("returns keyboard focus to the comparison opener", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    const opener = screen.getByRole("button", { name: "Open deployment checklist" })
    fireEvent.click(opener)
    const close = screen.getByRole("button", { name: "Close pane" })
    close.focus()
    fireEvent.click(close)
    expect(document.activeElement).toBe(opener)
    expect(screen.queryByRole("complementary", { name: "Comparison pane" })).toBeNull()
  })

  it("uses a contained modal dialog on mobile and restores the opener", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 760px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    const opener = screen.getByRole("button", { name: "Open deployment checklist" })
    fireEvent.click(opener)

    const dialog = screen.getByRole("dialog", { name: "Comparison pane" })
    const dismiss = screen.getByRole("button", { name: "Dismiss comparison" })
    const close = screen.getByRole("button", { name: "Close pane" })
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(document.activeElement).toBe(dismiss)
    const article = screen.getByRole("heading", { name: "Shipment exception review" }).closest("article")!
    expect(article.hasAttribute("inert")).toBe(true)
    let inertWhenFocusReturned: boolean | undefined
    opener.addEventListener("focus", () => { inertWhenFocusReturned = article.hasAttribute("inert") })

    close.focus()
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(document.activeElement).toBe(dismiss)
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Comparison pane" })).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(inertWhenFocusReturned).toBe(false)
  })

  it("preserves pre-existing inert state when the mobile dialog closes", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 760px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    const toolbar = screen.getByRole("heading", { name: "Read, connect, and verify." }).closest("header")!
    toolbar.setAttribute("inert", "")
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    fireEvent.click(screen.getByRole("button", { name: "Close pane" }))

    expect(toolbar.hasAttribute("inert")).toBe(true)
    expect(screen.getByRole("heading", { name: "Shipment exception review" }).closest("article")?.hasAttribute("inert")).toBe(false)
  })

  it("clears a removed mobile comparison without leaving inert state or reopening it", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 760px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const { rerender } = render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    expect(screen.getByRole("dialog", { name: "Comparison pane" })).toBeTruthy()

    rerender(<MyWorkWorkspace documents={[DOCUMENTS[0]]} dataState="complete" />)
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Comparison pane" })).toBeNull())
    const article = screen.getByRole("heading", { name: "Shipment exception review" }).closest("article")!
    expect(article.hasAttribute("inert")).toBe(false)
    expect(document.activeElement).toBe(article)

    rerender(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.queryByRole("dialog", { name: "Comparison pane" })).toBeNull()
    expect(screen.getByText("Context map")).toBeTruthy()
  })

  it("reconciles an active document removed by a prop update", async () => {
    const { rerender } = render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    fireEvent.click(screen.getByRole("button", { name: "Deployment checklist operations" }))
    rerender(<MyWorkWorkspace documents={[DOCUMENTS[0]]} dataState="complete" />)

    await waitFor(() => expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy())
    expect(screen.getByRole("button", { name: "Shipment exception review Private" }).getAttribute("aria-current")).toBe("page")
  })

  it("updates responsive semantics and cleans up a modern media listener", () => {
    let listener: (() => void) | undefined
    const media = {
      matches: false,
      media: "(max-width: 760px)",
      addEventListener: vi.fn((_event: string, callback: () => void) => { listener = callback }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal("matchMedia", vi.fn(() => media))
    const { unmount } = render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    expect(screen.getByRole("complementary", { name: "Comparison pane" })).toBeTruthy()

    act(() => { media.matches = true; listener?.() })
    expect(screen.getByRole("dialog", { name: "Comparison pane" })).toBeTruthy()
    unmount()
    expect(media.removeEventListener).toHaveBeenCalledWith("change", listener)
  })

  it("supports and cleans up a legacy media listener", () => {
    let listener: (() => void) | undefined
    const media = {
      matches: false,
      media: "(max-width: 760px)",
      addListener: vi.fn((callback: () => void) => { listener = callback }),
      removeListener: vi.fn(),
    }
    vi.stubGlobal("matchMedia", vi.fn(() => media))
    const { unmount } = render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))

    act(() => { media.matches = true; listener?.() })
    expect(screen.getByRole("dialog", { name: "Comparison pane" })).toBeTruthy()
    unmount()
    expect(media.removeListener).toHaveBeenCalledWith(listener)
  })

  it("keeps the desktop comparison as an ordinary complementary pane", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.getByRole("tablist", { name: "Open memory tabs" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    const pane = screen.getByRole("complementary", { name: "Comparison pane" })
    expect(pane.hasAttribute("aria-modal")).toBe(false)
    expect(screen.getByText("Comparison")).toBeTruthy()
  })

  it("lets keyboard users focus the document tab and each auxiliary pane", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    fireEvent.click(screen.getByRole("button", { name: "Focus context map" }))
    expect(document.activeElement).toBe(screen.getByRole("complementary", { name: "Authorized document context map" }))
    const documentTab = screen.getByRole("tab", { name: "Focus document: Shipment exception review" })
    documentTab.focus()
    expect(document.activeElement).toBe(documentTab)
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    fireEvent.click(screen.getByRole("button", { name: "Focus comparison pane" }))
    expect(document.activeElement).toBe(screen.getByRole("complementary", { name: "Comparison pane" }))
  })

  it("opens documents as real memory tabs and supports arrow-key navigation", async () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.getAllByRole("tab")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Deployment checklist operations" }))

    const shipmentTab = screen.getByRole("tab", { name: "Focus document: Shipment exception review" })
    const checklistTab = screen.getByRole("tab", { name: "Focus document: Deployment checklist" })
    expect(checklistTab.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(checklistTab.id)

    checklistTab.focus()
    fireEvent.keyDown(checklistTab, { key: "ArrowLeft" })
    await waitFor(() => expect(document.activeElement).toBe(shipmentTab))
    expect(shipmentTab.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy()
  })

  it("does not offer focus on the hidden mobile map", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 760px)", media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })))
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.getByRole("button", { name: "Focus context map" }).hasAttribute("disabled")).toBe(true)
  })

  it("navigates the main document and restores a private selection", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.getByRole("button", { name: "Shipment exception review Private" }).getAttribute("aria-current")).toBe("page")
    fireEvent.click(screen.getByRole("button", { name: "Deployment checklist operations" }))
    expect(screen.getByRole("heading", { name: "Deployment checklist" })).toBeTruthy()
    expect(screen.getByText("Synthetic Operations content.")).toBeTruthy()
    expect(screen.queryByText("Synthetic owner-only content.")).toBeNull()
    expect(screen.getByRole("button", { name: "Deployment checklist operations" }).getAttribute("aria-current")).toBe("page")
    fireEvent.click(screen.getByRole("button", { name: "Shipment exception review Private" }))
    expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy()
    expect(screen.getByText("Synthetic owner-only content.")).toBeTruthy()
  })

  it("falls back to the main document if navigation removed the opener", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    const opener = screen.getByRole("button", { name: "Open deployment checklist" })
    fireEvent.click(opener)
    opener.remove()
    const close = screen.getByRole("button", { name: "Close pane" })
    close.focus(); fireEvent.click(close)
    expect(document.activeElement?.tagName).toBe("ARTICLE")
  })
  it("keeps the synthetic workspace clearly labeled and opens a second reading pane", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)

    expect(screen.getByText("Synthetic local test data")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))

    expect(screen.getByRole("heading", { name: "Deployment checklist" })).toBeTruthy()
    expect(screen.getByText("Comparison pane — synthetic database")).toBeTruthy()
  })

  it("does not invent relationships between co-visible documents", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.queryByRole("heading", { name: "Linked context" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Available department document" })).toBeTruthy()
    expect(screen.getByText("Available for comparison; no document relationship has been verified.")).toBeTruthy()
  })

  it("keeps Ask allura unavailable rather than fabricating an AI response", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)

    const askButtons = screen.getAllByRole("button", { name: /ask allura/i })
    const statusId = askButtons[0].getAttribute("aria-controls")
    expect(statusId).toBeTruthy()
    expect(askButtons[1].getAttribute("aria-controls")).toBe(statusId)
    expect(askButtons.every((button) => button.getAttribute("aria-expanded") === "false")).toBe(true)
    fireEvent.click(askButtons[0])

    expect(screen.getByText("Unavailable in this local fixture")).toBeTruthy()
    expect(document.getElementById(statusId!)).toBeTruthy()
    expect(askButtons.every((button) => button.getAttribute("aria-expanded") === "true")).toBe(true)
    expect(screen.queryByText("⌘ K")).toBeNull()
    expect(screen.queryByText("⌘ ↵")).toBeNull()
    expect(screen.queryByText(/generated answer/i)).toBeNull()
  })

  it("closes comparison before selecting the compared document", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    fireEvent.click(screen.getByRole("button", { name: "Open deployment checklist" }))
    fireEvent.click(screen.getByRole("button", { name: "Deployment checklist operations" }))

    expect(screen.queryByRole("complementary", { name: "Comparison pane" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Deployment checklist" })).toBeTruthy()
    expect(screen.getByText("Context map")).toBeTruthy()
  })

  it("discloses context-map truncation and formats timestamps in UTC", () => {
    const manyDocuments = Array.from({ length: 7 }, (_, index) => ({
      ...DOCUMENTS[1],
      id: `doc-${index}`,
      title: `Document ${index}`,
    }))
    render(<MyWorkWorkspace documents={manyDocuments} dataState="complete" />)

    expect(screen.getByText(/Showing 6 of 7 visible documents/)).toBeTruthy()
    expect(screen.getByText("Updated 2026-09-16 00:00 UTC")).toBeTruthy()
  })

  it("marks unavailable rail actions as disabled rather than interactive", () => {
    render(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)

    expect(screen.getByRole("button", { name: "Documents" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("button", { name: "Memory map is shown in the current workspace" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Workspace scope is verified server-side" }).hasAttribute("disabled")).toBe(true)
  })

  it("fails closed when the explicit local database is unavailable", () => {
    render(<MyWorkWorkspace documents={[]} dataState="unavailable" />)

    expect(screen.getByRole("heading", { name: "Local data unavailable" })).toBeTruthy()
    expect(screen.queryByText("Shipment exception review")).toBeNull()
  })

  it.each([
    ["loading", "Loading authorized workspace"],
    ["forbidden", "Access not permitted"],
    ["stale", "Workspace needs refresh"],
    ["degraded", "Workspace temporarily unavailable"],
    ["conflict", "Workspace changed"],
    ["error", "Workspace unavailable"],
    ["unavailable", "Local data unavailable"],
  ] as const)("renders the %s truth state without protected document disclosure", (state, heading) => {
    const { container } = render(<MyWorkWorkspace documents={DOCUMENTS} dataState={state} />)

    expect(screen.getByRole("heading", { name: heading })).toBeTruthy()
    expect(container.querySelector(`[data-surface-state="${state}"]`)).toBeTruthy()
    expect(screen.queryByText("Shipment exception review")).toBeNull()
    expect(screen.queryByText("Synthetic owner-only content.")).toBeNull()
    expect(screen.queryByText("2 visible")).toBeNull()
    expect(screen.queryByText("allura-epic30-local")).toBeNull()
    expect(screen.queryByText("epic30-local-workspace")).toBeNull()
    expect(screen.queryByText("owner-user")).toBeNull()
    expect(screen.queryByText("department-curator")).toBeNull()
    expect(screen.queryByText("operations")).toBeNull()
    expect(screen.queryByText("2026-09-17T00:00:00.000Z")).toBeNull()
  })

  it("renders explicit empty and complete truth states", () => {
    const { rerender, container } = render(<MyWorkWorkspace documents={DOCUMENTS} dataState="empty" />)
    expect(container.querySelector('[data-surface-state="empty"]')).toBeTruthy()
    expect(screen.getByRole("heading", { name: "No authorized documents" })).toBeTruthy()
    expect(screen.queryByText("Shipment exception review")).toBeNull()

    rerender(<MyWorkWorkspace documents={DOCUMENTS} dataState="complete" />)
    expect(screen.getByRole("heading", { name: "Shipment exception review" })).toBeTruthy()
  })
})
