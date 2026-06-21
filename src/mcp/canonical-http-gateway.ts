/**
 * Canonical HTTP Gateway for Allura Memory MCP
 *
 * Exposes the canonical 5-operation memory interface via MCP Streamable HTTP:
 * - Primary transport: /mcp endpoint (native MCP protocol via MCP SDK)
 *
 * This is the single integration path for all MCP-compatible clients:
 * - OpenAI Agents SDK (`hostedMcpTool()` / `MCPServerStreamableHttp`)
 * - Any MCP client speaking the Streamable HTTP protocol
 *
 * No REST bridge. No OpenAPI schema. The MCP protocol handles discovery.
 *
 * Usage: bun run src/mcp/canonical-http-gateway.ts
 * Env:   ALLURA_MCP_HTTP_PORT  (default: 3201)
 *        ALLURA_MCP_AUTH_TOKEN  (optional Bearer token for /mcp endpoint)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import { randomUUID } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { parse } from "url";
import { applyCors, corsHeaders, getCorsConfig, isPreflightRequest } from "@/lib/cors/index.js";
import { collectMetrics, ensureMetricsInitialized, recordHttpRequest } from "@/lib/health/metrics";
import { checkReadiness, markMcpInitialized } from "@/lib/health/probes";
import { applyRateLimit, getRateLimitConfig } from "@/lib/health/rate-limiter";
import { captureException, extractRequestContext, initSentry, startTransaction } from "@/lib/observability/index.js";
import { getHaltedSessions, resetHaltedGroup } from "@/mcp/canonical-tools/budget-circuit";

// MCP SDK imports for Streamable HTTP transport

config();

// ── Port Resolution ─────────────────────────────────────────────────────────

function resolveHttpPort(): { port: number; source: string; warnings: string[] } {
  const warnings: string[] = [];

  if (process.env.ALLURA_MCP_HTTP_PORT) {
    return {
      port: parseInt(process.env.ALLURA_MCP_HTTP_PORT, 10),
      source: "ALLURA_MCP_HTTP_PORT",
      warnings,
    };
  }

  if (process.env.CANONICAL_HTTP_PORT) {
    warnings.push("CANONICAL_HTTP_PORT is deprecated; use ALLURA_MCP_HTTP_PORT");
    return {
      port: parseInt(process.env.CANONICAL_HTTP_PORT, 10),
      source: "CANONICAL_HTTP_PORT",
      warnings,
    };
  }

  if (process.env.OPENCLAW_PORT) {
    warnings.push("OPENCLAW_PORT is deprecated for canonical MCP HTTP; use ALLURA_MCP_HTTP_PORT");
    return {
      port: parseInt(process.env.OPENCLAW_PORT, 10),
      source: "OPENCLAW_PORT",
      warnings,
    };
  }

  if (process.env.PORT) {
    warnings.push("PORT is deprecated for canonical MCP HTTP; use ALLURA_MCP_HTTP_PORT");
    return {
      port: parseInt(process.env.PORT, 10),
      source: "PORT",
      warnings,
    };
  }

  return { port: 3201, source: "default", warnings };
}

const HTTP_PORT = resolveHttpPort();
const PORT = HTTP_PORT.port;

// ── Auth Configuration ───────────────────────────────────────────────────────

const AUTH_TOKEN = process.env.ALLURA_MCP_AUTH_TOKEN || "";

/**
 * Validate Bearer token at the transport layer.
 * If ALLURA_MCP_AUTH_TOKEN is not set, auth is disabled (dev mode).
 * Uses timing-safe comparison to prevent timing attacks.
 */
function validateBearerAuth(req: IncomingMessage): boolean {
  // If no token configured, auth is disabled (development mode)
  if (!AUTH_TOKEN) return true;

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  // Timing-safe comparison
  const expected = Buffer.from(AUTH_TOKEN, "utf-8");
  const provided = Buffer.from(token, "utf-8");
  if (expected.length !== provided.length) return false;
  return expected.equals(provided);
}

// ── Canonical Tool Imports ───────────────────────────────────────────────────

import {
  memory_add,
  memory_delete,
  memory_export,
  memory_get,
  memory_list,
  memory_list_deleted,
  memory_promote,
  memory_restore,
  memory_search,
  memory_update,
} from "./canonical-tools.js";

// Runtime state janitor (clears halted budget sessions). Not a canonical
// memory write — no contract type; operates on in-process circuit state.
import { cleanupMemoryState } from "./cleanup.js";

import {
  governance_list_policies,
  governance_get_policy,
  governance_check_gate,
  governance_apply_policy_override,
  governance_audit_log,
} from "./governance-tools.js";

import {
  audit_query_events,
  audit_health_report,
  audit_agent_activity,
  audit_invariant_check,
} from "./audit-tools.js";

import type {
  MemoryAddRequest,
  MemoryDeleteRequest,
  MemoryExportRequest,
  MemoryGetRequest,
  MemoryListDeletedRequest,
  MemoryListRequest,
  MemoryPromoteRequest,
  MemoryRestoreRequest,
  MemorySearchRequest,
  MemoryUpdateRequest,
  GovernanceListPoliciesRequest,
  GovernanceGetPolicyRequest,
  GovernanceCheckGateRequest,
  GovernanceUpdatePolicyRequest,
  GovernanceAuditLogRequest,
  AuditQueryEventsRequest,
  AuditHealthReportRequest,
  AuditAgentActivityRequest,
  AuditInvariantCheckRequest,
} from "@/lib/memory/canonical-contracts.js";

// ── MCP Server Setup (Streamable HTTP) ───────────────────────────────────────

function createMcpServer(): Server {
  const mcpServer = new Server(
    {
      name: "allura-memory-canonical",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

// ── MCP Tool Handlers (Streamable HTTP) ──────────────────────────────────────

// List tools handler
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "memory_add",
        description:
          "Add a memory for a user. Writes to PostgreSQL (episodic), scores content, and queues eligible memories for HITL curator review before semantic promotion.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Required: User identifier within tenant" },
            content: { type: "string", description: "Required: Memory content text" },
            metadata: {
              type: "object",
              description: "Optional: Metadata (source, conversation_id, agent_id)",
              properties: {
                source: { type: "string", enum: ["conversation", "manual"] },
                conversation_id: { type: "string" },
                agent_id: { type: "string" },
              },
            },
            threshold: { type: "number", description: "Optional: Override promotion threshold (default: 0.85)" },
          },
          required: ["group_id", "user_id", "content"],
        },
      },
      {
        name: "memory_search",
        description:
          "Search memories across both stores (PostgreSQL + Neo4j). Federated search with results merged by relevance.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Required: Search query" },
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Optional: User identifier (scope to user)" },
            limit: { type: "number", description: "Optional: Maximum results (default: 10)" },
            min_score: { type: "number", description: "Optional: Minimum confidence filter" },
            include_global: { type: "boolean", description: "Optional: Include global memories (default: true)" },
          },
          required: ["query", "group_id"],
        },
      },
      {
        name: "memory_get",
        description: "Retrieve a single memory by ID. Returns from either store (episodic or semantic).",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Required: Memory identifier" },
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
          },
          required: ["id", "group_id"],
        },
      },
      {
        name: "memory_list",
        description: "List all memories for a user within a tenant. Returns from both stores, merged and sorted.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Required: User identifier" },
            limit: { type: "number", description: "Optional: Maximum results (default: 50)" },
            offset: { type: "number", description: "Optional: Pagination offset" },
            sort: {
              type: "string",
              enum: ["created_at_desc", "created_at_asc", "score_desc", "score_asc"],
              description: "Optional: Sort order (default: created_at_desc)",
            },
          },
          required: ["group_id", "user_id"],
        },
      },
      {
        name: "memory_delete",
        description: "Soft-delete a memory. Appends deletion event to PostgreSQL and marks Neo4j node as deprecated.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Required: Memory identifier" },
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Required: User identifier (for authorization)" },
          },
          required: ["id", "group_id", "user_id"],
        },
      },
      {
        name: "memory_promote",
        description:
          "Request curator promotion for an episodic memory. Never auto-promotes — always routes through canonical_proposals for HITL approval. Idempotent: returns existing proposal_id if already queued.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Required: Episodic memory identifier to promote" },
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Required: User identifier" },
            curator_id: { type: "string", description: "Optional: Curator identifier for HITL" },
            rationale: { type: "string", description: "Optional: Reason for promotion" },
          },
          required: ["id", "group_id", "user_id"],
        },
      },
      {
        name: "memory_update",
        description:
          "Append-only versioned update. Creates new version in Neo4j with SUPERSEDES relationship, marks old version deprecated. Audit event always written to PostgreSQL.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Required: Memory identifier to update" },
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Required: User identifier" },
            content: { type: "string", description: "Required: Updated memory content" },
            reason: { type: "string", description: "Optional: Reason for update" },
            metadata: {
              type: "object",
              description: "Optional: Additional metadata",
              properties: {
                agent_id: { type: "string" },
                conversation_id: { type: "string" },
                source: { type: "string", enum: ["conversation", "manual"] },
              },
            },
          },
          required: ["id", "group_id", "user_id", "content"],
        },
      },
      {
        name: "memory_export",
        description:
          "Export memories filtered by group_id and optional canonical status. canonical_only=true returns only Neo4j (semantic) memories; canonical_only=false returns both stores merged and deduplicated.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Optional: User identifier filter" },
            canonical_only: { type: "boolean", description: "Optional: Export only canonical (Neo4j) memories (default: false)" },
            limit: { type: "number", description: "Optional: Maximum memories to export (default: 1000, max: 10000)" },
            offset: { type: "number", description: "Optional: Pagination offset" },
          },
          required: ["group_id"],
        },
      },
      {
        name: "memory_restore",
        description:
          "Restore a soft-deleted memory within the 30-day recovery window. Removes deprecated flag in Neo4j and cleans up SUPERSEDES relationships. Appends restore event to PostgreSQL (append-only).",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Required: Memory identifier to restore" },
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Required: User identifier (for audit trail)" },
          },
          required: ["id", "group_id", "user_id"],
        },
      },
      {
        name: "memory_list_deleted",
        description:
          "List soft-deleted memories within the 30-day recovery window. Returns deleted memories with their pre-deletion content and recovery_days_remaining.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            user_id: { type: "string", description: "Optional: User identifier (scope to user)" },
            limit: { type: "number", description: "Optional: Maximum results (default: 50)" },
            offset: { type: "number", description: "Optional: Pagination offset" },
          },
          required: ["group_id"],
        },
      },
      {
        name: "memory_cleanup",
        description:
          "Reset halted budget sessions for a group (or all groups if omitted). Useful for clearing stale boot state without touching stored memories.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Optional: Tenant namespace to clear (format: allura-*); omit to clear all groups" },
          },
          required: [],
        },
      },
      // ── Governance Tools (Story 9.1) ──────────────────────────────────────
      {
        name: "governance_list_policies",
        description:
          "List all 6 canonical Allura invariant policies. Returns the static policy registry merged with any " +
          "HITL-approved overrides from the audit log. Read-only — no DB writes.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
          },
          required: ["group_id"],
        },
      },
      {
        name: "governance_get_policy",
        description:
          "Retrieve a single governance policy by ID (pol-001 through pol-006). " +
          "Returns the canonical policy merged with any approved HITL overrides.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            policy_id: {
              type: "string",
              description: "Required: Policy identifier (e.g., pol-001, pol-002, ... pol-006)",
            },
          },
          required: ["group_id", "policy_id"],
        },
      },
      {
        name: "governance_check_gate",
        description:
          "Evaluate all 6 Allura invariants for a proposed action. Returns pass/fail per invariant with reasons. " +
          "Appends a governance_gate_checked event to the audit log.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            action: {
              type: "string",
              description: "Required: Action being requested (e.g., 'memory_promote', 'policy_update')",
            },
            context: {
              type: "object",
              description:
                "Optional: Additional context for evaluation (e.g., { agent_id, bypass_hitl, via_docker_exec })",
            },
          },
          required: ["group_id", "action"],
        },
      },
      {
        name: "governance_update_policy",
        description:
          "HITL-gated policy override. Requires an explicit approval_ref pointing to an approved, unconsumed " +
          "canonical_proposals entry. Appends governance_policy_updated and governance_approval_consumed events. " +
          "Rejects the call if no valid approval is found or the approval was already consumed.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            policy_id: { type: "string", description: "Required: Policy identifier to override (e.g., pol-005)" },
            approval_ref: {
              type: "string",
              description: "Required: UUID of an approved canonical_proposals entry authorizing this change",
            },
            description: { type: "string", description: "Required: New description override for the policy" },
            updated_by: { type: "string", description: "Required: Identifier of the human/curator making this change" },
            rationale: { type: "string", description: "Optional: Rationale for the policy override" },
          },
          required: ["group_id", "policy_id", "approval_ref", "description", "updated_by"],
        },
      },
      {
        name: "governance_audit_log",
        description:
          "Paginated read of governance audit events (governance_policy_updated, governance_gate_checked, " +
          "governance_approval_consumed, proposal_created/approved/rejected, memory_promote_requested). " +
          "Read-only — no DB writes.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            event_type: {
              type: "string",
              description:
                "Optional: Filter by event type (governance_policy_updated | governance_gate_checked | " +
                "governance_approval_consumed | proposal_created | proposal_approved | proposal_rejected | " +
                "memory_promote_requested)",
            },
            limit: { type: "number", description: "Optional: Maximum results (default: 50, max: 500)" },
            offset: { type: "number", description: "Optional: Pagination offset (default: 0)" },
          },
          required: ["group_id"],
        },
      },
      // ── Audit Tools (Story 9.2) ───────────────────────────────────────────
      {
        name: "audit_query_events",
        description:
          "Query the Allura Brain events table with optional filters and pagination. " +
          "Supports filtering by agent_id, event_type, date_range, and metadata source. " +
          "Returns events ordered by created_at DESC. Read-only — no DB writes.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            agent_id: { type: "string", description: "Optional: Filter by agent_id" },
            event_type: { type: "string", description: "Optional: Filter by event_type" },
            date_range: {
              type: "object",
              description: "Optional: Date range filter (ISO 8601 strings)",
              properties: {
                from: { type: "string", description: "Optional: Start date (ISO 8601)" },
                to: { type: "string", description: "Optional: End date (ISO 8601)" },
              },
            },
            source: { type: "string", description: "Optional: Filter by metadata source field" },
            limit: { type: "number", description: "Optional: Maximum results (default: 50, max: 200)" },
            offset: { type: "number", description: "Optional: Pagination offset (default: 0)" },
          },
          required: ["group_id"],
        },
      },
      {
        name: "audit_health_report",
        description:
          "Check all Allura Brain subsystem health statuses and return a structured per-subsystem report. " +
          "Checks: PostgreSQL, Neo4j, embedding backfill, curator queue depth, and MCP tool availability. " +
          "Read-only — no DB writes.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
          },
          required: ["group_id"],
        },
      },
      {
        name: "audit_agent_activity",
        description:
          "Query event activity for a specific agent, with optional time range filtering and pagination. " +
          "Returns all events attributed to the given agent_id, ordered by created_at DESC. " +
          "Read-only — no DB writes.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
            agent_id: { type: "string", description: "Required: Agent identifier to query" },
            time_range: {
              type: "object",
              description: "Optional: Time range filter",
              properties: {
                from: { type: "string", description: "Optional: Start time (ISO 8601)" },
                to: { type: "string", description: "Optional: End time (ISO 8601)" },
              },
            },
            limit: { type: "number", description: "Optional: Maximum results (default: 50, max: 200)" },
            offset: { type: "number", description: "Optional: Pagination offset (default: 0)" },
          },
          required: ["group_id", "agent_id"],
        },
      },
      {
        name: "audit_invariant_check",
        description:
          "Validate all 6 Allura governance invariants against live data and report per-check pass/fail " +
          "with violation counts. Checks: group_id constraint, no invalid group_ids, append-only structure, " +
          "Neo4j SUPERSEDES, HITL promotion compliance, and allura-* namespace. Read-only — no DB writes.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: { type: "string", description: "Required: Tenant namespace (format: allura-*)" },
          },
          required: ["group_id"],
        },
      },
    ],
  };
});

// Tool execution handler
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;
    switch (name) {
      case "memory_add":
        result = await memory_add(args as unknown as MemoryAddRequest);
        break;
      case "memory_search":
        result = await memory_search(args as unknown as MemorySearchRequest);
        break;
      case "memory_get":
        result = await memory_get(args as unknown as MemoryGetRequest);
        break;
      case "memory_list":
        result = await memory_list(args as unknown as MemoryListRequest);
        break;
      case "memory_delete":
        result = await memory_delete(args as unknown as MemoryDeleteRequest);
        break;
      case "memory_promote":
        result = await memory_promote(args as unknown as MemoryPromoteRequest);
        break;
      case "memory_update":
        result = await memory_update(args as unknown as MemoryUpdateRequest);
        break;
      case "memory_export":
        result = await memory_export(args as unknown as MemoryExportRequest);
        break;
      case "memory_restore":
        result = await memory_restore(args as unknown as MemoryRestoreRequest);
        break;
      case "memory_list_deleted":
        result = await memory_list_deleted(args as unknown as MemoryListDeletedRequest);
        break;
      case "memory_cleanup":
        result = {
          data: cleanupMemoryState((args as { group_id?: string } | undefined)?.group_id),
          meta: { contract_version: "v1", degraded: false, stores_used: [], stores_attempted: [], warnings: [] },
          error: null,
        };
        break;
      // ── Governance Tools (Story 9.1) ────────────────────────────────────
      case "governance_list_policies":
        result = await governance_list_policies(args as unknown as GovernanceListPoliciesRequest);
        break;
      case "governance_get_policy":
        result = await governance_get_policy(args as unknown as GovernanceGetPolicyRequest);
        break;
      case "governance_check_gate":
        result = await governance_check_gate(args as unknown as GovernanceCheckGateRequest);
        break;
      case "governance_update_policy":
        result = await governance_apply_policy_override(args as unknown as GovernanceUpdatePolicyRequest);
        break;
      case "governance_audit_log":
        result = await governance_audit_log(args as unknown as GovernanceAuditLogRequest);
        break;
      // ── Audit Tools (Story 9.2) ────────────────────────────────────────
      case "audit_query_events":
        result = await audit_query_events(args as unknown as AuditQueryEventsRequest);
        break;
      case "audit_health_report":
        result = await audit_health_report(args as unknown as AuditHealthReportRequest);
        break;
      case "audit_agent_activity":
        result = await audit_agent_activity(args as unknown as AuditAgentActivityRequest);
        break;
      case "audit_invariant_check":
        result = await audit_invariant_check(args as unknown as AuditInvariantCheckRequest);
        break;
      default:
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
      isError: true,
    };
  }
});

  return mcpServer;
}

const mcpTransports = new Map<string, StreamableHTTPServerTransport>();

async function createMcpTransport(): Promise<StreamableHTTPServerTransport> {
  let initializedSessionId: string | undefined;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      initializedSessionId = sessionId;
      mcpTransports.set(sessionId, transport);
    },
  });

  transport.onclose = () => {
    if (initializedSessionId) {
      mcpTransports.delete(initializedSessionId);
    }
  };

  await createMcpServer().connect(transport);
  return transport;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

// ── Initialize Observability ──────────────────────────────────────────────────

initSentry();

// ── Initialize Health Probes and Metrics ─────────────────────────────────────

markMcpInitialized();
ensureMetricsInitialized();

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = parse(req.url || "/", true);

  // ── Apply CORS middleware ──────────────────────────────────────────────────
  // Handles preflight (OPTIONS) requests and sets CORS headers on all responses.
  // In development mode (no ALLURA_CORS_ORIGINS), allows all origins.
  // In production mode, validates against the configured allowlist.
  const corsResult = applyCors(req, res);
  if (corsResult.isPreflight) {
    // Preflight was handled by CORS middleware (204 or 403)
    return;
  }

  // ── Apply Rate Limiting ───────────────────────────────────────────────────
  // Start a Sentry performance transaction for all requests
  const transaction = startTransaction({
    name: `${req.method ?? "GET"} ${url.pathname ?? "/"}`,
    op: "http.server",
  });

  // Sliding-window per-IP rate limit. Default: 100 req/min.
  // Configurable via ALLURA_RATE_LIMIT_MAX, ALLURA_RATE_LIMIT_WINDOW_MS, ALLURA_RATE_LIMIT_ENABLED.
  if (!applyRateLimit(req, res)) {
    // 429 response already sent by rate limiter
    transaction.finish();
    return;
  }

  // Record request start time for metrics
  const requestStartTime = Date.now();

  // ── MCP Streamable HTTP endpoint ──────────────────────────────────────────
  // Route: POST /mcp, GET /mcp, DELETE /mcp
  // This is the primary integration path for OpenAI Agents SDK and any
  // MCP-compatible client using the Streamable HTTP transport.
  if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
    // Bearer token auth at the transport layer
    if (!validateBearerAuth(req)) {
      res.writeHead(401, {
        ...corsHeaders(req.headers["origin"]),
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="Allura Memory MCP"',
      });
      res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing Bearer token" }));
      transaction.finish();
      return;
    }

    try {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
      let transport: StreamableHTTPServerTransport | undefined;
      let parsedBody: unknown;

      if (sessionId) {
        transport = mcpTransports.get(sessionId);
        if (!transport) {
          res.writeHead(404, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "MCP session not found" }));
          transaction.finish();
          return;
        }
      } else if (req.method === "POST") {
        parsedBody = await readJsonBody(req);
        if (!isInitializeRequest(parsedBody)) {
          res.writeHead(400, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "MCP session required" }));
          transaction.finish();
          return;
        }
        transport = await createMcpTransport();
      } else {
        res.writeHead(400, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "MCP session required" }));
        transaction.finish();
        return;
      }

      // Delegate to the MCP Streamable HTTP transport. The transport handles
      // JSON-RPC parsing, session management, and SSE streaming per the spec.
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      console.error("[mcp-streamable-http] Error handling request:", error);
      captureException(error, extractRequestContext(req));
      if (!res.headersSent) {
        res.writeHead(500, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    transaction.finish();
    return;
  }

  // ── Admin: Budget reset endpoint ───────────────────────────────────────
  // POST /api/admin/reset-budget  { group_id?: string }
  // Resets halted sessions for a group (or all if no group_id)
  if (url.pathname === "/api/admin/reset-budget" && req.method === "POST") {
    if (!validateBearerAuth(req)) {
      res.writeHead(401, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      transaction.finish();
      return;
    }

    try {
      let body: { group_id?: string } = {};
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      if (chunks.length > 0) {
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
      }

      const before = getHaltedSessions();
      const count = resetHaltedGroup(body.group_id);
      const after = getHaltedSessions();

      console.log(`[admin] Budget reset: group_id=${body.group_id || "ALL"}, cleared=${count}, before=${before.length}, after=${after.length}`);

      res.writeHead(200, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        group_id: body.group_id || null,
        sessions_cleared: count,
        halted_before: before,
        halted_after: after,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.error("[admin] Budget reset failed:", error);
      res.writeHead(500, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Budget reset failed", details: String(error) }));
    }
    transaction.finish();
    return;
  }

  // ── Admin: Budget status endpoint ──────────────────────────────────────
  // GET /api/admin/budget-status
  if (url.pathname === "/api/admin/budget-status" && req.method === "GET") {
    if (!validateBearerAuth(req)) {
      res.writeHead(401, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      transaction.finish();
      return;
    }

    const halted = getHaltedSessions();
    res.writeHead(200, { ...corsHeaders(req.headers["origin"]), "Content-Type": "application/json" });
      res.end(JSON.stringify({
        halted_sessions: halted,
        count: halted.length,
        timestamp: new Date().toISOString(),
      }));
    transaction.finish();
    return;
  }

  // ── Health endpoint (advertising only streamable-http transport) ───────────
  const requestOrigin = req.headers["origin"];
  if (url.pathname === "/health" || url.pathname === "/api/health") {
    // Health check
    res.writeHead(200, { ...corsHeaders(requestOrigin), "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        mode: "http",
        interface: "mcp-http",
        transports: ["streamable-http"],
        mcp_endpoint: "/mcp",
        port: PORT,
        port_source: HTTP_PORT.source,
        auth_enabled: !!AUTH_TOKEN,
        cors_mode: getCorsConfig().isDevelopment ? "development" : "production",
        rate_limit: getRateLimitConfig(),
        warnings: HTTP_PORT.warnings,
        timestamp: new Date().toISOString(),
      })
    );
    transaction.finish();
    return;
  }

  // ── Readiness probe — checks PostgreSQL, Neo4j, MCP initialization ────────
  if (url.pathname === "/ready" || url.pathname === "/api/ready") {
    const result = await checkReadiness();
    const statusCode = result.ready ? 200 : 503;
    res.writeHead(statusCode, { ...corsHeaders(requestOrigin), "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    transaction.finish();
    return;
  }

  // ── Liveness probe — simple process heartbeat ─────────────────────────────
  if (url.pathname === "/live" || url.pathname === "/api/live") {
    const uptime = process.uptime();
    res.writeHead(200, { ...corsHeaders(requestOrigin), "Content-Type": "application/json" });
    res.end(JSON.stringify({ alive: true, uptime, timestamp: new Date().toISOString() }));
    transaction.finish();
    return;
  }

  // ── Prometheus metrics — requires auth (same as MCP endpoint) ─────────────
  if (url.pathname === "/metrics" || url.pathname === "/api/metrics") {
    if (!validateBearerAuth(req)) {
      res.writeHead(401, {
        ...corsHeaders(req.headers["origin"]),
        "Content-Type": "text/plain",
        "WWW-Authenticate": 'Bearer realm="Allura Memory Metrics"',
      });
      res.end("Unauthorized\n");
      transaction.finish();
      return;
    }
    const metricsText = collectMetrics();
    res.writeHead(200, {
      ...corsHeaders(req.headers["origin"]),
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.end(metricsText);
    transaction.finish();
    return;
  }

  // ── 404 for unknown routes ────────────────────────────────────────────────
  res.writeHead(404, { ...corsHeaders(requestOrigin), "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
  transaction.finish();
});

server.listen(PORT, () => {
  console.log(`Allura Memory Canonical HTTP Gateway listening on port ${PORT}`);
  console.log(`Port source: ${HTTP_PORT.source}`);
  for (const warning of HTTP_PORT.warnings) {
    console.warn(`[deprecated-port-contract] ${warning}`);
  }
  console.log("");
  console.log("Transports:");
  console.log("  MCP Streamable HTTP:  POST/GET/DELETE /mcp  (primary — OpenAI Agents SDK compatible)");
  console.log("  Health:                GET /health");
  console.log("  Readiness:            GET /ready  (checks PostgreSQL, Neo4j, MCP)");
  console.log("  Liveness:             GET /live   (process heartbeat)");
  console.log("  Metrics:              GET /metrics (Prometheus format, auth required)");
  console.log("  Admin Reset Budget:   POST /api/admin/reset-budget (auth required, body: {group_id?})");
  console.log("  Admin Budget Status:  GET /api/admin/budget-status (auth required)");
  console.log("");
  console.log(`Auth: ${AUTH_TOKEN ? "Bearer token required" : "No auth token set (development mode)"}`);
  console.log("");
  console.log("Available tools: memory_add, memory_search, memory_get, memory_list, memory_delete,");
  console.log("                 governance_list_policies, governance_get_policy, governance_check_gate,");
  console.log("                 governance_apply_policy_override, governance_audit_log,");
  console.log("                 audit_query_events, audit_health_report, audit_agent_activity, audit_invariant_check");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  server.close(() => {
    Promise.all([...mcpTransports.values()].map((transport) => transport.close())).then(() => {
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("Interrupted, shutting down...");
  server.close(() => {
    Promise.all([...mcpTransports.values()].map((transport) => transport.close())).then(() => {
      process.exit(0);
    });
  });
});
