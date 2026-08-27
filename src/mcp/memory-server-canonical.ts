#!/usr/bin/env node
/**
 * Allura Memory MCP Server - Canonical Interface
 *
 * Exposes the 10 canonical memory operations via MCP:
 * 1. memory_add - Add a memory (episodic → score → promote/queue)
 * 2. memory_search - Search memories (federated: Postgres + Neo4j)
 * 3. memory_get - Get a single memory by ID
 * 4. memory_list - List all memories for a user
 * 5. memory_delete - Soft-delete a memory
 * 6. memory_update - Append-only versioned update
 * 7. memory_promote - Request curator promotion
 * 8. memory_export - Export memories
 * 9. memory_restore - Restore a soft-deleted memory within recovery window
 * 10. memory_list_deleted - List soft-deleted memories within recovery window
 *
 * Reference: docs/allura/BLUEPRINT.md
 *
 * Usage: bun src/mcp/memory-server-canonical.ts
 *    or: bun run mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

import { coordinator } from "@/lib/memory/memory-coordinator"
import { bootstrapMemoryServer } from "./startup"
import { cleanupMemoryState } from "./cleanup"

// ── Story 24.2 — Authenticated Principal Context (stdio/service transport) ───
//
// AC-6: stdio has no HTTP credential to present, so it binds an EXPLICIT
// service identity and tenant allowlist from configuration. Production refuses
// to start without ALLURA_MCP_SERVICE_PRINCIPAL_ID and ALLURA_MCP_SERVICE_TENANTS
// — there is no anonymous default. Outside production this falls back to an
// explicit dev-local principal.
import { randomUUID } from "node:crypto"
import {
  createServicePrincipal,
  resolveServiceAuthConfig,
} from "@/lib/auth/mcp-authenticator"
import { emitAuthAudit } from "@/lib/auth/principal-audit"
import {
  buildAuthAuditEvent,
  guardToolCall,
  PrincipalAuthError,
  type PrincipalContext,
} from "@/lib/auth/principal-context"

/**
 * The service principal for this stdio process. Resolved lazily at first use
 * (and eagerly in main()) so that importing this module for static analysis
 * does not require the environment to be configured.
 */
let servicePrincipal: PrincipalContext | null = null

export function getServicePrincipal(): PrincipalContext {
  if (!servicePrincipal) {
    const config = resolveServiceAuthConfig(process.env as Record<string, string | undefined>)
    servicePrincipal = createServicePrincipal(config, `stdio_${randomUUID()}`)
  }
  return servicePrincipal
}

/**
 * AC-7: audit the authorization decision without ever touching credentials.
 *
 * Persists to the append-only `events` table (metadata JSONB) and always writes
 * a structured line. On stdio the line MUST go to stderr — stdout carries the
 * MCP JSON-RPC framing and any stray write there corrupts the protocol.
 */
const stdioAuditLogger = { log: console.error, error: console.error }

function auditAuthDecision(event: ReturnType<typeof buildAuthAuditEvent>): void {
  void emitAuthAudit(event, { logger: stdioAuditLogger })
}

// Server setup
const server = new Server(
  {
    name: "allura-memory-canonical",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "memory_add",
        description:
          "Add a memory for a user. Writes to PostgreSQL (episodic), scores content, and queues eligible memories for HITL curator review before semantic promotion.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Required: User identifier within tenant",
            },
            content: {
              type: "string",
              description: "Required: Memory content text",
            },
            metadata: {
              type: "object",
              description: "Optional: Metadata (source, conversation_id, agent_id)",
              properties: {
                source: {
                  type: "string",
                  enum: ["conversation", "manual"],
                },
                conversation_id: {
                  type: "string",
                },
                agent_id: {
                  type: "string",
                },
              },
            },
            threshold: {
              type: "number",
              description: "Optional: Override promotion threshold (default: 0.85)",
            },
          },
          required: ["group_id", "user_id", "content"],
        },
      },
      {
        name: "memory_search",
        description:
          "Search memories. Defaults to status='approved', which returns ONLY canonical approved insights from the graph store — unpromoted episodic traces are excluded by design, so an empty result does NOT mean no history exists. Pass status='all' to federate across PostgreSQL episodic + graph.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Required: Search query",
            },
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Optional: User identifier (scope to user)",
            },
            limit: {
              type: "number",
              description: "Optional: Maximum results (default: 10)",
            },
            min_score: {
              type: "number",
              description: "Optional: Minimum confidence filter",
            },
            include_global: {
              type: "boolean",
              description: "Optional: Include global memories (default: true)",
            },
            status: {
              type: "string",
              enum: ["approved", "proposed", "deprecated", "all"],
              description:
                "Optional: Retrieval status filter (default: 'approved'). Use 'all' to include unpromoted episodic traces — required for session hydration.",
            },
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
            id: {
              type: "string",
              description: "Required: Memory identifier",
            },
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
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
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Required: User identifier",
            },
            limit: {
              type: "number",
              description: "Optional: Maximum results (default: 50)",
            },
            offset: {
              type: "number",
              description: "Optional: Pagination offset",
            },
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
            id: {
              type: "string",
              description: "Required: Memory identifier",
            },
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Required: User identifier (for authorization)",
            },
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
            id: {
              type: "string",
              description: "Required: Memory identifier to update",
            },
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Required: User identifier",
            },
            content: {
              type: "string",
              description: "Required: Updated memory content",
            },
            reason: {
              type: "string",
              description: "Optional: Reason for update",
            },
            metadata: {
              type: "object",
              description: "Optional: Additional metadata",
              properties: {
                agent_id: {
                  type: "string",
                },
                conversation_id: {
                  type: "string",
                },
                source: {
                  type: "string",
                  enum: ["conversation", "manual"],
                },
              },
            },
          },
          required: ["id", "group_id", "user_id", "content"],
        },
      },
      {
        name: "memory_promote",
        description:
          "Request curator promotion for an episodic memory. Never auto-promotes — always routes through canonical_proposals for HITL approval. Idempotent: returns existing proposal_id if already queued.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Required: Episodic memory identifier to promote",
            },
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Required: User identifier",
            },
            curator_id: {
              type: "string",
              description: "Optional: Curator identifier for HITL",
            },
            rationale: {
              type: "string",
              description: "Optional: Reason for promotion",
            },
          },
          required: ["id", "group_id", "user_id"],
        },
      },
      {
        name: "memory_export",
        description:
          "Export memories filtered by group_id and optional canonical status. canonical_only=true returns only Neo4j (semantic) memories; canonical_only=false returns both stores merged and deduplicated.",
        inputSchema: {
          type: "object",
          properties: {
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Optional: User identifier filter",
            },
            canonical_only: {
              type: "boolean",
              description: "Optional: Export only canonical (Neo4j) memories (default: false)",
            },
            limit: {
              type: "number",
              description: "Optional: Maximum memories to export (default: 1000, max: 10000)",
            },
            offset: {
              type: "number",
              description: "Optional: Pagination offset",
            },
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
            id: {
              type: "string",
              description: "Required: Memory identifier to restore",
            },
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Required: User identifier (for audit trail)",
            },
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
            group_id: {
              type: "string",
              description: "Required: Tenant namespace (format: allura-*)",
            },
            user_id: {
              type: "string",
              description: "Optional: User identifier (scope to user)",
            },
            limit: {
              type: "number",
              description: "Optional: Maximum results (default: 50)",
            },
            offset: {
              type: "number",
              description: "Optional: Pagination offset",
            },
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
            group_id: {
              type: "string",
              description: "Optional: Tenant namespace (format: allura-*)",
            },
          },
        },
      },
    ],
  }
})

// Tool execution — routed through MemoryCoordinator (F-001)
// The coordinator validates group_id, wraps responses in the standard
// envelope (F-002), and logs policy decisions. canonical-tools remains
// the data layer — the coordinator is a thin policy layer above it.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params

  // Story 24.2: same chokepoint as the HTTP gateway. group_id / user_id /
  // curator_id / role in the arguments are resource selectors, never authority.
  let args: Record<string, unknown>
  let principal: PrincipalContext | null = null
  try {
    principal = getServicePrincipal()
    const guarded = guardToolCall(principal, name, request.params.arguments)
    args = guarded.args
    auditAuthDecision(
      buildAuthAuditEvent({
        principal,
        tool: name,
        decision: "allow",
        effectiveTenant: guarded.effectiveTenant,
      })
    )
  } catch (error) {
    const err =
      error instanceof PrincipalAuthError
        ? error
        : new PrincipalAuthError("PRINCIPAL_MISSING", "Authorization failed")
    auditAuthDecision(
      buildAuthAuditEvent({ principal, tool: name, decision: "deny", reasonCode: err.reasonCode })
    )
    return {
      content: [{ type: "text", text: JSON.stringify(err.toErrorPayload(), null, 2) }],
      isError: true,
    }
  }

  try {
    let envelope: { data: unknown; meta: unknown; error: { code: number; message: string; details?: unknown } | null }

    switch (name) {
      case "memory_add":
        envelope = await coordinator.memory_add(args as any)
        break
      case "memory_search":
        envelope = await coordinator.memory_search(args as any)
        break
      case "memory_get":
        envelope = await coordinator.memory_get(args as any)
        break
      case "memory_list":
        envelope = await coordinator.memory_list(args as any)
        break
      case "memory_delete":
        envelope = await coordinator.memory_delete(args as any)
        break
      case "memory_update":
        envelope = await coordinator.memory_update(args as any)
        break
      case "memory_promote":
        envelope = await coordinator.memory_promote(args as any)
        break
      case "memory_export":
        envelope = await coordinator.memory_export(args as any)
        break
      case "memory_restore":
        envelope = await coordinator.memory_restore(args as any)
        break
      case "memory_list_deleted":
        envelope = await coordinator.memory_list_deleted(args as any)
        break
      case "memory_cleanup":
        envelope = {
          data: cleanupMemoryState((args as any)?.group_id),
          meta: { contract_version: "v1", degraded: false, stores_used: [], stores_attempted: [], warnings: [] },
          error: null,
        }
        break
      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
            },
          ],
          isError: true,
        }
    }

    // The envelope already contains { data, meta, error } — serialize directly.
    // isError flag is set when the envelope carries an error payload.
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(envelope, null, 2),
        },
      ],
      isError: envelope.error !== null,
    }
  } catch (error) {
    // Catch-all for truly unexpected errors (coordinator itself should never throw,
    // but we keep this as a safety net).
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    }
  }
})

// Start server
async function main() {
  // AC-6: bind the service principal BEFORE any transport is connected. In
  // production this throws if no explicit service identity/tenant allowlist is
  // configured, so the process refuses to serve anonymously.
  const principal = getServicePrincipal()
  const transport = new StdioServerTransport()
  await bootstrapMemoryServer()
  await server.connect(transport)
  console.error(
    `Allura Memory MCP Server (Canonical) running on stdio as principal '${principal.principalId}' ` +
      `(auth_method=${principal.authMethod}, tenants=${principal.tenantIds.join(",")}, roles=${principal.roles.join(",")})`
  )
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
