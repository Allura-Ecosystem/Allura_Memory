/**
 * Brain MCP Client
 *
 * Server-side utility for calling Allura Brain MCP (Streamable HTTP at localhost:5888).
 * Handles session management, SSE parsing, and typed responses.
 *
 * Usage:
 *   import { brainClient } from "@/lib/brain-client"
 *   const health = await brainClient.healthReport("allura-system")
 *   const results = await brainClient.searchMemories("architecture", "allura-system")
 */

import { validateGroupId } from "@/lib/validation/group-id"

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrainHealthSubsystem {
  status: "healthy" | "degraded" | "unhealthy"
  latency_ms: number
  detail?: string
  pending_count?: number
  tool_count?: number
}

export interface BrainHealthReport {
  subsystems: {
    postgres: BrainHealthSubsystem
    neo4j: BrainHealthSubsystem
    embedding_backfill: BrainHealthSubsystem
    curator_queue: BrainHealthSubsystem
    mcp_tools: BrainHealthSubsystem
  }
  overall_status: "healthy" | "degraded" | "unhealthy"
  checked_at: string
  meta: BrainMeta
}

export interface BrainMemory {
  id: string
  content: string
  score: number
  source: "episodic" | "semantic"
  provenance: string
  user_id?: string
  created_at: string
  usage_count: number
  recent_usage_count: number | null
  tags: string[]
}

export interface BrainSearchResult {
  results: BrainMemory[]
  count: number
  latency_ms: number
  meta: BrainMeta
}

export interface BrainListResult {
  memories: BrainMemory[]
  total: number
  has_more: boolean
  meta: BrainMeta
}

export interface BrainMeta {
  contract_version: string
  degraded: boolean
  stores_used: string[]
  stores_attempted: string[]
  warnings: string[]
}

export interface BrainEvent {
  event_id: string
  event_type: string
  agent_id: string | null
  status: string
  metadata: Record<string, unknown>
  created_at: string
  group_id: string
}

export interface BrainEventsResult {
  events: BrainEvent[]
  count: number
  meta: BrainMeta
}

export interface BrainGovernancePolicy {
  policy_id: string
  name: string
  description: string
  enabled: boolean
  rules: Record<string, unknown>[]
}

export interface BrainGovernanceResult {
  policies: BrainGovernancePolicy[]
  count: number
  meta: BrainMeta
}

// ── Client ───────────────────────────────────────────────────────────────────

const BRAIN_URL = process.env.ALLURA_BRAIN_URL ?? "http://localhost:5888/mcp"
const REQUEST_TIMEOUT_MS = 10_000

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number
  method: string
  params: Record<string, unknown>
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0"
  id: number
  result?: { content: Array<{ type: string; text: string }> }
  error?: { code: number; message: string }
}

let _sessionId: string | null = null
let _requestId = 0

function nextId(): number {
  return ++_requestId
}

async function initSession(): Promise<string> {
  if (_sessionId) return _sessionId

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(BRAIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId(),
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "allura-dashboard", version: "1.0" },
        },
      }),
      signal: controller.signal,
    })

    const sid = res.headers.get("mcp-session-id")
    if (sid) _sessionId = sid
    // Consume the body to complete the request
    await res.text()
    return _sessionId ?? ""
  } finally {
    clearTimeout(timeout)
  }
}

async function callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const sessionId = await initSession()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    }
    if (sessionId) headers["mcp-session-id"] = sessionId

    const res = await fetch(BRAIN_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      } satisfies JsonRpcRequest),
      signal: controller.signal,
    })

    const text = await res.text()

    // Handle SSE response — extract the last JSON-RPC result
    if (text.includes("data: ")) {
      const lines = text.split("\n")
      let lastData = ""
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          lastData = line.slice(6)
        }
      }
      if (lastData) {
        const parsed = JSON.parse(lastData) as JsonRpcResponse<T>
        if (parsed.error) {
          throw new Error(`Brain MCP error: ${parsed.error.message}`)
        }
        const content = parsed.result?.content?.[0]
        if (content?.type === "text") {
          return JSON.parse(content.text) as T
        }
      }
    }

    // Handle plain JSON response
    const parsed = JSON.parse(text) as JsonRpcResponse<T>
    if (parsed.error) {
      throw new Error(`Brain MCP error: ${parsed.error.message}`)
    }
    const content = parsed.result?.content?.[0]
    if (content?.type === "text") {
      return JSON.parse(content.text) as T
    }

    throw new Error("Unexpected Brain MCP response format")
  } finally {
    clearTimeout(timeout)
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export const brainClient = {
  /**
   * Get Brain health report for all subsystems.
   */
  async healthReport(groupId: string): Promise<BrainHealthReport> {
    validateGroupId(groupId)
    return callTool<BrainHealthReport>("audit_health_report", { group_id: groupId })
  },

  /**
   * Search memories across PG + Neo4j.
   */
  async searchMemories(
    query: string,
    groupId: string,
    options?: { limit?: number; userId?: string; minScore?: number }
  ): Promise<BrainSearchResult> {
    validateGroupId(groupId)
    return callTool<BrainSearchResult>("memory_search", {
      query,
      group_id: groupId,
      ...(options?.limit != null && { limit: options.limit }),
      ...(options?.userId && { user_id: options.userId }),
      ...(options?.minScore != null && { min_score: options.minScore }),
    })
  },

  /**
   * List memories for a user within a tenant.
   */
  async listMemories(
    groupId: string,
    userId: string,
    options?: { limit?: number; offset?: number; sort?: string }
  ): Promise<BrainListResult> {
    validateGroupId(groupId)
    return callTool<BrainListResult>("memory_list", {
      group_id: groupId,
      user_id: userId,
      ...(options?.limit != null && { limit: options.limit }),
      ...(options?.offset != null && { offset: options.offset }),
      ...(options?.sort && { sort: options.sort }),
    })
  },

  /**
   * Query audit events with optional filters.
   */
  async queryEvents(
    groupId: string,
    options?: { eventType?: string; agentId?: string; limit?: number }
  ): Promise<BrainEventsResult> {
    validateGroupId(groupId)
    return callTool<BrainEventsResult>("audit_query_events", {
      group_id: groupId,
      ...(options?.eventType && { event_type: options.eventType }),
      ...(options?.agentId && { agent_id: options.agentId }),
      ...(options?.limit != null && { limit: options.limit }),
    })
  },

  /**
   * List governance policies.
   */
  async listPolicies(groupId: string): Promise<BrainGovernanceResult> {
    validateGroupId(groupId)
    return callTool<BrainGovernanceResult>("governance_list_policies", {
      group_id: groupId,
    })
  },
} as const
