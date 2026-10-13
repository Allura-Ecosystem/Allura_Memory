/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  type SubgraphQuery,
  type SubgraphResponse,
  SubgraphResponseSchema,
} from "@/lib/subgraph/contract"
import {
  completeFocusedSubgraph,
  continuationFocusedSubgraph,
  deniedFocusedSubgraph,
  emptyFocusedSubgraph,
  partialFocusedSubgraph,
  terminalEmptyFocusedSubgraph,
  unavailableEvidenceFocusedSubgraph,
} from "@/test/fixtures/focused-subgraph"

vi.mock("../knowledge-map-canvas", () => ({
  KnowledgeMapCanvas: ({ nodes, edges }: { nodes: unknown[]; edges: unknown[] }) => (
    <div aria-label="Mock map" data-node-count={nodes.length} data-edge-count={edges.length} />
  ),
}))

import { KnowledgeMapWorkspace } from "../knowledge-map-workspace"

const FOCUS_QUERY: SubgraphQuery = {
  kind: "focus",
  focusNodeKey: "memory:current",
  direction: "both",
  depth: 2,
  includeLineage: true,
  nodeLimit: 2,
  edgeLimit: 20,
}

function nodeControl(key: string): HTMLButtonElement {
  const control = document.querySelector<HTMLButtonElement>(`[data-node-control="text"][data-node-key="${key}"]`)
  if (!control) throw new Error(`Missing node control ${key}`)
  return control
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function changedSnapshotResponse(): SubgraphResponse {
  const response = continuationFocusedSubgraph()
  if (response.state !== "complete") throw new Error("fixture contract")
  return SubgraphResponseSchema.parse({
    ...response,
    snapshot: { ...response.snapshot, capturedAt: "2026-10-12T12:00:01.000Z" },
  })
}

function noProgressPartial(continuation: string): SubgraphResponse {
  const response = partialFocusedSubgraph(continuation)
  if (response.state !== "partial") throw new Error("fixture contract")
  return response
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("KnowledgeMapWorkspace", () => {
  it("renders the same authorized arrays in map and text with explicit unknown kinds", () => {
    render(<KnowledgeMapWorkspace initialResponse={completeFocusedSubgraph()} />)
    expect(screen.getByLabelText("Mock map").getAttribute("data-node-count")).toBe("3")
    expect(screen.getByLabelText("Mock map").getAttribute("data-edge-count")).toBe("1")
    expect(within(screen.getByLabelText("Knowledge Map nodes")).getAllByRole("button")).toHaveLength(3)
    expect(within(screen.getByLabelText("Knowledge Map directed relationships")).getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getAllByText(/Artifact · unknown/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/security path/i)).toBeNull()
    expect(screen.queryByText(/methodology\/catalog/i)).toBeNull()
  })

  it("filters relationship arrays in canvas and text while retaining nodes", () => {
    render(<KnowledgeMapWorkspace initialResponse={completeFocusedSubgraph()} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "SUPERSEDES (canonical)" }))
    expect(screen.getByLabelText("Mock map").getAttribute("data-node-count")).toBe("3")
    expect(screen.getByLabelText("Mock map").getAttribute("data-edge-count")).toBe("0")
    expect(within(screen.getByLabelText("Knowledge Map nodes")).getAllByRole("button")).toHaveLength(3)
    expect(within(screen.getByLabelText("Knowledge Map directed relationships")).queryAllByRole("listitem")).toHaveLength(0)
  })

  it("presents filtered-empty with reset and clears a filtered selection", async () => {
    const client = vi.fn(async () => completeFocusedSubgraph())
    render(<KnowledgeMapWorkspace initialResponse={completeFocusedSubgraph()} client={client} />)
    fireEvent.click(nodeControl("structural:artifact"))
    await waitFor(() => expect(screen.queryByText(/Loading authoritative details/)).toBeNull())
    fireEvent.click(screen.getByRole("checkbox", { name: "Artifact (unknown)" }))
    expect(screen.getByRole("heading", { name: "Select a node" })).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: "Memory (product)" }))
    expect(screen.getByRole("heading", { name: "No nodes match the active filters" })).toBeTruthy()
    fireEvent.click(screen.getAllByRole("button", { name: "Reset filters" })[0])
    expect(screen.getByLabelText("Mock map").getAttribute("data-node-count")).toBe("3")
  })

  it("shows authoritative loading, then inspector evidence, provenance, lineage, keys, and restores focus", async () => {
    const pending = deferred<SubgraphResponse>()
    const client = vi.fn(() => pending.promise)
    render(<KnowledgeMapWorkspace initialResponse={completeFocusedSubgraph()} client={client} />)
    const opener = nodeControl("memory:current")
    opener.focus()
    fireEvent.keyDown(opener, { key: " " })

    const inspector = screen.getByRole("complementary", { name: "Selected node inspector" })
    expect(document.activeElement).toBe(inspector)
    expect(within(inspector).getByText(/Loading authoritative details/)).toBeTruthy()
    pending.resolve(completeFocusedSubgraph())

    await waitFor(() => expect(screen.getByText("Approved operating decision content.")).toBeTruthy())
    expect(within(inspector).getByLabelText("Authorized evidence references").textContent).toContain("receipt:current")
    expect(within(inspector).getByRole("heading", { name: "Lineage" })).toBeTruthy()
    fireEvent.click(within(inspector).getByText("Technical details"))
    expect(within(inspector).getByText("memory:current")).toBeTruthy()
    expect(within(inspector).getByText(/allura-test \/ workspace-test/)).toBeTruthy()
    expect(within(inspector).getByText(/memory:current-record/)).toBeTruthy()
    expect(within(inspector).getAllByText("edge:supersedes-current-previous").length).toBeGreaterThan(0)

    fireEvent.click(within(inspector).getByRole("button", { name: "Clear selection" }))
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it("requests lineage only for memory nodes", () => {
    const client = vi.fn(async () => completeFocusedSubgraph())
    render(<KnowledgeMapWorkspace initialResponse={completeFocusedSubgraph()} client={client} />)
    fireEvent.click(nodeControl("structural:artifact"))
    expect(client).toHaveBeenLastCalledWith(expect.objectContaining({ focusNodeKey: "structural:artifact", includeLineage: false }), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    fireEvent.click(nodeControl("memory:current"))
    expect(client).toHaveBeenLastCalledWith(expect.objectContaining({ focusNodeKey: "memory:current", includeLineage: true }), expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it("distinguishes unavailable and absent evidence plus relationship evidence", async () => {
    const client = vi.fn(async () => unavailableEvidenceFocusedSubgraph())
    render(<KnowledgeMapWorkspace initialResponse={unavailableEvidenceFocusedSubgraph()} client={client} />)
    fireEvent.click(nodeControl("memory:current"))
    await waitFor(() => expect(screen.getByText(/Evidence service unavailable/).getAttribute("data-evidence-state")).toBe("unavailable"))
    fireEvent.click(nodeControl("memory:previous"))
    await waitFor(() => expect(screen.getByText("No evidence reference is attached.").getAttribute("data-evidence-state")).toBe("absent"))
    expect(screen.getByLabelText("Knowledge Map directed relationships").querySelector("[data-evidence-state=\"available\"]")).toBeTruthy()
  })

  it("reuses the exact focus query for continuation and preserves merged metadata", async () => {
    const client = vi.fn(async (query: SubgraphQuery) => query.continuation ? continuationFocusedSubgraph() : completeFocusedSubgraph())
    render(<KnowledgeMapWorkspace initialResponse={partialFocusedSubgraph()} initialQuery={FOCUS_QUERY} client={client} />)
    fireEvent.click(screen.getByRole("button", { name: "Load next page" }))

    await waitFor(() => expect(client).toHaveBeenCalledWith({ ...FOCUS_QUERY, continuation: "page.one" }, expect.objectContaining({ signal: expect.any(AbortSignal) })))
    await waitFor(() => expect(screen.getByLabelText("Mock map").getAttribute("data-edge-count")).toBe("2"))
    expect(screen.getByLabelText("Mock map").getAttribute("data-node-count")).toBe("3")
    expect(screen.getByText(/FIRST_PAGE, SECOND_PAGE/)).toBeTruthy()
    fireEvent.click(nodeControl("memory:current"))
    await waitFor(() => expect(screen.getByText("Approved operating decision content.")).toBeTruthy())
  })

  it("accepts a terminal empty continuation without erasing accumulated graph", async () => {
    const client = vi.fn(async () => terminalEmptyFocusedSubgraph())
    render(<KnowledgeMapWorkspace initialResponse={partialFocusedSubgraph()} initialQuery={FOCUS_QUERY} client={client} />)
    fireEvent.click(screen.getByRole("button", { name: "Load next page" }))
    await waitFor(() => expect(screen.getByLabelText("Mock map").getAttribute("data-node-count")).toBe("2"))
    expect(screen.getByLabelText("Mock map").getAttribute("data-edge-count")).toBe("1")
    expect(screen.getByText(/FIRST_PAGE, TERMINAL_EMPTY_PAGE/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Load next page" })).toBeNull()
  })

  it.each([
    ["changed snapshot", changedSnapshotResponse(), /snapshot changed/],
    ["repeated token", noProgressPartial("page.one"), /repeated a continuation token/],
    ["no progress", noProgressPartial("page.two"), /no new governed records/],
  ] as const)("stops unsafe continuation: %s", async (_label, next, detail) => {
    const client = vi.fn(async () => next)
    render(<KnowledgeMapWorkspace initialResponse={partialFocusedSubgraph()} initialQuery={FOCUS_QUERY} client={client} />)
    fireEvent.click(screen.getByRole("button", { name: "Load next page" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Knowledge Map continuation stopped" })).toBeTruthy())
    expect(screen.getByText(detail)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Restart map" })).toBeTruthy()
  })

  it("stops when a stable continuation key changes payload", async () => {
    const next = continuationFocusedSubgraph()
    if (next.state !== "complete") throw new Error("fixture contract")
    const conflict = SubgraphResponseSchema.parse({
      ...next,
      nodes: next.nodes.map((node) => node.key === "memory:current" ? { ...node, label: "Changed identity payload" } : node),
    })
    const client = vi.fn(async () => conflict)
    render(<KnowledgeMapWorkspace initialResponse={partialFocusedSubgraph()} initialQuery={FOCUS_QUERY} client={client} />)
    fireEvent.click(screen.getByRole("button", { name: "Load next page" }))
    await waitFor(() => expect(screen.getByText(/stable node identity changed/)).toBeTruthy())
  })

  it("aborts superseded requests and ignores stale completions", async () => {
    const first = deferred<SubgraphResponse>()
    const second = deferred<SubgraphResponse>()
    const calls: AbortSignal[] = []
    const client = vi.fn((_query: SubgraphQuery, options) => {
      calls.push(options?.signal as AbortSignal)
      return calls.length === 1 ? first.promise : second.promise
    })
    render(<KnowledgeMapWorkspace initialResponse={completeFocusedSubgraph()} client={client} />)
    fireEvent.click(nodeControl("memory:current"))
    fireEvent.click(nodeControl("structural:artifact"))
    expect(calls[0]?.aborted).toBe(true)

    const newest = completeFocusedSubgraph()
    if (newest.state !== "complete") throw new Error("fixture contract")
    second.resolve(SubgraphResponseSchema.parse({
      ...newest,
      nodes: newest.nodes.map((node) => node.key === "structural:artifact" ? { ...node, label: "Newest artifact" } : node),
      inspection: undefined,
    }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Newest artifact" })).toBeTruthy())
    first.resolve(completeFocusedSubgraph())
    await Promise.resolve()
    expect(screen.getByRole("heading", { name: "Newest artifact" })).toBeTruthy()
  })

  it("aborts the active request on unmount", () => {
    const pending = deferred<SubgraphResponse>()
    let signal: AbortSignal | undefined
    const client = vi.fn((_query: SubgraphQuery, options) => { signal = options?.signal; return pending.promise })
    const view = render(<KnowledgeMapWorkspace client={client} />)
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("renders empty and distinct denied states without leaking graph data", () => {
    const empty = render(<KnowledgeMapWorkspace initialResponse={emptyFocusedSubgraph()} />)
    expect(screen.getByRole("heading", { name: "No governed relationships yet" })).toBeTruthy()
    empty.unmount()

    render(<KnowledgeMapWorkspace initialResponse={deniedFocusedSubgraph()} />)
    expect(screen.getByRole("heading", { name: "Knowledge Map access not granted" })).toBeTruthy()
    expect(screen.getByText(/workspace membership administrator/)).toBeTruthy()
    expect(document.body.textContent).not.toContain("memory:current")
  })

  it.each([
    [{ contractVersion: "2.0", state: "denied", reasonCode: "LOGIN_REQUIRED", action: "login" }, "Sign in to view the Knowledge Map", "Sign in"],
    [{ contractVersion: "2.0", state: "denied", reasonCode: "SCOPE_CONFLICT", action: "none" }, "Workspace scope conflict", null],
    [{ contractVersion: "2.0", state: "denied", reasonCode: "CONTINUATION_AUTHORITY_MISMATCH", action: "restart" }, "Knowledge Map authority changed", "Restart map"],
    [{ contractVersion: "2.0", state: "degraded", reasonCode: "AMBIGUOUS_ENDPOINTS", retryable: false, action: "none", warnings: ["AMBIGUOUS_ENDPOINTS"] }, "Graph relationships need review", null],
    [{ contractVersion: "2.0", state: "degraded", reasonCode: "GRAPH_DATA_UNAVAILABLE", retryable: true, action: "retry", warnings: ["BACKEND"] }, "Governed graph data unavailable", "Retry"],
    [{ contractVersion: "2.0", state: "degraded", reasonCode: "GRAPH_V2_UNAVAILABLE", retryable: false, action: "none", warnings: [] }, "Knowledge Map is not enabled", null],
    [{ contractVersion: "2.0", state: "error", code: "SNAPSHOT_CONFLICT", retryable: false, action: "restart" }, "Knowledge Map changed", "Restart map"],
    [{ contractVersion: "2.0", state: "error", code: "MALFORMED_QUERY", retryable: false, action: "none" }, "Knowledge Map request was invalid", null],
    [{ contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" }, "Knowledge Map unavailable", "Retry"],
  ] as const)("renders distinct state %#", (state, heading, action) => {
    render(<KnowledgeMapWorkspace initialResponse={state as SubgraphResponse} />)
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy()
    if (action) expect(screen.getByRole(action === "Sign in" ? "link" : "button", { name: action })).toBeTruthy()
  })
})
