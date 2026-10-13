import { type SubgraphResponse, SubgraphResponseSchema } from "@/lib/subgraph/contract"

const snapshot = {
  policyEpoch: 7,
  graphRevision: 42,
  capturedAt: "2026-10-12T12:00:00.000Z",
}

const budgets = {
  requested: { nodeLimit: 20, edgeLimit: 20, depth: 2 },
  applied: { nodeLimit: 20, edgeLimit: 20, depth: 2 },
}

const overviewBudgets = {
  requested: { nodeLimit: 200, edgeLimit: 400, depth: 0 },
  applied: { nodeLimit: 200, edgeLimit: 400, depth: 0 },
}

const partialBudgets = {
  requested: { nodeLimit: 2, edgeLimit: 20, depth: 2 },
  applied: { nodeLimit: 2, edgeLimit: 20, depth: 2 },
}

const current = {
  key: "memory:current",
  entityType: "memory" as const,
  kind: { classification: "product" as const, name: "Memory" as const },
  label: "Current operating decision",
  summary: "The current approved decision.",
  source: { kind: "record" as const, recordType: "memory", recordKey: "current-record" },
  freshness: { state: "current" as const, observedAt: "2026-10-12T12:00:00.000Z" },
  evidence: { state: "available" as const, references: ["receipt:current"] },
  version: { version: 2, deprecated: false },
  order: { distance: 0, kindRank: 0 },
}

const previous = {
  key: "memory:previous",
  entityType: "memory" as const,
  kind: { classification: "product" as const, name: "Memory" as const },
  label: "Previous operating decision",
  summary: "A superseded decision.",
  source: { kind: "record" as const, recordType: "memory", recordKey: "previous-record" },
  freshness: { state: "stale" as const, observedAt: "2026-09-12T12:00:00.000Z" },
  evidence: { state: "absent" as const },
  version: { version: 1, deprecated: true },
  order: { distance: 1, kindRank: 0 },
}

const unknownArtifact = {
  key: "structural:artifact",
  entityType: "structural" as const,
  kind: { classification: "unknown" as const, name: "Artifact" },
  label: "Unclassified artifact",
  source: { kind: "record" as const, recordType: "artifact", recordKey: "artifact-record" },
  freshness: { state: "unknown" as const, observedAt: "2026-08-12T12:00:00.000Z" },
  evidence: { state: "unavailable" as const, reasonCode: "EVIDENCE_BACKEND_UNAVAILABLE", retryable: true },
  order: { distance: 2, kindRank: 1 },
}

const supersedes = {
  key: "edge:supersedes-current-previous",
  sourceNodeKey: current.key,
  targetNodeKey: previous.key,
  kind: { classification: "canonical" as const, name: "SUPERSEDES" as const },
  label: "supersedes",
  source: { kind: "derivation" as const, ruleId: "supersedes", ruleVersion: 1, sourceRecordKeys: ["current-record", "previous-record"] },
  freshness: { state: "current" as const, observedAt: "2026-10-12T12:00:00.000Z" },
  evidence: { state: "available" as const, references: ["receipt:current"] },
  order: { depth: 0, direction: "outgoing" as const },
}

const relatesToArtifact = {
  key: "edge:relates-current-artifact",
  sourceNodeKey: current.key,
  targetNodeKey: unknownArtifact.key,
  kind: { classification: "canonical" as const, name: "RELATES_TO" as const },
  label: "relates to",
  source: { kind: "record" as const, recordType: "relationship", recordKey: "relates-record" },
  freshness: { state: "current" as const, observedAt: "2026-10-12T12:00:00.000Z" },
  evidence: { state: "unavailable" as const, reasonCode: "EVIDENCE_BACKEND_UNAVAILABLE", retryable: true },
  order: { depth: 1, direction: "outgoing" as const },
}

export function completeFocusedSubgraph(): SubgraphResponse {
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "complete",
    snapshot,
    budgets,
    nodes: [current, previous, unknownArtifact],
    edges: [supersedes],
    warnings: [],
    inspection: {
      nodeKey: current.key,
      scope: { tenantId: "allura-test", workspaceId: "workspace-test" },
      content: "Approved operating decision content.",
      provenance: current.source,
      evidence: current.evidence,
      lineage: [{
        newerNodeKey: current.key,
        supersededNodeKey: previous.key,
        relationshipKey: supersedes.key,
      }],
      relationshipKeys: [supersedes.key],
    },
  })
}

export function emptyFocusedSubgraph(): SubgraphResponse {
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "empty",
    snapshot,
    budgets,
    nodes: [],
    edges: [],
    warnings: [],
  })
}

export function overviewFocusedSubgraph(): SubgraphResponse {
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "complete",
    snapshot,
    budgets: overviewBudgets,
    nodes: [current, previous, unknownArtifact].map((node) => ({ ...node, order: { ...node.order, distance: 0 } })),
    edges: [supersedes],
    warnings: [],
  })
}

export function partialFocusedSubgraph(continuation = "page.one"): SubgraphResponse {
  const complete = completeFocusedSubgraph()
  if (complete.state !== "complete") throw new Error("fixture contract")
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "partial",
    snapshot,
    budgets: partialBudgets,
    nodes: [current, previous],
    edges: [supersedes],
    warnings: ["FIRST_PAGE"],
    inspection: complete.inspection,
    exhausted: "nodes",
    continuation,
  })
}

export function continuationFocusedSubgraph(): SubgraphResponse {
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "complete",
    snapshot,
    budgets: partialBudgets,
    nodes: [current, unknownArtifact],
    edges: [relatesToArtifact],
    warnings: ["SECOND_PAGE"],
  })
}

export function terminalEmptyFocusedSubgraph(): SubgraphResponse {
  return SubgraphResponseSchema.parse({
    contractVersion: "2.0",
    state: "empty",
    snapshot,
    budgets: partialBudgets,
    nodes: [],
    edges: [],
    warnings: ["TERMINAL_EMPTY_PAGE"],
  })
}

export const deniedFocusedSubgraph = (): SubgraphResponse => SubgraphResponseSchema.parse({
  contractVersion: "2.0",
  state: "denied",
  reasonCode: "INSUFFICIENT_ROLE",
  action: "request_access",
})

export const unavailableEvidenceFocusedSubgraph = (): SubgraphResponse => {
  const response = completeFocusedSubgraph()
  if (response.state !== "complete" || !response.inspection) throw new Error("fixture contract")
  return SubgraphResponseSchema.parse({
    ...response,
    nodes: response.nodes.map((node) => node.key === "memory:current" ? {
      ...node,
      evidence: { state: "unavailable" as const, reasonCode: "EVIDENCE_BACKEND_UNAVAILABLE", retryable: true },
    } : node),
    inspection: {
      ...response.inspection,
      evidence: { state: "unavailable", reasonCode: "EVIDENCE_BACKEND_UNAVAILABLE", retryable: true },
    },
  })
}
