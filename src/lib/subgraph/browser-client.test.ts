import { describe, expect, it, vi } from "vitest"

import { completeFocusedSubgraph, overviewFocusedSubgraph } from "@/test/fixtures/focused-subgraph"

import {
  createFocusedSubgraphBrowserClient,
  InvalidSubgraphEndpointError,
  InvalidSubgraphResponseError,
  serializeSubgraphQuery,
} from "./browser-client"

describe("focused subgraph browser client", () => {
  it("serializes traversal intent without authority selectors", () => {
    const params = serializeSubgraphQuery({
      kind: "focus",
      focusNodeKey: "memory:current",
      direction: "both",
      depth: 2,
      includeLineage: true,
      nodeKinds: ["Memory", "Artifact"],
      relationshipKinds: ["SUPERSEDES"],
      nodeLimit: 20,
      edgeLimit: 30,
      continuation: "opaque.token",
    })

    expect(params.getAll("nodeKind")).toEqual(["Memory", "Artifact"])
    expect(params.getAll("relationshipKind")).toEqual(["SUPERSEDES"])
    expect(params.get("focusNodeKey")).toBe("memory:current")
    expect(params.has("group_id")).toBe(false)
    expect(params.has("workspace_id")).toBe(false)
  })

  it("uses a same-origin abortable GET and validates contract v2", async () => {
    const response = overviewFocusedSubgraph()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(response))) as unknown as typeof fetch
    const client = createFocusedSubgraphBrowserClient({ fetchImpl })
    const controller = new AbortController()

    await expect(client({ kind: "overview" }, { signal: controller.signal })).resolves.toEqual(response)
    expect(fetchImpl).toHaveBeenCalledWith("/api/memory/graph?kind=overview", expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }))
  })

  it.each([
    "https://example.invalid/api/memory/graph",
    "//example.invalid/api/memory/graph",
    "api/memory/graph",
    "/\\example.invalid/api/memory/graph",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(() => createFocusedSubgraphBrowserClient({ endpoint })).toThrow(InvalidSubgraphEndpointError)
  })

  it("binds graph responses to the exact normalized originating query", async () => {
    const response = completeFocusedSubgraph()
    const client = createFocusedSubgraphBrowserClient({
      fetchImpl: vi.fn(async () => new Response(JSON.stringify(response))) as unknown as typeof fetch,
    })

    await expect(client({ kind: "overview" })).rejects.toBeInstanceOf(InvalidSubgraphResponseError)
    await expect(client({
      kind: "focus",
      focusNodeKey: "memory:current",
      direction: "both",
      depth: 2,
      includeLineage: true,
      nodeLimit: 20,
      edgeLimit: 20,
    })).resolves.toEqual(response)
  })

  it("rejects invalid or non-json responses without exposing their body", async () => {
    const invalid = createFocusedSubgraphBrowserClient({
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ state: "complete", secret: "do-not-leak" }))) as unknown as typeof fetch,
    })
    await expect(invalid({ kind: "overview" })).rejects.toBeInstanceOf(InvalidSubgraphResponseError)

    const nonJson = createFocusedSubgraphBrowserClient({
      fetchImpl: vi.fn(async () => new Response("upstream secret")) as unknown as typeof fetch,
    })
    await expect(nonJson({ kind: "overview" })).rejects.toThrow("invalid response")
  })
})
