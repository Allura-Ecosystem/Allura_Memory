export type DashboardStatus = "healthy" | "degraded" | "unhealthy" | "unknown"

export type BadgeTone = "blue" | "orange" | "green" | "charcoal" | "gold" | "red" | "muted"

export interface Metric {
  id: string
  label: string
  value: string | number
  description: string
  tone: BadgeTone
}

export interface Memory {
  id: string
  title: string
  content: string
  type: "event" | "outcome" | "insight" | "memory"
  agent: string
  project: string
  timestamp: string
  status: "pending" | "approved" | "rejected" | "superseded" | "active" | "unknown"
  priority?: "low" | "medium" | "high"
  evidenceIds: string[]
  connectedMemoryCount: number
  tags: string[]
  confidence?: number
}

export interface Insight {
  id: string
  title: string
  content: string
  confidence: number
  status: "pending" | "approved" | "rejected" | "superseded" | "active" | "deprecated" | "unknown"
  event: string
  outcome: string
  evidence: string
  agent: string
  project: string
  createdAt: string
  evidenceId?: string
}

export interface Evidence {
  id: string
  title: string
  status: "pending" | "approved" | "rejected" | "active" | "superseded" | "unknown"
  rawLog: string
  source: string
  agent: string
  project: string
  timestamp: string
  tags: string[]
  metadata: Record<string, unknown>
  relatedInsightId?: string
  relatedMemoryId?: string
}

export interface ActivityItem {
  id: string
  title: string
  description: string
  timestamp: string
  kind: "insight" | "memory" | "approval" | "sync" | "warning" | "system"
  agent: string
}

export type GraphNodeType = "agent" | "event" | "outcome" | "insight" | "project" | "system" | "memory" | "evidence"

export interface GraphNode {
  id: string
  label: string
  type: GraphNodeType
  metadata?: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label: "performed" | "resulted_in" | "generated" | "applies_to" | "connected_to" | "caused_by"
  metadata?: Record<string, unknown>
}

export interface DashboardWarning {
  id: string
  code?: string
  message: string
  source: string
  severity?: "info" | "warning" | "critical"
}

export interface SystemStatus {
  status: DashboardStatus
  components: Array<{
    name: string
    status: DashboardStatus
    message?: string
    latency?: number
  }>
}

export interface DashboardOverview {
  metrics: Metric[]
  activity: ActivityItem[]
  pendingInsights: Insight[]
  systemStatus: SystemStatus
  healthMetrics: DashboardHealthMetrics | null
  warnings: DashboardWarning[]
}

export interface DashboardProjectSummary {
  project: string
  eventCount: number
}

export interface DashboardHealthMetrics {
  timestamp: string
  queue: {
    pending_count: number
    oldest_age_hours: number
    approved_24h: number
    rejected_24h: number
  }
  recall: {
    search_available: boolean
    last_latency_ms: number | null
  }
  storage: {
    postgres: {
      status: string
      latency_ms: number
      total_memories: number
    }
    neo4j: {
      status: string
      latency_ms: number | null
      total_nodes: number | null
    }
  }
  degraded: {
    neo4j_unavailable: number
    scope_error: number
    embedding_failures: number
    promotion_failures_24h: number
  }
  skills?: Array<{
    tool_name: string
    category: string
    calls_24h: number
    success_rate: number
    avg_latency_ms: number
    last_used: string | null
    trend: "up" | "down" | "flat"
  }>
}

export interface MemoryGraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  totalEdges?: number
}

export interface DashboardResult<T> {
  data: T | null
  error: string | null
  degraded: boolean
  warnings: DashboardWarning[]
  source?: string
  fetched_at?: string
}

export type DecisionStatus = "decided" | "proposed" | "superseded" | "deferred" | "unknown"

export interface DecisionRecord {
  id: string
  title: string
  summary: string
  rationale: string
  status: DecisionStatus
  agentId: string
  groupId: string
  createdAt: string
  eventType: string
  metadata: Record<string, unknown>
}

export interface PolicyEnforcementEvent {
  id: string
  eventType: "policy_check" | "policy_violation"
  agentId: string
  ruleName: string
  status: "allowed" | "blocked" | "failed"
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface PolicyEnforcementSummary {
  recentEvents: PolicyEnforcementEvent[]
  violationCountByRule: Record<string, number>
  checkCount: number
  violationCount: number
}
