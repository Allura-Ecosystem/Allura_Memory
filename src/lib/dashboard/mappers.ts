import {
  ActivityItemSchema,
  EvidenceSchema,

  GraphEdgeSchema,
  GraphNodeSchema,
  InsightSchema,
  MemorySchema,
  MetricSchema,
  SystemStatusSchema,
  validateDashboardArray,
  validateDashboardShape} from "@/lib/dashboard/schemas"
import type {
  ActivityItem,
  DashboardWarning,
  DecisionRecord,
  Evidence,
  GraphEdge,
  GraphNode,
  Insight,
  Memory,
  Metric,
  SystemStatus,
} from "@/lib/dashboard/types"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function str(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function iso(value: unknown): string {
  const source = typeof value === "string" || value instanceof Date ? value : new Date().toISOString()
  const parsed = new Date(source)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function titleFromContent(content: string): string {
  const first = content.split("\n").find(Boolean) ?? content
  return first.length > 86 ? `${first.slice(0, 83)}...` : first || "Untitled"
}

function metadataTags(metadata: Record<string, unknown>): string[] {
  const tags = metadata.tags
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean)
  if (typeof tags === "string") return tags.split(",").map((tag) => tag.trim()).filter(Boolean)
  return []
}

export function warningFrom(source: string, warning: string | null): DashboardWarning[] {
  return warning ? [{ id: `${source}-warning`, source, message: warning }] : []
}

export function mapMemory(raw: unknown): Memory {
  const item = record(raw)
  const metadata = record(item.metadata)
  const content = str(item.content, str(item.text, ""))
  const source = str(item.source, str(item.provenance, "memory")).toLowerCase()
  const status = str(item.status, num(item.score, 0) >= 0.85 ? "approved" : "pending").toLowerCase()
  const id = str(item.id, str(metadata.memory_id, crypto.randomUUID()))
  return {
    id,
    title: titleFromContent(content),
    content,
    type: source.includes("semantic") || source.includes("insight") ? "insight" : "memory",
    agent: str(item.actor, str(item.user_id, str(metadata.agent_id, "Unknown agent"))),
    project: str(metadata.project, str(metadata.project_id, "Allura Core")),
    timestamp: iso(item.created_at ?? item.timestamp),
    status: status.includes("reject") ? "rejected" : status.includes("super") ? "superseded" : status.includes("active") ? "active" : status.includes("approve") ? "approved" : "pending",
    priority: num(item.score, 0) >= 0.85 ? "high" : num(item.score, 0) >= 0.65 ? "medium" : "low",
    evidenceIds: [str(metadata.trace_ref, "")].filter(Boolean),
    connectedMemoryCount: num(metadata.connected_count, 0),
    tags: metadataTags(metadata).length ? metadataTags(metadata) : Array.isArray(item.tags) ? item.tags.map(String) : [],
    confidence: item.score === undefined ? undefined : num(item.score),
  }
}

export function mapMemoriesResponse(raw: unknown): Memory[] {
  const payload = record(raw)
  const candidates = Array.isArray(payload.memories)
    ? payload.memories
    : Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.data)
        ? payload.data
        : []
  const mapped = candidates.map(mapMemory)
  const { data, driftCount } = validateDashboardArray(MemorySchema, mapped, "Memory")
  if (driftCount > 0) {
    console.warn(`[dashboard:shape-drift] Memory response: ${driftCount} schema violations across ${mapped.length} items`)
  }
  return data
}

export function mapProposalToInsight(raw: unknown): Insight {
  const proposal = record(raw)
  const content = str(proposal.content, "Untitled proposal")
  const score = num(proposal.score)
  return {
    id: str(proposal.id),
    title: titleFromContent(content),
    content,
    confidence: score > 1 ? score / 100 : score,
    status: str(proposal.status, "pending") as Insight["status"],
    event: str(proposal.tier, "Candidate insight"),
    outcome: str(proposal.reasoning, "Awaiting curator review"),
    evidence: str(proposal.trace_ref, "No trace reference attached"),
    agent: str(proposal.created_by, str(record(proposal.metadata).agent_id, "Allura Curator")),
    project: str(record(proposal.metadata).project, "Allura Core"),
    createdAt: iso(proposal.created_at),
    evidenceId: typeof proposal.trace_ref === "string" ? proposal.trace_ref : undefined,
  }
}

export function mapInsight(raw: unknown): Insight {
  const item = record(raw)
  const metadata = record(item.metadata)
  const content = str(item.content, str(item.title, "Untitled insight"))
  const confidence = num(item.confidence, num(item.score, 0))
  return {
    id: str(item.id, str(item.insight_id)),
    title: titleFromContent(content),
    content,
    confidence: confidence > 1 ? confidence / 100 : confidence,
    status: str(item.status, "active") as Insight["status"],
    event: str(metadata.event, str(item.source_type, "Promoted memory pattern")),
    outcome: str(metadata.outcome, "Canonical insight stored in Brain"),
    evidence: str(item.source_ref, str(metadata.trace_ref, "No source reference attached")),
    agent: str(item.actor, str(item.created_by, str(metadata.agent_id, "Allura Curator"))),
    project: str(metadata.project, "Allura Core"),
    createdAt: iso(item.created_at),
    evidenceId: typeof item.source_ref === "string" ? item.source_ref : undefined,
  }
}

export function mapInsightsResponse(raw: unknown): Insight[] {
  const payload = record(raw)
  const mapped = (Array.isArray(payload.insights) ? payload.insights : []).map(mapInsight)
  const { data, driftCount } = validateDashboardArray(InsightSchema, mapped, "Insight")
  if (driftCount > 0) {
    console.warn(`[dashboard:shape-drift] Insight response: ${driftCount} schema violations across ${mapped.length} items`)
  }
  return data
}

export function mapProposalsResponse(raw: unknown): Insight[] {
  const payload = record(raw)
  const mapped = (Array.isArray(payload.proposals) ? payload.proposals : []).map(mapProposalToInsight)
  const { data, driftCount } = validateDashboardArray(InsightSchema, mapped, "ProposalInsight")
  if (driftCount > 0) {
    console.warn(`[dashboard:shape-drift] Proposal response: ${driftCount} schema violations across ${mapped.length} items`)
  }
  return data
}

export function mapTraceToEvidence(raw: unknown): Evidence {
  const trace = record(raw)
  const metadata = record(trace.metadata)
  const content = str(trace.content, JSON.stringify(trace, null, 2))
  return {
    id: str(trace.id, str(trace.trace_id, str(metadata.trace_ref, crypto.randomUUID()))),
    title: titleFromContent(content),
    status: str(trace.status, "active") as Evidence["status"],
    rawLog: content,
    source: str(trace.trace_type, str(trace.type, "trace")),
    agent: str(trace.agent_id, str(trace.agent, str(metadata.agent_id, "Unknown agent"))),
    project: str(metadata.project, "Allura Core"),
    timestamp: iso(trace.created_at ?? trace.timestamp),
    tags: metadataTags(metadata),
    metadata,
    relatedInsightId: typeof metadata.insight_id === "string" ? metadata.insight_id : undefined,
    relatedMemoryId: typeof metadata.memory_id === "string" ? metadata.memory_id : undefined,
  }
}

export function mapTracesResponse(raw: unknown): Evidence[] {
  const payload = record(raw)
  const mapped = (Array.isArray(payload.traces) ? payload.traces : []).map(mapTraceToEvidence)
  const { data, driftCount } = validateDashboardArray(EvidenceSchema, mapped, "Evidence")
  if (driftCount > 0) {
    console.warn(`[dashboard:shape-drift] Trace response: ${driftCount} schema violations across ${mapped.length} items`)
  }
  return data
}

export function mapAuditActivity(raw: unknown): ActivityItem {
  const event = record(raw)
  const metadata = record(event.metadata)
  const eventType = str(event.event_type, "system_event")
  const status = str(event.status, "unknown")
  return {
    id: String(event.id ?? crypto.randomUUID()),
    title: eventType.replace(/[_-]+/g, " "),
    description: `${str(event.agent_id, "system")} recorded ${eventType} with ${status} status`,
    timestamp: iso(event.created_at),
    kind: eventType.includes("proposal") || eventType.includes("approve") ? "approval" : eventType.includes("memory") ? "memory" : eventType.includes("insight") ? "insight" : status === "failed" ? "warning" : "system",
    agent: str(event.agent_id, str(metadata.agent_id, "system")),
  }
}

export function mapAuditResponse(raw: unknown): ActivityItem[] {
  const payload = record(raw)
  const mapped = (Array.isArray(payload.events) ? payload.events : []).map(mapAuditActivity)
  const { data, driftCount } = validateDashboardArray(ActivityItemSchema, mapped, "Activity")
  if (driftCount > 0) {
    console.warn(`[dashboard:shape-drift] Audit response: ${driftCount} schema violations across ${mapped.length} items`)
  }
  return data
}

export function mapSystemStatus(raw: unknown): SystemStatus {
  const payload = record(raw)
  const components = Array.isArray(payload.components) ? payload.components.map((component) => {
    const c = record(component)
    return {
      name: str(c.name, "component"),
      status: str(c.status, "unknown") as SystemStatus["status"],
      message: typeof c.message === "string" ? c.message : undefined,
      latency: typeof c.latency === "number" ? c.latency : undefined,
    }
  }) : []
  return {
    status: str(payload.status, components.some((c) => c.status === "unhealthy") ? "unhealthy" : "unknown") as SystemStatus["status"],
    components,
  }
}

export function mapMetrics(memoryCount: number, pendingInsights: number, approvedInsights: number, graphConnections: number | string, failedPromotions: number): Metric[] {
  return [
    { id: "pending-insights", label: "Pending Insights", value: pendingInsights, description: "Awaiting curator review", tone: "orange" },
    { id: "approved-insights", label: "Approved Insights", value: approvedInsights, description: "Canonical active insights", tone: "green" },
    { id: "graph-connections", label: "Graph Connections", value: graphConnections, description: `${memoryCount} memories in tenant scope`, tone: "blue" },
    { id: "failed-promotions", label: "Failed Promotions", value: failedPromotions, description: "Promotion failures in audit trail", tone: failedPromotions > 0 ? "red" : "gold" },
  ]
}

export function mapDecisionEvent(raw: unknown): DecisionRecord {
  const event = record(raw)
  const metadata = record(event.metadata)
  const eventType = str(event.event_type, "ARCHITECTURE_DECISION")

  // Decision title: prefer metadata.title, then metadata.decision, then format event_type
  const title = str(
    metadata.title,
    str(metadata.decision, eventType.replace(/[_-]+/g, " "))
  )

  // Summary: prefer metadata.summary, then metadata.description, then metadata.content
  const summary = str(
    metadata.summary,
    str(metadata.description, str(metadata.content, "No summary captured."))
  )

  // Rationale: prefer metadata.rationale, then metadata.reasoning, then empty
  const rationale = str(metadata.rationale, str(metadata.reasoning, ""))

  // Status: prefer metadata.status with normalisation, fall back to "decided"
  const rawStatus = str(metadata.status, "decided").toLowerCase()
  const status: DecisionRecord["status"] =
    rawStatus === "proposed" ? "proposed" :
    rawStatus === "superseded" ? "superseded" :
    rawStatus === "deferred" ? "deferred" :
    rawStatus === "decided" ? "decided" :
    "unknown"

  return {
    id: String(event.id ?? crypto.randomUUID()),
    title,
    summary,
    rationale,
    status,
    agentId: str(event.agent_id, str(metadata.agent_id, "system")),
    groupId: str(event.group_id, "allura-system"),
    createdAt: iso(event.created_at),
    eventType,
    metadata,
  }
}

export function mapDecisionsResponse(raw: unknown): DecisionRecord[] {
  const payload = record(raw)
  return (Array.isArray(payload.events) ? payload.events : []).map(mapDecisionEvent)
}

export function mapGraph(raw: unknown): { nodes: GraphNode[]; edges: GraphEdge[]; totalEdges?: number } {
  const payload = record(raw)
  const mappedNodes = Array.isArray(payload.nodes) ? payload.nodes.map((node) => {
    const n = record(node)
    return {
      id: str(n.id),
      label: str(n.label, str(n.title, str(n.id))),
      type: str(n.type, "memory") as GraphNode["type"],
      metadata: record(n.metadata),
    }
  }) : []
  const mappedEdges = Array.isArray(payload.edges) ? payload.edges.map((edge) => {
    const e = record(edge)
    return {
      id: str(e.id),
      source: str(e.source),
      target: str(e.target),
      label: str(e.label, "connected_to") as GraphEdge["label"],
      metadata: record(e.metadata),
    }
  }) : []

  // Validate graph shape with drift detection
  const { data: nodes } = validateDashboardArray(GraphNodeSchema, mappedNodes, "GraphNode")
  const { data: edges } = validateDashboardArray(GraphEdgeSchema, mappedEdges, "GraphEdge")

  return { nodes, edges, totalEdges: typeof payload.total_edges === "number" ? payload.total_edges : undefined }
}
