import { z } from "zod/v4"

export const FOCUSED_SUBGRAPH_CONTRACT_VERSION = "2.0" as const
export const FOCUSED_SUBGRAPH_MAX_NODES = 200
export const FOCUSED_SUBGRAPH_MAX_EDGES = 400
export const FOCUSED_SUBGRAPH_MAX_DEPTH = 2
export const FOCUSED_SUBGRAPH_CONTINUATION_MAX_LENGTH = 4096

const KIND_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/
const QUALIFIED_NODE_KEY_PATTERN = /^(memory|structural):[A-Za-z0-9][A-Za-z0-9._~:@/-]*$/
const EDGE_KEY_PATTERN = /^edge:[A-Za-z0-9][A-Za-z0-9._~:@/-]*$/
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9._~-]+$/
const HEX_DIGEST_PATTERN = /^[a-f0-9]{64}$/
const PRODUCT_NODE_KINDS = ["Memory", "Agent", "Team", "Project"] as const
const CANONICAL_RELATIONSHIP_KINDS = ["AUTHORED_BY", "RELATES_TO", "MEMBER_OF", "CONTRIBUTES_TO", "SUPERSEDES"] as const

const KindNameSchema = z.string().min(1).max(128).regex(KIND_NAME_PATTERN)
const FilterSchema = z.array(KindNameSchema).max(100)
const RequestedNodeLimitSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const RequestedEdgeLimitSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const RequestedDepthSchema = z.number().int().min(0).max(FOCUSED_SUBGRAPH_MAX_DEPTH)
const ContinuationTokenSchema = z
  .string()
  .min(1)
  .max(FOCUSED_SUBGRAPH_CONTINUATION_MAX_LENGTH)
  .regex(OPAQUE_TOKEN_PATTERN)

export const QualifiedNodeKeySchema = z
  .string()
  .min(3)
  .max(520)
  .regex(QUALIFIED_NODE_KEY_PATTERN, "node key must be qualified as memory:<opaque-id> or structural:<opaque-id>")

export const StableEdgeKeySchema = z
  .string()
  .min(6)
  .max(520)
  .regex(EDGE_KEY_PATTERN, "edge key must be qualified as edge:<opaque-id>")

export const OverviewSubgraphQuerySchema = z.strictObject({
  kind: z.literal("overview"),
  nodeKinds: FilterSchema.optional(),
  relationshipKinds: FilterSchema.optional(),
  nodeLimit: RequestedNodeLimitSchema.optional(),
  edgeLimit: RequestedEdgeLimitSchema.optional(),
  continuation: ContinuationTokenSchema.optional(),
})

export const FocusSubgraphQuerySchema = z.strictObject({
  kind: z.literal("focus"),
  focusNodeKey: QualifiedNodeKeySchema,
  direction: z.enum(["incoming", "outgoing", "both"]).optional(),
  depth: RequestedDepthSchema.optional(),
  includeLineage: z.boolean().optional(),
  nodeKinds: FilterSchema.optional(),
  relationshipKinds: FilterSchema.optional(),
  nodeLimit: RequestedNodeLimitSchema.optional(),
  edgeLimit: RequestedEdgeLimitSchema.optional(),
  continuation: ContinuationTokenSchema.optional(),
})

/** Browser input. Strict objects make caller-owned authority fields invalid. */
export const SubgraphQuerySchema = z.discriminatedUnion("kind", [
  OverviewSubgraphQuerySchema,
  FocusSubgraphQuerySchema,
])

const RequestedBudgetsSchema = z.strictObject({
  nodeLimit: RequestedNodeLimitSchema,
  edgeLimit: RequestedEdgeLimitSchema,
  depth: RequestedDepthSchema,
})

export const EffectiveSubgraphBudgetsSchema = z.strictObject({
  nodeLimit: z.number().int().min(1).max(FOCUSED_SUBGRAPH_MAX_NODES),
  edgeLimit: z.number().int().min(1).max(FOCUSED_SUBGRAPH_MAX_EDGES),
  depth: z.number().int().min(0).max(FOCUSED_SUBGRAPH_MAX_DEPTH),
})

const NormalizedCommonShape = {
  contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
  nodeKinds: z.array(KindNameSchema).max(100),
  relationshipKinds: z.array(KindNameSchema).max(100),
  requestedBudgets: RequestedBudgetsSchema,
  effectiveBudgets: EffectiveSubgraphBudgetsSchema,
  continuation: ContinuationTokenSchema.nullable(),
}

export const NormalizedOverviewSubgraphQuerySchema = z.strictObject({
  ...NormalizedCommonShape,
  kind: z.literal("overview"),
})

export const NormalizedFocusSubgraphQuerySchema = z.strictObject({
  ...NormalizedCommonShape,
  kind: z.literal("focus"),
  focusNodeKey: QualifiedNodeKeySchema,
  direction: z.enum(["incoming", "outgoing", "both"]),
  includeLineage: z.boolean(),
})

export const NormalizedSubgraphQuerySchema = z.discriminatedUnion("kind", [
  NormalizedOverviewSubgraphQuerySchema,
  NormalizedFocusSubgraphQuerySchema,
])

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeFilter(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort(compareCanonical)
}

function isStrictlyCanonical<T>(values: readonly T[], compare: (left: T, right: T) => number): boolean {
  return values.every((value, index) => index === 0 || compare(values[index - 1]!, value) < 0)
}

function canonicalStringArray(item: z.ZodString, options: { min?: number; max: number }) {
  return z
    .array(item)
    .min(options.min ?? 0)
    .max(options.max)
    .refine((values) => isStrictlyCanonical(values, compareCanonical), {
      message: "array values must be unique and in canonical order",
    })
}

/** Parse, default, sort, deduplicate, and cap browser traversal intent. */
export function normalizeSubgraphQuery(input: unknown): NormalizedSubgraphQuery {
  const query = SubgraphQuerySchema.parse(input)
  const requestedDepth = query.kind === "focus" ? (query.depth ?? 1) : 0
  const requestedBudgets = {
    nodeLimit: query.nodeLimit ?? FOCUSED_SUBGRAPH_MAX_NODES,
    edgeLimit: query.edgeLimit ?? FOCUSED_SUBGRAPH_MAX_EDGES,
    depth: requestedDepth,
  }
  const common = {
    contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
    nodeKinds: normalizeFilter(query.nodeKinds),
    relationshipKinds: normalizeFilter(query.relationshipKinds),
    requestedBudgets,
    effectiveBudgets: {
      nodeLimit: Math.min(requestedBudgets.nodeLimit, FOCUSED_SUBGRAPH_MAX_NODES),
      edgeLimit: Math.min(requestedBudgets.edgeLimit, FOCUSED_SUBGRAPH_MAX_EDGES),
      depth: Math.min(requestedDepth, FOCUSED_SUBGRAPH_MAX_DEPTH),
    },
    continuation: query.continuation ?? null,
  }

  return NormalizedSubgraphQuerySchema.parse(
    query.kind === "overview"
      ? { ...common, kind: "overview" }
      : {
          ...common,
          kind: "focus",
          focusNodeKey: query.focusNodeKey,
          direction: query.direction ?? "both",
          includeLineage: query.includeLineage ?? false,
        },
  )
}

/** Stable JSON input for the server-side normalized-query digest. */
export function serializeNormalizedSubgraphQuery(query: NormalizedSubgraphQuery): string {
  const parsed = NormalizedSubgraphQuerySchema.parse(query)
  const { continuation: _continuation, ...semanticQuery } = parsed
  return JSON.stringify({
    ...semanticQuery,
    nodeKinds: normalizeFilter(parsed.nodeKinds),
    relationshipKinds: normalizeFilter(parsed.relationshipKinds),
  })
}

const SourceRecordReferenceSchema = z.strictObject({
  kind: z.literal("record"),
  recordType: KindNameSchema,
  recordKey: z.string().min(1).max(512),
})

const DerivedSourceReferenceSchema = z.strictObject({
  kind: z.literal("derivation"),
  ruleId: z.string().min(1).max(128).regex(KIND_NAME_PATTERN),
  ruleVersion: z.number().int().min(1),
  sourceRecordKeys: canonicalStringArray(z.string().min(1).max(512), { min: 1, max: 100 }),
})

export const SubgraphSourceReferenceSchema = z.discriminatedUnion("kind", [
  SourceRecordReferenceSchema,
  DerivedSourceReferenceSchema,
])

export const SubgraphEvidenceSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    references: canonicalStringArray(z.string().min(1).max(512), { min: 1, max: 100 }),
  }),
  z.strictObject({ state: z.literal("absent") }),
  z.strictObject({
    state: z.literal("unavailable"),
    reasonCode: z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/),
    retryable: z.boolean(),
  }),
])

export const SubgraphNodeKindSchema = z.discriminatedUnion("classification", [
  z.strictObject({
    classification: z.literal("product"),
    name: z.enum(PRODUCT_NODE_KINDS),
  }),
  z.strictObject({
    classification: z.literal("structural"),
    name: KindNameSchema.refine((name) => !PRODUCT_NODE_KINDS.includes(name as (typeof PRODUCT_NODE_KINDS)[number]), {
      message: "reserved product kind requires product classification",
    }),
  }),
  z.strictObject({
    classification: z.literal("unknown"),
    name: KindNameSchema.refine((name) => !PRODUCT_NODE_KINDS.includes(name as (typeof PRODUCT_NODE_KINDS)[number]), {
      message: "reserved product kind requires product classification",
    }),
  }),
])

export const SubgraphRelationshipKindSchema = z.discriminatedUnion("classification", [
  z.strictObject({
    classification: z.literal("canonical"),
    name: z.enum(CANONICAL_RELATIONSHIP_KINDS),
  }),
  z.strictObject({
    classification: z.literal("unknown"),
    name: KindNameSchema.refine(
      (name) => !CANONICAL_RELATIONSHIP_KINDS.includes(name as (typeof CANONICAL_RELATIONSHIP_KINDS)[number]),
      { message: "reserved relationship kind requires canonical classification" },
    ),
  }),
])

const FreshnessSchema = z.strictObject({
  state: z.enum(["current", "stale", "unknown"]),
  observedAt: z.string().datetime({ offset: true }),
})

const VersionStateSchema = z.strictObject({
  version: z.number().int().min(1),
  deprecated: z.boolean(),
})

export const SubgraphNodeSchema = z
  .strictObject({
    key: QualifiedNodeKeySchema,
    entityType: z.enum(["memory", "structural"]),
    kind: SubgraphNodeKindSchema,
    label: z.string().min(1).max(512),
    summary: z.string().min(1).max(2_000).optional(),
    source: SubgraphSourceReferenceSchema,
    freshness: FreshnessSchema,
    evidence: SubgraphEvidenceSchema,
    version: VersionStateSchema.optional(),
    order: z.strictObject({
      distance: z.number().int().min(0).max(FOCUSED_SUBGRAPH_MAX_DEPTH),
      kindRank: z.number().int().min(0),
    }),
  })
  .superRefine((node, context) => {
    if (!node.key.startsWith(`${node.entityType}:`)) {
      context.addIssue({ code: "custom", path: ["key"], message: "node key prefix must match entityType" })
    }
    if (node.kind.classification === "product" && node.kind.name === "Memory" && node.entityType !== "memory") {
      context.addIssue({ code: "custom", path: ["entityType"], message: "Memory product nodes require memory keys" })
    }
    if (node.kind.classification === "product" && node.kind.name !== "Memory" && node.entityType !== "structural") {
      context.addIssue({ code: "custom", path: ["entityType"], message: "structural product nodes require structural keys" })
    }
  })

export const SubgraphEdgeSchema = z.strictObject({
  key: StableEdgeKeySchema,
  sourceNodeKey: QualifiedNodeKeySchema,
  targetNodeKey: QualifiedNodeKeySchema,
  kind: SubgraphRelationshipKindSchema,
  label: z.string().min(1).max(256),
  source: SubgraphSourceReferenceSchema,
  freshness: FreshnessSchema,
  evidence: SubgraphEvidenceSchema,
  order: z.strictObject({
    depth: z.number().int().min(0).max(FOCUSED_SUBGRAPH_MAX_DEPTH),
    direction: z.enum(["incoming", "outgoing"]),
  }),
})

const FocusedInspectionSchema = z.strictObject({
  nodeKey: QualifiedNodeKeySchema,
  scope: z.strictObject({
    tenantId: z.string().min(1).max(256),
    workspaceId: z.string().min(1).max(256),
  }),
  content: z.string().min(1).max(20_000).optional(),
  summary: z.string().min(1).max(4_000).optional(),
  provenance: SubgraphSourceReferenceSchema,
  evidence: SubgraphEvidenceSchema,
  lineage: z
    .array(
      z.strictObject({
        newerNodeKey: QualifiedNodeKeySchema,
        supersededNodeKey: QualifiedNodeKeySchema,
        relationshipKey: StableEdgeKeySchema,
      }),
    )
    .max(100)
    .refine(
      (lineage) =>
        isStrictlyCanonical(lineage, (left, right) =>
          compareCanonical(left.newerNodeKey, right.newerNodeKey) ||
          compareCanonical(left.supersededNodeKey, right.supersededNodeKey) ||
          compareCanonical(left.relationshipKey, right.relationshipKey)),
      { message: "lineage must be unique and in canonical order" },
    ),
  relationshipKeys: canonicalStringArray(StableEdgeKeySchema, { max: FOCUSED_SUBGRAPH_MAX_EDGES }),
})

const SnapshotSchema = z.strictObject({
  policyEpoch: z.number().int().min(1),
  graphRevision: z.number().int().min(0),
  capturedAt: z.string().datetime({ offset: true }),
})

const ResultBudgetsSchema = z
  .strictObject({
    requested: RequestedBudgetsSchema,
    applied: EffectiveSubgraphBudgetsSchema,
  })
  .superRefine((budgets, context) => {
    for (const field of ["nodeLimit", "edgeLimit", "depth"] as const) {
      if (budgets.applied[field] > budgets.requested[field]) {
        context.addIssue({ code: "custom", path: ["applied", field], message: "applied budget cannot exceed requested budget" })
      }
    }
  })

const WarningCodeSchema = z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/)
const WarningCodesSchema = canonicalStringArray(WarningCodeSchema, { max: 64 })

const GraphPageShape = {
  contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
  snapshot: SnapshotSchema,
  budgets: ResultBudgetsSchema,
  nodes: z.array(SubgraphNodeSchema).max(FOCUSED_SUBGRAPH_MAX_NODES),
  edges: z.array(SubgraphEdgeSchema).max(FOCUSED_SUBGRAPH_MAX_EDGES),
  warnings: WarningCodesSchema,
  inspection: FocusedInspectionSchema.optional(),
}

export const CompleteSubgraphResultSchema = z.strictObject({
  ...GraphPageShape,
  state: z.literal("complete"),
  nodes: z.array(SubgraphNodeSchema).min(1).max(FOCUSED_SUBGRAPH_MAX_NODES),
})

export const EmptySubgraphResultSchema = z.strictObject({
  ...GraphPageShape,
  state: z.literal("empty"),
  nodes: z.array(z.never()).max(0),
  edges: z.array(z.never()).max(0),
})

export const PartialSubgraphResultSchema = z.strictObject({
  ...GraphPageShape,
  state: z.literal("partial"),
  nodes: z.array(SubgraphNodeSchema).min(1).max(FOCUSED_SUBGRAPH_MAX_NODES),
  exhausted: z.enum(["nodes", "edges", "nodes_and_edges"]),
  continuation: ContinuationTokenSchema,
})

const FallbackContextSchema = z.strictObject({
  kind: z.literal("event-context"),
  equivalence: z.literal("non-equivalent"),
  observedAt: z.string().datetime({ offset: true }),
  summary: z.string().min(1).max(2_000),
  sourceReferences: canonicalStringArray(z.string().min(1).max(512), { max: 100 }),
})

const DegradedResultCommonShape = {
  contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
  state: z.literal("degraded"),
  warnings: WarningCodesSchema,
  fallback: FallbackContextSchema.optional(),
}

export const DegradedSubgraphResultSchema = z.discriminatedUnion("reasonCode", [
  z.strictObject({ ...DegradedResultCommonShape, reasonCode: z.literal("AMBIGUOUS_ENDPOINTS"), retryable: z.literal(false), action: z.literal("none") }),
  z.strictObject({ ...DegradedResultCommonShape, reasonCode: z.literal("GRAPH_DATA_UNAVAILABLE"), retryable: z.literal(true), action: z.literal("retry") }),
  z.strictObject({ ...DegradedResultCommonShape, reasonCode: z.literal("GRAPH_V2_UNAVAILABLE"), retryable: z.literal(false), action: z.literal("none") }),
])

const DeniedResultCommonShape = {
  contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
  state: z.literal("denied"),
}

export const DeniedSubgraphResultSchema = z.discriminatedUnion("reasonCode", [
  z.strictObject({ ...DeniedResultCommonShape, reasonCode: z.literal("LOGIN_REQUIRED"), action: z.literal("login") }),
  z.strictObject({ ...DeniedResultCommonShape, reasonCode: z.literal("INSUFFICIENT_ROLE"), action: z.literal("request_access") }),
  z.strictObject({ ...DeniedResultCommonShape, reasonCode: z.literal("SCOPE_CONFLICT"), action: z.literal("none") }),
  z.strictObject({ ...DeniedResultCommonShape, reasonCode: z.literal("CONTINUATION_AUTHORITY_MISMATCH"), action: z.literal("restart") }),
])

const ErrorResultCommonShape = {
  contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
  state: z.literal("error"),
}

export const ErrorSubgraphResultSchema = z.discriminatedUnion("code", [
  z.strictObject({ ...ErrorResultCommonShape, code: z.literal("MALFORMED_QUERY"), retryable: z.literal(false), action: z.literal("none") }),
  z.strictObject({ ...ErrorResultCommonShape, code: z.literal("MALFORMED_CONTINUATION"), retryable: z.literal(false), action: z.literal("restart") }),
  z.strictObject({ ...ErrorResultCommonShape, code: z.literal("CONTINUATION_CONFLICT"), retryable: z.literal(false), action: z.literal("restart") }),
  z.strictObject({ ...ErrorResultCommonShape, code: z.literal("SNAPSHOT_CONFLICT"), retryable: z.literal(false), action: z.literal("restart") }),
  z.strictObject({ ...ErrorResultCommonShape, code: z.literal("UNAVAILABLE"), retryable: z.literal(true), action: z.literal("retry") }),
  z.strictObject({ ...ErrorResultCommonShape, code: z.literal("INTERNAL"), retryable: z.literal(true), action: z.literal("retry") }),
])

const RawSubgraphResponseSchema = z.union([
  CompleteSubgraphResultSchema,
  EmptySubgraphResultSchema,
  PartialSubgraphResultSchema,
  DegradedSubgraphResultSchema,
  DeniedSubgraphResultSchema,
  ErrorSubgraphResultSchema,
])

function compareSubgraphNodes(left: z.infer<typeof SubgraphNodeSchema>, right: z.infer<typeof SubgraphNodeSchema>): number {
  return left.order.distance - right.order.distance ||
    left.order.kindRank - right.order.kindRank ||
    Date.parse(right.freshness.observedAt) - Date.parse(left.freshness.observedAt) ||
    compareCanonical(left.key, right.key)
}

function compareSubgraphEdges(left: z.infer<typeof SubgraphEdgeSchema>, right: z.infer<typeof SubgraphEdgeSchema>): number {
  return left.order.depth - right.order.depth ||
    compareCanonical(left.kind.name, right.kind.name) ||
    compareCanonical(left.order.direction, right.order.direction) ||
    compareCanonical(left.sourceNodeKey, right.sourceNodeKey) ||
    compareCanonical(left.targetNodeKey, right.targetNodeKey) ||
    compareCanonical(left.key, right.key)
}

/** Versioned response contract with endpoint closure and collision checks. */
export const SubgraphResponseSchema = RawSubgraphResponseSchema.superRefine((response, context) => {
  if (response.state !== "complete" && response.state !== "empty" && response.state !== "partial") return

  if (response.nodes.length > response.budgets.applied.nodeLimit) {
    context.addIssue({ code: "custom", path: ["nodes"], message: "node page exceeds applied budget" })
  }
  if (response.edges.length > response.budgets.applied.edgeLimit) {
    context.addIssue({ code: "custom", path: ["edges"], message: "edge page exceeds applied budget" })
  }
  if (!isStrictlyCanonical(response.nodes, compareSubgraphNodes)) {
    context.addIssue({ code: "custom", path: ["nodes"], message: "nodes must be unique and in canonical traversal order" })
  }
  if (!isStrictlyCanonical(response.edges, compareSubgraphEdges)) {
    context.addIssue({ code: "custom", path: ["edges"], message: "edges must be unique and in canonical traversal order" })
  }

  if (response.state === "partial") {
    const nodesExhausted = response.nodes.length === response.budgets.applied.nodeLimit
    const edgesExhausted = response.edges.length === response.budgets.applied.edgeLimit
    if ((response.exhausted === "nodes" && !nodesExhausted) ||
        (response.exhausted === "edges" && !edgesExhausted) ||
        (response.exhausted === "nodes_and_edges" && (!nodesExhausted || !edgesExhausted))) {
      context.addIssue({ code: "custom", path: ["exhausted"], message: "named exhausted budgets must be reached" })
    }
  }

  const nodeKeys = new Set<string>()
  const nodesByKey = new Map<string, z.infer<typeof SubgraphNodeSchema>>()
  for (const [index, node] of response.nodes.entries()) {
    if (node.order.distance > response.budgets.applied.depth) {
      context.addIssue({ code: "custom", path: ["nodes", index, "order", "distance"], message: "node traversal distance exceeds applied depth" })
    }
    if (nodeKeys.has(node.key)) {
      context.addIssue({ code: "custom", path: ["nodes", index, "key"], message: "node keys must be unique" })
    }
    nodeKeys.add(node.key)
    nodesByKey.set(node.key, node)
  }

  const edgeKeys = new Set<string>()
  const edgesByKey = new Map<string, z.infer<typeof SubgraphEdgeSchema>>()
  for (const [index, edge] of response.edges.entries()) {
    if (edge.order.depth > response.budgets.applied.depth) {
      context.addIssue({ code: "custom", path: ["edges", index, "order", "depth"], message: "edge traversal depth exceeds applied depth" })
    }
    if (edgeKeys.has(edge.key)) {
      context.addIssue({ code: "custom", path: ["edges", index, "key"], message: "edge keys must be unique" })
    }
    edgeKeys.add(edge.key)
    edgesByKey.set(edge.key, edge)
    if (!nodeKeys.has(edge.sourceNodeKey)) {
      context.addIssue({ code: "custom", path: ["edges", index, "sourceNodeKey"], message: "edge source must be present in nodes" })
    }
    if (!nodeKeys.has(edge.targetNodeKey)) {
      context.addIssue({ code: "custom", path: ["edges", index, "targetNodeKey"], message: "edge target must be present in nodes" })
    }
    if (edge.kind.classification === "canonical" && edge.kind.name === "SUPERSEDES") {
      const newerNode = nodesByKey.get(edge.sourceNodeKey)
      const supersededNode = nodesByKey.get(edge.targetNodeKey)
      if (edge.sourceNodeKey === edge.targetNodeKey) {
        context.addIssue({ code: "custom", path: ["edges", index], message: "self-supersession is invalid" })
      }
      if (!newerNode?.version || !supersededNode?.version ||
          newerNode.version.version <= supersededNode.version.version || !supersededNode.version.deprecated) {
        context.addIssue({ code: "custom", path: ["edges", index], message: "SUPERSEDES must point from a newer version to an admitted deprecated version" })
      }
    }
  }

  if (response.inspection) {
    if (!nodeKeys.has(response.inspection.nodeKey)) {
      context.addIssue({ code: "custom", path: ["inspection", "nodeKey"], message: "inspected node must be present in nodes" })
    }
    for (const [index, edgeKey] of response.inspection.relationshipKeys.entries()) {
      if (!edgeKeys.has(edgeKey)) {
        context.addIssue({ code: "custom", path: ["inspection", "relationshipKeys", index], message: "inspection relationship must be present in edges" })
      }
    }
    for (const [index, lineage] of response.inspection.lineage.entries()) {
      if (lineage.newerNodeKey === lineage.supersededNodeKey) {
        context.addIssue({ code: "custom", path: ["inspection", "lineage", index], message: "self-supersession is invalid" })
      }
      if (!nodeKeys.has(lineage.newerNodeKey) || !nodeKeys.has(lineage.supersededNodeKey)) {
        context.addIssue({ code: "custom", path: ["inspection", "lineage", index], message: "lineage nodes must be admitted in the page" })
      }
      const relationship = edgesByKey.get(lineage.relationshipKey)
      if (!relationship || relationship.kind.classification !== "canonical" || relationship.kind.name !== "SUPERSEDES" ||
          relationship.sourceNodeKey !== lineage.newerNodeKey || relationship.targetNodeKey !== lineage.supersededNodeKey ||
          !response.inspection.relationshipKeys.includes(lineage.relationshipKey)) {
        context.addIssue({ code: "custom", path: ["inspection", "lineage", index, "relationshipKey"], message: "lineage requires its admitted newer-to-superseded relationship" })
      }
    }
  }
})

/** Compatibility alias for callers that use result terminology. */
export const SubgraphResultSchema = SubgraphResponseSchema

/**
 * Executable service seam binding one validated response to the exact
 * normalized query that authorized and budgeted it.
 */
export const SubgraphExchangeSchema = z
  .strictObject({
    query: NormalizedSubgraphQuerySchema,
    response: SubgraphResponseSchema,
  })
  .superRefine(({ query, response }, context) => {
    if (response.state !== "complete" && response.state !== "empty" && response.state !== "partial") return

    for (const field of ["nodeLimit", "edgeLimit", "depth"] as const) {
      if (response.budgets.requested[field] !== query.requestedBudgets[field]) {
        context.addIssue({ code: "custom", path: ["response", "budgets", "requested", field], message: "requested budget must match normalized query" })
      }
      if (response.budgets.applied[field] !== query.effectiveBudgets[field]) {
        context.addIssue({ code: "custom", path: ["response", "budgets", "applied", field], message: "applied budget must match normalized query" })
      }
    }

    if (query.kind === "overview" && response.inspection) {
      context.addIssue({ code: "custom", path: ["response", "inspection"], message: "overview responses cannot include focused inspection" })
    }
    if (query.kind === "focus" && response.inspection?.nodeKey !== undefined && response.inspection.nodeKey !== query.focusNodeKey) {
      context.addIssue({ code: "custom", path: ["response", "inspection", "nodeKey"], message: "focused inspection must match focusNodeKey" })
    }
    if (query.kind === "focus" && !query.includeLineage && response.inspection && response.inspection.lineage.length > 0) {
      context.addIssue({ code: "custom", path: ["response", "inspection", "lineage"], message: "lineage was not requested" })
    }
  })

export function validateSubgraphExchange(query: unknown, response: unknown): SubgraphExchange {
  return SubgraphExchangeSchema.parse({ query, response })
}

const NodeOrderingBoundarySchema = z.strictObject({
  distance: z.number().int().min(0).max(FOCUSED_SUBGRAPH_MAX_DEPTH),
  kindRank: z.number().int().min(0),
  freshnessAt: z.string().datetime({ offset: true }),
  nodeKey: QualifiedNodeKeySchema,
})

const EdgeOrderingBoundarySchema = z.strictObject({
  depth: z.number().int().min(0).max(FOCUSED_SUBGRAPH_MAX_DEPTH),
  relationshipKind: KindNameSchema,
  direction: z.enum(["incoming", "outgoing"]),
  sourceNodeKey: QualifiedNodeKeySchema,
  targetNodeKey: QualifiedNodeKeySchema,
  edgeKey: StableEdgeKeySchema,
})

export const SubgraphOrderingBoundarySchema = z
  .strictObject({
    node: NodeOrderingBoundarySchema.nullable(),
    edge: EdgeOrderingBoundarySchema.nullable(),
  })
  .refine((boundary) => boundary.node !== null || boundary.edge !== null, {
    message: "at least one ordering boundary is required",
  })

export const SubgraphContinuationClaimsSchema = z
  .strictObject({
    contractVersion: z.literal(FOCUSED_SUBGRAPH_CONTRACT_VERSION),
    tenantId: z.string().min(1).max(256),
    workspaceId: z.string().min(1).max(256),
    principalId: z.string().min(1).max(256),
    sessionHash: z.string().regex(HEX_DIGEST_PATTERN),
    role: z.enum(["viewer", "curator", "admin"]),
    policyEpoch: z.number().int().min(1),
    routePolicyVersion: z.string().min(1).max(128),
    normalizedQueryHash: z.string().regex(HEX_DIGEST_PATTERN),
    effectiveBudgets: EffectiveSubgraphBudgetsSchema,
    graphRevision: z.number().int().min(0),
    boundary: SubgraphOrderingBoundarySchema,
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    keyVersion: z.number().int().min(1),
  })
  .superRefine((claims, context) => {
    if (Date.parse(claims.expiresAt) <= Date.parse(claims.issuedAt)) {
      context.addIssue({ code: "custom", path: ["expiresAt"], message: "continuation expiry must follow issuance" })
    }
    if (claims.boundary.node && claims.boundary.node.distance > claims.effectiveBudgets.depth) {
      context.addIssue({ code: "custom", path: ["boundary", "node", "distance"], message: "node boundary exceeds effective depth" })
    }
    if (claims.boundary.edge && claims.boundary.edge.depth > claims.effectiveBudgets.depth) {
      context.addIssue({ code: "custom", path: ["boundary", "edge", "depth"], message: "edge boundary exceeds effective depth" })
    }
  })

export type SubgraphQuery = z.infer<typeof SubgraphQuerySchema>
export type NormalizedSubgraphQuery = z.infer<typeof NormalizedSubgraphQuerySchema>
export type EffectiveSubgraphBudgets = z.infer<typeof EffectiveSubgraphBudgetsSchema>
export type QualifiedNodeKey = z.infer<typeof QualifiedNodeKeySchema>
export type SubgraphNode = z.infer<typeof SubgraphNodeSchema>
export type SubgraphEdge = z.infer<typeof SubgraphEdgeSchema>
export type SubgraphResponse = z.infer<typeof SubgraphResponseSchema>
export type SubgraphResult = SubgraphResponse
export type SubgraphContinuationClaims = z.infer<typeof SubgraphContinuationClaimsSchema>
export type SubgraphExchange = z.infer<typeof SubgraphExchangeSchema>
