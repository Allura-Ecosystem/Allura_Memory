import {
  normalizeSubgraphQuery,
  type SubgraphQuery,
  SubgraphQuerySchema,
  type SubgraphResponse,
  validateSubgraphExchange,
} from "./contract"

export const FOCUSED_SUBGRAPH_ENDPOINT = "/api/memory/graph"

export class InvalidSubgraphResponseError extends Error {
  constructor() {
    super("The graph service returned an invalid response.")
    this.name = "InvalidSubgraphResponseError"
  }
}

export class InvalidSubgraphEndpointError extends Error {
  constructor() {
    super("The graph endpoint must be a same-origin path.")
    this.name = "InvalidSubgraphEndpointError"
  }
}

export interface FocusedSubgraphRequestOptions {
  signal?: AbortSignal
}

export type FocusedSubgraphBrowserClient = (
  query: SubgraphQuery,
  options?: FocusedSubgraphRequestOptions,
) => Promise<SubgraphResponse>

function appendList(params: URLSearchParams, name: string, values: readonly string[] | undefined): void {
  for (const value of values ?? []) params.append(name, value)
}

/** Serialize traversal intent only. Authority remains server-derived. */
export function serializeSubgraphQuery(rawQuery: SubgraphQuery): URLSearchParams {
  const query = SubgraphQuerySchema.parse(rawQuery)
  const params = new URLSearchParams({ kind: query.kind })

  appendList(params, "nodeKind", query.nodeKinds)
  appendList(params, "relationshipKind", query.relationshipKinds)
  if (query.nodeLimit !== undefined) params.set("nodeLimit", String(query.nodeLimit))
  if (query.edgeLimit !== undefined) params.set("edgeLimit", String(query.edgeLimit))
  if (query.continuation) params.set("continuation", query.continuation)

  if (query.kind === "focus") {
    params.set("focusNodeKey", query.focusNodeKey)
    if (query.direction) params.set("direction", query.direction)
    if (query.depth !== undefined) params.set("depth", String(query.depth))
    if (query.includeLineage !== undefined) params.set("includeLineage", String(query.includeLineage))
  }

  return params
}

export function createFocusedSubgraphBrowserClient({
  endpoint = FOCUSED_SUBGRAPH_ENDPOINT,
  fetchImpl = globalThis.fetch,
}: {
  endpoint?: string
  fetchImpl?: typeof fetch
} = {}): FocusedSubgraphBrowserClient {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || endpoint.includes("\\")) {
    throw new InvalidSubgraphEndpointError()
  }

  return async (query, options = {}) => {
    const params = serializeSubgraphQuery(query)
    const response = await fetchImpl(`${endpoint}?${params}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: options.signal,
    })

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new InvalidSubgraphResponseError()
    }

    try {
      return validateSubgraphExchange(normalizeSubgraphQuery(query), payload).response
    } catch {
      throw new InvalidSubgraphResponseError()
    }
  }
}

export const fetchFocusedSubgraph = createFocusedSubgraphBrowserClient()
