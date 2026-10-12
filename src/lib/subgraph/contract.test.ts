import { describe, expect, it } from "vitest"

import {
  FOCUSED_SUBGRAPH_CONTRACT_VERSION,
  FOCUSED_SUBGRAPH_MAX_DEPTH,
  FOCUSED_SUBGRAPH_MAX_EDGES,
  FOCUSED_SUBGRAPH_MAX_NODES,
  normalizeSubgraphQuery,
  serializeNormalizedSubgraphQuery,
  SubgraphContinuationClaimsSchema,
  SubgraphEdgeSchema,
  SubgraphEvidenceSchema,
  SubgraphExchangeSchema,
  SubgraphNodeKindSchema,
  SubgraphQuerySchema,
  SubgraphRelationshipKindSchema,
  SubgraphResponseSchema,
  SubgraphSourceReferenceSchema,
  validateSubgraphExchange,
} from "./contract"

const NOW = "2026-10-12T12:00:00.000Z"
const EARLIER = "2026-10-11T12:00:00.000Z"
const LATER = "2026-10-12T12:05:00.000Z"
const DIGEST = "a".repeat(64)

function memoryNode(key = "memory:memory-1", version = 2, deprecated = false, distance = 0) {
  return {
    key,
    entityType: "memory" as const,
    kind: { classification: "product" as const, name: "Memory" as const },
    label: `Memory ${key}`,
    source: { kind: "record" as const, recordType: "graph_memory", recordKey: `row:${key}` },
    freshness: { state: "current" as const, observedAt: distance === 0 ? NOW : EARLIER },
    evidence: { state: "available" as const, references: [`evidence:${key}`] },
    version: { version, deprecated },
    order: { distance, kindRank: 0 },
  }
}

function structuralNode(key = "structural:agent-1", distance = 1) {
  return {
    key,
    entityType: "structural" as const,
    kind: { classification: "unknown" as const, name: "ServiceAgent" },
    label: "Curator agent",
    source: {
      kind: "derivation" as const,
      ruleId: "agent_group_to_team",
      ruleVersion: 1,
      sourceRecordKeys: ["agent-row-1"],
    },
    freshness: { state: "unknown" as const, observedAt: EARLIER },
    evidence: { state: "absent" as const },
    order: { distance, kindRank: 1 },
  }
}

function authoredEdge() {
  return {
    key: "edge:authored-1",
    sourceNodeKey: "memory:memory-1",
    targetNodeKey: "structural:agent-1",
    kind: { classification: "canonical" as const, name: "AUTHORED_BY" as const },
    label: "Authored by",
    source: { kind: "record" as const, recordType: "structural_edge", recordKey: "edge-row-1" },
    freshness: { state: "stale" as const, observedAt: NOW },
    evidence: { state: "unavailable" as const, reasonCode: "EVIDENCE_STORE_UNAVAILABLE", retryable: true },
    order: { depth: 1, direction: "outgoing" as const },
  }
}

function graphPage() {
  return {
    contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
    state: "complete" as const,
    snapshot: { policyEpoch: 3, graphRevision: 18, capturedAt: NOW },
    budgets: {
      requested: { nodeLimit: 200, edgeLimit: 400, depth: 2 },
      applied: { nodeLimit: 200, edgeLimit: 400, depth: 2 },
    },
    nodes: [memoryNode(), structuralNode()],
    edges: [authoredEdge()],
    warnings: ["EVIDENCE_PARTIAL"],
    inspection: {
      nodeKey: "memory:memory-1",
      scope: { tenantId: "allura-acme", workspaceId: "workspace-a" },
      content: "The focused, authorized content.",
      provenance: { kind: "record" as const, recordType: "graph_memory", recordKey: "memory-row-1" },
      evidence: { state: "available" as const, references: ["evidence:receipt-1"] },
      lineage: [],
      relationshipKeys: ["edge:authored-1"],
    },
  }
}

function overviewPage() {
  const page = graphPage()
  return {
    ...page,
    budgets: {
      requested: { nodeLimit: 200, edgeLimit: 400, depth: 0 },
      applied: { nodeLimit: 200, edgeLimit: 400, depth: 0 },
    },
    nodes: [
      { ...page.nodes[0], order: { distance: 0, kindRank: 0 } },
      { ...page.nodes[1], order: { distance: 0, kindRank: 1 } },
    ],
    edges: [{ ...page.edges[0], order: { depth: 0, direction: "outgoing" as const } }],
    inspection: undefined,
  }
}

function lineagePage() {
  const current = memoryNode("memory:memory-3", 3, false, 0)
  const prior = memoryNode("memory:memory-2", 2, true, 1)
  const oldest = memoryNode("memory:memory-1", 1, true, 2)
  const currentToPrior = {
    ...authoredEdge(),
    key: "edge:supersedes-2",
    sourceNodeKey: current.key,
    targetNodeKey: prior.key,
    kind: { classification: "canonical" as const, name: "SUPERSEDES" as const },
    label: "Supersedes",
    order: { depth: 1, direction: "outgoing" as const },
  }
  const priorToOldest = {
    ...currentToPrior,
    key: "edge:supersedes-1",
    sourceNodeKey: prior.key,
    targetNodeKey: oldest.key,
    order: { depth: 2, direction: "outgoing" as const },
  }
  return {
    ...graphPage(),
    nodes: [current, prior, oldest],
    edges: [currentToPrior, priorToOldest],
    inspection: {
      ...graphPage().inspection,
      nodeKey: current.key,
      lineage: [
        { newerNodeKey: prior.key, supersededNodeKey: oldest.key, relationshipKey: priorToOldest.key },
        { newerNodeKey: current.key, supersededNodeKey: prior.key, relationshipKey: currentToPrior.key },
      ],
      relationshipKeys: [priorToOldest.key, currentToPrior.key],
    },
  }
}

function continuationClaims() {
  return {
    contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
    tenantId: "allura-acme",
    workspaceId: "workspace-a",
    principalId: "principal-a",
    sessionHash: DIGEST,
    role: "viewer" as const,
    policyEpoch: 3,
    routePolicyVersion: "graph-route-v1",
    normalizedQueryHash: DIGEST,
    effectiveBudgets: { nodeLimit: 200, edgeLimit: 400, depth: 2 },
    graphRevision: 18,
    boundary: {
      node: { distance: 1, kindRank: 2, freshnessAt: NOW, nodeKey: "memory:memory-1" },
      edge: {
        depth: 1,
        relationshipKind: "AUTHORED_BY",
        direction: "outgoing" as const,
        sourceNodeKey: "memory:memory-1",
        targetNodeKey: "structural:agent-1",
        edgeKey: "edge:authored-1",
      },
    },
    issuedAt: NOW,
    expiresAt: LATER,
    keyVersion: 2,
  }
}

describe("focused subgraph request contract", () => {
  it("normalizes overview intent deterministically and clamps effective budgets", () => {
    const first = normalizeSubgraphQuery({
      kind: "overview",
      nodeKinds: ["Team", "Memory", "Team"],
      relationshipKinds: ["SUPERSEDES", "AUTHORED_BY"],
      nodeLimit: 999,
      edgeLimit: 999,
    })
    const second = normalizeSubgraphQuery({
      kind: "overview",
      nodeKinds: ["Memory", "Team"],
      relationshipKinds: ["AUTHORED_BY", "SUPERSEDES"],
      nodeLimit: 999,
      edgeLimit: 999,
    })

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      contractVersion: "2.0",
      nodeKinds: ["Memory", "Team"],
      relationshipKinds: ["AUTHORED_BY", "SUPERSEDES"],
      requestedBudgets: { nodeLimit: 999, edgeLimit: 999, depth: 0 },
      effectiveBudgets: {
        nodeLimit: FOCUSED_SUBGRAPH_MAX_NODES,
        edgeLimit: FOCUSED_SUBGRAPH_MAX_EDGES,
        depth: 0,
      },
      continuation: null,
    })
    expect(JSON.stringify(first)).not.toMatch(/tenant|workspace|principal|session|role|policy/i)
  })

  it("serializes semantic query identity without continuation and canonicalizes filters", () => {
    const normalized = normalizeSubgraphQuery({
      kind: "overview",
      nodeKinds: ["Memory", "Team"],
      relationshipKinds: ["AUTHORED_BY", "SUPERSEDES"],
    })
    const withToken = { ...normalized, continuation: "opaque.token" }
    const reordered = {
      ...normalized,
      nodeKinds: ["Team", "Memory", "Team"],
      relationshipKinds: ["SUPERSEDES", "AUTHORED_BY", "AUTHORED_BY"],
    }

    expect(serializeNormalizedSubgraphQuery(withToken)).toBe(serializeNormalizedSubgraphQuery(normalized))
    expect(serializeNormalizedSubgraphQuery(reordered)).toBe(serializeNormalizedSubgraphQuery(normalized))
    expect(serializeNormalizedSubgraphQuery(withToken)).not.toContain("opaque.token")
  })

  it("normalizes focus defaults and preserves typed identity", () => {
    expect(normalizeSubgraphQuery({ kind: "focus", focusNodeKey: "structural:project-1" })).toEqual({
      contractVersion: "2.0",
      kind: "focus",
      focusNodeKey: "structural:project-1",
      direction: "both",
      includeLineage: false,
      nodeKinds: [],
      relationshipKinds: [],
      requestedBudgets: { nodeLimit: 200, edgeLimit: 400, depth: 1 },
      effectiveBudgets: { nodeLimit: 200, edgeLimit: 400, depth: 1 },
      continuation: null,
    })
  })

  it("rejects raw IDs, malformed continuations, depth above two, and unknown fields", () => {
    expect(SubgraphQuerySchema.safeParse({ kind: "focus", focusNodeKey: "project-1" }).success).toBe(false)
    expect(SubgraphQuerySchema.safeParse({ kind: "focus", focusNodeKey: "memory:m1", depth: 3 }).success).toBe(false)
    expect(SubgraphQuerySchema.safeParse({ kind: "overview", continuation: "contains spaces" }).success).toBe(false)
    expect(SubgraphQuerySchema.safeParse({ kind: "overview", surprise: true }).success).toBe(false)
  })

  it.each(["group_id", "workspace_id", "principal_id", "session_id", "role", "policy_epoch"])(
    "rejects caller-owned authority field %s",
    (field) => {
      expect(SubgraphQuerySchema.safeParse({ kind: "overview", [field]: "forged" }).success).toBe(false)
    },
  )
})

describe("focused subgraph taxonomy and projection", () => {
  it.each(["Memory", "Agent", "Team", "Project"])("rejects reserved product name %s as structural or unknown", (name) => {
    expect(SubgraphNodeKindSchema.safeParse({ classification: "structural", name }).success).toBe(false)
    expect(SubgraphNodeKindSchema.safeParse({ classification: "unknown", name }).success).toBe(false)
  })

  it.each(["AUTHORED_BY", "RELATES_TO", "MEMBER_OF", "CONTRIBUTES_TO", "SUPERSEDES"])(
    "rejects reserved canonical relationship %s as unknown",
    (name) => {
      expect(SubgraphRelationshipKindSchema.safeParse({ classification: "unknown", name }).success).toBe(false)
    },
  )

  it("does not apply node lineage version shape to edges", () => {
    expect(SubgraphEdgeSchema.safeParse(authoredEdge()).success).toBe(true)
    expect(SubgraphEdgeSchema.safeParse({ ...authoredEdge(), version: { version: 1, deprecated: false } }).success).toBe(false)
  })

  it("rejects noncanonical evidence and derivation source arrays", () => {
    expect(SubgraphEvidenceSchema.safeParse({ state: "available", references: ["b", "a"] }).success).toBe(false)
    expect(SubgraphEvidenceSchema.safeParse({ state: "available", references: ["a", "a"] }).success).toBe(false)
    expect(SubgraphSourceReferenceSchema.safeParse({
      kind: "derivation",
      ruleId: "rule",
      ruleVersion: 1,
      sourceRecordKeys: ["source:b", "source:a"],
    }).success).toBe(false)
  })
})

describe("focused subgraph response contract", () => {
  it("accepts a versioned, ordered graph page with authorized inspection scope", () => {
    expect(SubgraphResponseSchema.parse(graphPage())).toEqual(graphPage())
    expect(graphPage().inspection.scope).toEqual({ tenantId: "allura-acme", workspaceId: "workspace-a" })
  })

  it("rejects endpoint closure, duplicate keys, and typed-key mismatches", () => {
    const missingEndpoint = graphPage()
    missingEndpoint.edges[0] = { ...missingEndpoint.edges[0], targetNodeKey: "structural:missing" }
    expect(SubgraphResponseSchema.safeParse(missingEndpoint).success).toBe(false)

    const duplicateNode = graphPage()
    duplicateNode.nodes = [memoryNode(), memoryNode()] as typeof duplicateNode.nodes
    duplicateNode.edges = []
    duplicateNode.inspection = undefined as never
    expect(SubgraphResponseSchema.safeParse(duplicateNode).success).toBe(false)

    expect(SubgraphResponseSchema.safeParse({ ...graphPage(), nodes: [{ ...memoryNode(), entityType: "structural" }] }).success).toBe(false)
  })

  it("rejects unsorted node and edge pages", () => {
    const unsortedNodes = graphPage()
    unsortedNodes.nodes.reverse()
    expect(SubgraphResponseSchema.safeParse(unsortedNodes).success).toBe(false)

    const secondEdge = {
      ...authoredEdge(),
      key: "edge:relates-1",
      kind: { classification: "canonical" as const, name: "RELATES_TO" as const },
      label: "Relates to",
    }
    const unsortedEdges = graphPage()
    unsortedEdges.edges = [secondEdge, authoredEdge()] as typeof unsortedEdges.edges
    unsortedEdges.inspection.relationshipKeys = ["edge:authored-1", "edge:relates-1"]
    expect(SubgraphResponseSchema.safeParse(unsortedEdges).success).toBe(false)
  })

  it("rejects duplicate/order-varying warnings and relationship arrays", () => {
    expect(SubgraphResponseSchema.safeParse({ ...graphPage(), warnings: ["Z_WARNING", "A_WARNING"] }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...graphPage(), warnings: ["A_WARNING", "A_WARNING"] }).success).toBe(false)

    const secondEdge = {
      ...authoredEdge(),
      key: "edge:relates-1",
      kind: { classification: "canonical" as const, name: "RELATES_TO" as const },
      label: "Relates to",
    }
    const page = graphPage()
    page.edges = [authoredEdge(), secondEdge] as typeof page.edges
    page.inspection.relationshipKeys = ["edge:relates-1", "edge:authored-1"]
    expect(SubgraphResponseSchema.safeParse(page).success).toBe(false)
  })

  it("allows continuation only on a genuinely exhausted partial page", () => {
    const partial = {
      ...graphPage(),
      state: "partial",
      budgets: {
        requested: { nodeLimit: 2, edgeLimit: 1, depth: 2 },
        applied: { nodeLimit: 2, edgeLimit: 1, depth: 2 },
      },
      exhausted: "nodes_and_edges",
      continuation: "opaque.token",
    }
    expect(SubgraphResponseSchema.safeParse(partial).success).toBe(true)
    expect(SubgraphResponseSchema.safeParse({ ...partial, exhausted: "nodes", nodes: [memoryNode()] }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...partial, exhausted: "edges", edges: [] }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...partial, exhausted: "nodes_and_edges", edges: [] }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...partial, continuation: undefined }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...graphPage(), continuation: "opaque.token" }).success).toBe(false)
  })

  it("requires empty to be a healthy graph page with no graph records", () => {
    const empty = {
      contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
      state: "empty",
      snapshot: { policyEpoch: 3, graphRevision: 18, capturedAt: NOW },
      budgets: {
        requested: { nodeLimit: 200, edgeLimit: 400, depth: 0 },
        applied: { nodeLimit: 200, edgeLimit: 400, depth: 0 },
      },
      nodes: [],
      edges: [],
      warnings: [],
    }
    expect(SubgraphResponseSchema.safeParse(empty).success).toBe(true)
    expect(SubgraphResponseSchema.safeParse({ ...empty, nodes: [memoryNode()] }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...empty, state: "complete" }).success).toBe(false)
  })

  it("validates admitted, ordered, newer-to-superseded lineage", () => {
    const page = lineagePage()
    expect(SubgraphResponseSchema.safeParse(page).success).toBe(true)

    const unordered = lineagePage()
    unordered.inspection.lineage.reverse()
    expect(SubgraphResponseSchema.safeParse(unordered).success).toBe(false)

    const unadmitted = lineagePage()
    unadmitted.inspection.lineage[0] = { ...unadmitted.inspection.lineage[0], supersededNodeKey: "memory:not-admitted" }
    expect(SubgraphResponseSchema.safeParse(unadmitted).success).toBe(false)

    const wrongDirection = lineagePage()
    wrongDirection.inspection.lineage[0] = {
      ...wrongDirection.inspection.lineage[0],
      newerNodeKey: "memory:memory-1",
      supersededNodeKey: "memory:memory-2",
    }
    expect(SubgraphResponseSchema.safeParse(wrongDirection).success).toBe(false)

    const self = lineagePage()
    self.inspection.lineage[0] = {
      ...self.inspection.lineage[0],
      supersededNodeKey: self.inspection.lineage[0]!.newerNodeKey,
    }
    expect(SubgraphResponseSchema.safeParse(self).success).toBe(false)
  })

  it("rejects self-supersession and reversed version direction on graph edges", () => {
    const self = lineagePage()
    self.edges[0] = { ...self.edges[0], targetNodeKey: self.edges[0]!.sourceNodeKey }
    expect(SubgraphResponseSchema.safeParse(self).success).toBe(false)

    const reversed = lineagePage()
    reversed.edges[0] = {
      ...reversed.edges[0],
      sourceNodeKey: "memory:memory-2",
      targetNodeKey: "memory:memory-3",
    }
    expect(SubgraphResponseSchema.safeParse(reversed).success).toBe(false)
  })

  it("keeps degraded fallback explicitly non-equivalent and outside semantic arrays", () => {
    const degraded = {
      contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
      state: "degraded",
      reasonCode: "AMBIGUOUS_ENDPOINTS",
      retryable: false,
      action: "none",
      warnings: ["SEMANTIC_GRAPH_UNAVAILABLE"],
      fallback: {
        kind: "event-context",
        equivalence: "non-equivalent",
        observedAt: NOW,
        summary: "Recent governed events are available as context only.",
        sourceReferences: ["event:1"],
      },
    }
    expect(SubgraphResponseSchema.safeParse(degraded).success).toBe(true)
    expect(SubgraphResponseSchema.safeParse({ ...degraded, nodes: [] }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...degraded, fallback: { ...degraded.fallback, equivalence: "equivalent" } }).success).toBe(false)
  })

  it.each([
    { state: "denied", reasonCode: "INSUFFICIENT_ROLE", action: "request_access" },
    { state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" },
  ])("makes $state payloads structurally incapable of graph disclosure", (payload) => {
    const base = { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, ...payload }
    expect(SubgraphResponseSchema.safeParse(base).success).toBe(true)
    for (const protectedField of ["scope", "id", "label", "snippet", "count", "nodes", "edges"]) {
      expect(SubgraphResponseSchema.safeParse({ ...base, [protectedField]: protectedField === "count" ? 0 : [] }).success).toBe(false)
    }
  })

  it.each([
    ["LOGIN_REQUIRED", "login"],
    ["INSUFFICIENT_ROLE", "request_access"],
    ["SCOPE_CONFLICT", "none"],
    ["CONTINUATION_AUTHORITY_MISMATCH", "restart"],
  ])("binds denied reason %s to action %s", (reasonCode, action) => {
    const valid = { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "denied", reasonCode, action }
    expect(SubgraphResponseSchema.safeParse(valid).success).toBe(true)
    expect(SubgraphResponseSchema.safeParse({ ...valid, action: action === "none" ? "retry" : "none" }).success).toBe(false)
  })

  it.each([
    ["MALFORMED_QUERY", false, "none"],
    ["MALFORMED_CONTINUATION", false, "restart"],
    ["CONTINUATION_CONFLICT", false, "restart"],
    ["SNAPSHOT_CONFLICT", false, "restart"],
    ["UNAVAILABLE", true, "retry"],
    ["INTERNAL", true, "retry"],
  ])("binds error code %s to retryability/action", (code, retryable, action) => {
    const valid = { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code, retryable, action }
    expect(SubgraphResponseSchema.safeParse(valid).success).toBe(true)
    expect(SubgraphResponseSchema.safeParse({ ...valid, retryable: !retryable }).success).toBe(false)
    expect(SubgraphResponseSchema.safeParse({ ...valid, action: action === "none" ? "retry" : "none" }).success).toBe(false)
  })

  it("rejects unversioned responses and response data outside applied budgets", () => {
    const unversioned = { ...graphPage() } as Record<string, unknown>
    delete unversioned.contractVersion
    expect(SubgraphResponseSchema.safeParse(unversioned).success).toBe(false)

    const invalidBudgets = graphPage()
    invalidBudgets.budgets = {
      requested: { nodeLimit: 10, edgeLimit: 10, depth: 1 },
      applied: { nodeLimit: 11, edgeLimit: 10, depth: 1 },
    }
    expect(SubgraphResponseSchema.safeParse(invalidBudgets).success).toBe(false)

    const pageAboveAppliedBudget = graphPage()
    pageAboveAppliedBudget.budgets.applied.nodeLimit = 1
    expect(SubgraphResponseSchema.safeParse(pageAboveAppliedBudget).success).toBe(false)

    const depthAboveAppliedBudget = graphPage()
    depthAboveAppliedBudget.budgets.applied.depth = 0
    expect(SubgraphResponseSchema.safeParse(depthAboveAppliedBudget).success).toBe(false)
  })
})

describe("query/response validation seam", () => {
  const focusQuery = () => normalizeSubgraphQuery({
    kind: "focus",
    focusNodeKey: "memory:memory-1",
    includeLineage: false,
    depth: 2,
  })

  it("accepts a response bound to its normalized query", () => {
    expect(validateSubgraphExchange(focusQuery(), graphPage())).toEqual({ query: focusQuery(), response: graphPage() })
  })

  it("rejects requested or applied budgets that differ from the normalized query", () => {
    const requestedMismatch = graphPage()
    requestedMismatch.budgets.requested.nodeLimit = 199
    expect(SubgraphExchangeSchema.safeParse({ query: focusQuery(), response: requestedMismatch }).success).toBe(false)

    const appliedMismatch = graphPage()
    appliedMismatch.budgets.applied.edgeLimit = 399
    expect(SubgraphExchangeSchema.safeParse({ query: focusQuery(), response: appliedMismatch }).success).toBe(false)
  })

  it("forbids inspection on overview", () => {
    const query = normalizeSubgraphQuery({ kind: "overview" })
    expect(SubgraphExchangeSchema.safeParse({ query, response: overviewPage() }).success).toBe(true)
    expect(SubgraphExchangeSchema.safeParse({ query, response: { ...overviewPage(), inspection: graphPage().inspection } }).success).toBe(false)
  })

  it("requires focused inspection to match focusNodeKey", () => {
    const response = graphPage()
    response.inspection.nodeKey = "structural:agent-1"
    expect(SubgraphExchangeSchema.safeParse({ query: focusQuery(), response }).success).toBe(false)
  })
})

describe("focused subgraph continuation claims", () => {
  it("requires every authority, query, policy, snapshot, budget, boundary, expiry, and key binding", () => {
    const claims = continuationClaims()
    expect(SubgraphContinuationClaimsSchema.safeParse(claims).success).toBe(true)

    for (const field of [
      "tenantId",
      "workspaceId",
      "principalId",
      "sessionHash",
      "role",
      "policyEpoch",
      "routePolicyVersion",
      "normalizedQueryHash",
      "effectiveBudgets",
      "graphRevision",
      "boundary",
      "issuedAt",
      "expiresAt",
      "keyVersion",
    ]) {
      const missing = { ...claims } as Record<string, unknown>
      delete missing[field]
      expect(SubgraphContinuationClaimsSchema.safeParse(missing).success, field).toBe(false)
    }
  })

  it("rejects empty boundaries, malformed digests, and expiry before issuance", () => {
    expect(SubgraphContinuationClaimsSchema.safeParse({ ...continuationClaims(), boundary: { node: null, edge: null } }).success).toBe(false)
    expect(SubgraphContinuationClaimsSchema.safeParse({ ...continuationClaims(), sessionHash: "not-a-digest" }).success).toBe(false)
    expect(SubgraphContinuationClaimsSchema.safeParse({ ...continuationClaims(), expiresAt: NOW }).success).toBe(false)
    expect(SubgraphContinuationClaimsSchema.safeParse({ ...continuationClaims(), secret: "leak" }).success).toBe(false)
  })

  it("requires ordering boundary depths within the effective depth", () => {
    const claims = continuationClaims()
    claims.effectiveBudgets.depth = 1
    claims.boundary.node!.distance = 2
    expect(SubgraphContinuationClaimsSchema.safeParse(claims).success).toBe(false)

    const edgeClaims = continuationClaims()
    edgeClaims.effectiveBudgets.depth = 1
    edgeClaims.boundary.edge!.depth = 2
    expect(SubgraphContinuationClaimsSchema.safeParse(edgeClaims).success).toBe(false)
  })

  it("pins the depth safety ceiling without inventing a maximum continuation TTL", () => {
    expect(FOCUSED_SUBGRAPH_MAX_DEPTH).toBe(2)
    expect(SubgraphContinuationClaimsSchema.safeParse({
      ...continuationClaims(),
      effectiveBudgets: { nodeLimit: 200, edgeLimit: 400, depth: 3 },
    }).success).toBe(false)
    expect(SubgraphContinuationClaimsSchema.safeParse({ ...continuationClaims(), expiresAt: "2030-10-12T12:00:00.000Z" }).success).toBe(true)
  })
})
