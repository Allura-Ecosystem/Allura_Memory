/**
 * Knowledge Promotion Infrastructure
 * 
 * Wires Notion Approval Queue → Neo4j Knowledge Graph → Notion Knowledge Hub
 * Implements HITL (Human-in-the-Loop) governance for knowledge promotion.
 * 
 * Flow:
 *   Agent → PostgreSQL (trace) → Notion (Approval Queue)
 *   Human → Notion (Approve) → Neo4j (Knowledge) → Notion (Knowledge Hub)
 * 
 * Steel Frame Versioning: All Neo4j insights use SUPERSEDES relationships
 * Tenant Isolation: All nodes carry group_id = 'allura-system'
 * 
 * ## Knowledge Hub Bridge (Flow 2)
 * 
 * After a proposal is approved and promoted to Neo4j, it should also be
 * synced to the Notion Knowledge Hub database with full trace IDs
 * (PG event ID + Neo4j insight ID).
 * 
 * Knowledge Hub DB: 083f40a9210445eaae513557bb1ae1ca
 * Knowledge Hub Data Source: 9efeb76c-809b-440e-a76d-6a6e17bc8e7f
 * Curator Proposals Data Source: 42894678-aedb-4c90-9371-6494a9fe5270
 */

import { z } from 'zod';
import { requireApprovalBeforePromotion } from './approval-audit';
import { withWorkspaceTransaction } from '../db/tenant-transaction';
import { type EventRecord, insertEvent } from '../postgres/queries/insert-trace';

// ── Error class (replaces deleted neo4j-errors) ─────────────────────────────

/**
 * Error thrown when promoting an insight to the knowledge graph fails.
 */
export class KnowledgePromotionError extends Error {
  constructor(
    public readonly insightId: string,
    public readonly cause: Error
  ) {
    super(`Failed to promote insight ${insightId}: ${cause.message}`);
    this.name = 'KnowledgePromotionError';
  }
}

/** @deprecated Alias for backward compatibility */
export const Neo4jPromotionError = KnowledgePromotionError;

// ============================================================================
// Constants
// ============================================================================

/** Knowledge Hub database ID in Notion */
export const KNOWLEDGE_HUB_DB_ID = '083f40a9210445eaae513557bb1ae1ca';

/** Knowledge Hub data source ID in Notion */
export const KNOWLEDGE_HUB_DATA_SOURCE_ID = '9efeb76c-809b-440e-a76d-6a6e17bc8e7f';

/** Curator Proposals data source ID in Notion */
export const CURATOR_PROPOSALS_DATA_SOURCE_ID = '42894678-aedb-4c90-9371-6494a9fe5270';

/** Tier to Knowledge Hub Category mapping */
const TIER_TO_CATEGORY: Record<string, KnowledgeInsight['category']> = {
  emerging: 'Research',
  adoption: 'Pattern',
  mainstream: 'Decision',
};

/** Tier to Knowledge Hub Source mapping */
const TIER_TO_SOURCE: Record<string, string> = {
  emerging: 'memory-scout',
  adoption: 'memory-architect',
  mainstream: 'memory-orchestrator',
};

// ============================================================================
// Types
// ============================================================================

/**
 * Knowledge insight from Neo4j
 */
export interface KnowledgeInsight {
  /** Canonical proposal identifier whose approval audit event gates promotion */
  proposal_id: string;
  /** Stable identifier across versions */
  id: string;
  /** Topic or title of the insight */
  topic: string;
  /** Category for organization */
  category: 'Architecture' | 'Pattern' | 'Decision' | 'Research' | 'Bugfix' | 'Performance';
  /** The insight content (knowledge text) */
  content: string;
  /** Source agent or human */
  source: string;
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** Tenant isolation identifier */
  group_id: string;
  /** Server-derived workspace isolation identifier */
  workspace_id: string;
  /** Notion page ID in Approval Queue */
  notion_page_id: string;
  /** PostgreSQL trace event ID */
  postgres_trace_id: string;
  /** Optional: Neo4j node ID after promotion */
  neo4j_id?: string;
  /** Optional: Version number */
  version?: number;
  /** Optional: Previous version to supersede */
  supersedes_id?: string;
}

/**
 * Approval queue item from Notion
 * 
 * Status states:
 *   - Pending: Awaiting human review
 *   - Approved: Human approved, ready for Neo4j promotion
 *   - Rejected: Human rejected, not promoted
 */
export interface ApprovalQueueItem {
  /** Canonical proposal identifier from canonical_proposals */
  proposal_id: string;
  /** Notion page ID */
  notion_page_id: string;
  /** Topic or title */
  topic: string;
  /** Content/summary */
  content: string;
  /** Source agent or human */
  source: string;
  /** Current status */
  status: 'Pending' | 'Approved' | 'Rejected';
  /** Confidence score */
  confidence: number;
  /** Tenant group */
  group_id: string;
  /** Server-derived workspace scope */
  workspace_id: string;
  /** PostgreSQL trace ID */
  postgres_trace_id: string;
  /** Category */
  category: KnowledgeInsight['category'];
  /** Optional: Previous version to supersede */
  supersedes_id?: string;
  /** Optional: Approver */
  approved_by?: string;
  /** Optional: Approval timestamp */
  approved_at?: string;
}

/**
 * Promotion result
 */
export interface PromotionResult {
  success: boolean;
  neo4j_id?: string;
  notion_page_id?: string;
  knowledge_hub_page_id?: string;
  error?: string;
}

/**
 * Knowledge Hub entry returned from Notion queries
 */
export interface KnowledgeHubEntry {
  /** Notion page ID */
  notion_page_id: string;
  /** Neo4j insight ID */
  neo4j_id: string;
  /** PostgreSQL trace ID */
  postgres_trace_id: string;
  /** Topic/title */
  topic: string;
  /** Status */
  status: string;
  /** group_id */
  group_id: string;
}

/**
 * Parameters for promoting an insight to the Knowledge Hub
 */
export interface KnowledgeHubPromotionParams {
  /** Proposal content / insight text */
  content: string;
  /** Topic or title */
  topic: string;
  /** Category (Architecture, Pattern, Decision, Research, Bugfix, Performance) */
  category: KnowledgeInsight['category'];
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** Source agent */
  source: string;
  /** Tenant group_id */
  group_id: string;
  /** PostgreSQL trace event ID */
  postgres_trace_id: string;
  /** Neo4j insight ID (from promotion) */
  neo4j_id: string;
  /** Tier (emerging, adoption, mainstream) */
  tier: string;
  /** Optional: Approver */
  approved_by?: string;
  /** Optional: Tags */
  tags?: string[];
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for Knowledge Hub promotion parameters
 */
export const KnowledgeHubPromotionParamsSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  topic: z.string().min(1, 'Topic is required'),
  category: z.enum(['Architecture', 'Pattern', 'Decision', 'Research', 'Bugfix', 'Performance']),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1, 'Source is required'),
  group_id: z.string().min(1, 'group_id is required'),
  postgres_trace_id: z.string().min(1, 'PostgreSQL trace ID is required'),
  neo4j_id: z.string().min(1, 'Neo4j insight ID is required'),
  tier: z.enum(['emerging', 'adoption', 'mainstream']),
  approved_by: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Schema for approved proposal row from canonical_proposals
 */
export const ApprovedProposalRowSchema = z.object({
  id: z.string().uuid(),
  group_id: z.string().min(1),
  workspace_id: z.string().min(1),
  content: z.string().min(1),
  score: z.string().or(z.number()),
  reasoning: z.string().nullable().optional(),
  tier: z.string(),
  status: z.literal('approved'),
  trace_ref: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
  decided_by: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(),
  notion_page_id: z.string().nullable().optional(),
});

export type ApprovedProposalRow = z.infer<typeof ApprovedProposalRowSchema>;

// ============================================================================
// Notion MCP Client Interface
// ============================================================================

/**
 * Interface for Notion MCP operations.
 * 
 * In production, this calls MCP_DOCKER_notion-create-pages and
 * MCP_DOCKER_notion-update-page. In tests, this is mocked.
 * 
 * The interface mirrors the MCP tool signatures so we can
 * call them directly from the route handler without importing
 * the MCP client.
 */
export interface NotionMCPClient {
  /**
   * Create pages in a Notion database.
   * Maps to MCP_DOCKER_notion-create-pages.
   */
  createPages(params: {
    parent: { data_source_id: string };
    pages: Array<{
      properties: Record<string, string | number>;
      content?: string;
    }>;
  }): Promise<Array<{ pageId: string; pageUrl: string }>>;

  /**
   * Update a page in Notion.
   * Maps to MCP_DOCKER_notion-update-page.
   */
  updatePage(params: {
    page_id: string;
    command: 'update_properties' | 'update_content' | 'replace_content';
    properties?: Record<string, string | number>;
    content_updates?: Array<{ old_str: string; new_str: string }>;
    new_str?: string;
  }): Promise<{ success: boolean }>;

  /**
   * Search Notion for pages.
   * Maps to MCP_DOCKER_notion-search.
   */
  search(params: {
    query: string;
    data_source_url?: string;
    page_size?: number;
  }): Promise<Array<{
    pageId: string;
    title: string;
    url: string;
    properties?: Record<string, unknown>;
  }>>;

  /**
   * Fetch a Notion page by ID.
   * Maps to MCP_DOCKER_notion-fetch.
   */
  fetch(params: {
    id: string;
  }): Promise<{
    pageId: string;
    title: string;
    properties?: Record<string, unknown>;
    content?: string;
  }>;
}

// ============================================================================
// PostgreSQL Queries for Approved Proposals
// ============================================================================

/**
 * Query canonical_proposals for approved items that haven't been synced
 * to the Knowledge Hub yet.
 * 
 * Checks for proposals with status='approved' that either:
 *   - Have no notion_page_id (never synced), OR
 *   - Have a notion_page_id but no Knowledge Hub entry (synced to
 *     Curator Proposals but not yet to Knowledge Hub)
 * 
 * Uses PostgreSQL directly for reliable, transactional reads.
 * 
 * @param groupId - Tenant identifier (defaults to 'allura-system')
 * @param limit - Max items to return (default: 50)
 * @returns Array of approved proposal rows
 */
export async function queryApprovedInsights(
  groupId: string,
  workspaceId: string,
  principalId: string,
  limit: number = 50
): Promise<ApprovalQueueItem[]> {
  console.log('[knowledge-promotion] Querying approved insights for group:', groupId);

  const result = await withWorkspaceTransaction(
    { tenantId: groupId, workspaceId, principalId },
    (db) => db.query(
      `SELECT id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref,
              decided_by, decided_at, notion_page_id
       FROM canonical_proposals
       WHERE group_id = $1 AND workspace_id = $2
         AND status = 'approved'
       ORDER BY decided_at ASC NULLS LAST
       LIMIT $3`,
      [groupId, workspaceId, limit],
    ),
  );

  if (result.rows.length === 0) {
    console.log('[knowledge-promotion] No approved items found for group:', groupId);
    return [];
  }

  // Map PG rows to ApprovalQueueItem[]
  const items: ApprovalQueueItem[] = result.rows.map((row: Record<string, unknown>) => {
    const tier = (row.tier as string) || 'emerging';
    const category = TIER_TO_CATEGORY[tier] || 'Research';

    return {
      proposal_id: row.id as string,
      notion_page_id: (row.notion_page_id as string) || (row.id as string),
      topic: (row.content as string).slice(0, 100),
      content: row.content as string,
      source: (row.decided_by as string) || 'system',
      status: 'Approved' as const,
      confidence: Number(row.score) || 0.5,
      group_id: row.group_id as string,
      workspace_id: row.workspace_id as string,
      postgres_trace_id: (row.trace_ref as string) || (row.id as string),
      category,
      approved_by: (row.decided_by as string) || undefined,
      approved_at: (row.decided_at as string) || undefined,
    };
  });

  console.log('[knowledge-promotion] Found', items.length, 'approved items for group:', groupId);
  return items;
}

/**
 * Query canonical_proposals for a single approved proposal by ID.
 * 
 * @param proposalId - UUID of the canonical_proposals record
 * @param groupId - Tenant identifier
 * @returns The approved proposal row, or null if not found/not approved
 */
export async function queryApprovedInsightById(
  proposalId: string,
  groupId: string,
  workspaceId: string,
  principalId: string,
): Promise<ApprovalQueueItem | null> {
  console.log('[knowledge-promotion] Querying approved insight by ID:', proposalId);

  const result = await withWorkspaceTransaction(
    { tenantId: groupId, workspaceId, principalId },
    (db) => db.query(
      `SELECT id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref,
              decided_by, decided_at, notion_page_id
       FROM canonical_proposals
       WHERE id = $1 AND group_id = $2 AND workspace_id = $3 AND status = 'approved'`,
      [proposalId, groupId, workspaceId],
    ),
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as Record<string, unknown>;
  const tier = (row.tier as string) || 'emerging';
  const category = TIER_TO_CATEGORY[tier] || 'Research';

  return {
    proposal_id: row.id as string,
    notion_page_id: (row.notion_page_id as string) || (row.id as string),
    topic: (row.content as string).slice(0, 100),
    content: row.content as string,
    source: (row.decided_by as string) || 'system',
    status: 'Approved' as const,
    confidence: Number(row.score) || 0.5,
    group_id: row.group_id as string,
    workspace_id: row.workspace_id as string,
    postgres_trace_id: (row.trace_ref as string) || (row.id as string),
    category,
    approved_by: (row.decided_by as string) || undefined,
    approved_at: (row.decided_at as string) || undefined,
  };
}

// ============================================================================
// Knowledge Hub Queries (Notion)
// ============================================================================

/**
 * Query Notion Knowledge Hub by source insight ID (Neo4j ID).
 * 
 * Searches the Knowledge Hub database for an existing entry with the
 * given Neo4j ID. Used for idempotency checks before creating a new
 * Knowledge Hub entry.
 * 
 * @param sourceInsightId - Neo4j source insight ID
 * @param mcpClient - Notion MCP client (injected for testability)
 * @returns Matching Knowledge Hub entry, or null if not found
 */
export async function queryKnowledgeHubBySourceId(
  sourceInsightId: string,
  mcpClient: NotionMCPClient
): Promise<KnowledgeHubEntry | null> {
  console.log('[knowledge-promotion] Querying Knowledge Hub for source:', sourceInsightId);

  try {
    const results = await mcpClient.search({
      query: sourceInsightId,
      data_source_url: `collection://${KNOWLEDGE_HUB_DATA_SOURCE_ID}`,
      page_size: 5,
    });

    if (!results || results.length === 0) {
      console.log('[knowledge-promotion] No Knowledge Hub entry found for:', sourceInsightId);
      return null;
    }

    // Find the entry whose "Neo4j ID" property matches exactly
    for (const result of results) {
      const props = result.properties as Record<string, unknown> | undefined;
      if (props) {
        const neo4jId = props['Neo4j ID'] as string | undefined;
        if (neo4jId === sourceInsightId) {
          return {
            notion_page_id: result.pageId,
            neo4j_id: neo4jId,
            postgres_trace_id: (props['PostgreSQL Trace ID'] as string) || '',
            topic: result.title,
            status: (props['Status'] as string) || '',
            group_id: (props['group_id'] as string) || '',
          };
        }
      }
    }

    // No exact match found
    return null;
  } catch (error) {
    console.error('[knowledge-promotion] Error querying Knowledge Hub:', error);
    // Non-blocking: return null rather than throwing
    return null;
  }
}

/**
 * Query Notion Knowledge Hub by PostgreSQL trace ID.
 * 
 * Searches the Knowledge Hub database for an existing entry with the
 * given PG trace ID. Used for deduplication checks.
 * 
 * @param pgTraceId - PostgreSQL trace event ID
 * @param mcpClient - Notion MCP client (injected for testability)
 * @returns Matching Knowledge Hub entry, or null if not found
 */
export async function queryKnowledgeHubByPgTraceId(
  pgTraceId: string,
  mcpClient: NotionMCPClient
): Promise<KnowledgeHubEntry | null> {
  console.log('[knowledge-promotion] Querying Knowledge Hub for PG trace:', pgTraceId);

  try {
    const results = await mcpClient.search({
      query: pgTraceId,
      data_source_url: `collection://${KNOWLEDGE_HUB_DATA_SOURCE_ID}`,
      page_size: 5,
    });

    if (!results || results.length === 0) {
      return null;
    }

    for (const result of results) {
      const props = result.properties as Record<string, unknown> | undefined;
      if (props) {
        const traceId = props['PostgreSQL Trace ID'] as string | undefined;
        if (traceId === pgTraceId) {
          return {
            notion_page_id: result.pageId,
            neo4j_id: (props['Neo4j ID'] as string) || '',
            postgres_trace_id: traceId,
            topic: result.title,
            status: (props['Status'] as string) || '',
            group_id: (props['group_id'] as string) || '',
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[knowledge-promotion] Error querying Knowledge Hub by PG trace:', error);
    return null;
  }
}

// ============================================================================
// Knowledge Hub Promotion (Flow 2)
// ============================================================================

/**
 * Promote an approved insight to the Notion Knowledge Hub.
 * 
 * Creates or updates a Knowledge Hub entry with full trace IDs:
 *   - PostgreSQL Trace ID (from canonical_proposals.trace_ref)
 *   - Neo4j Insight ID (from the promotion step)
 *   - group_id (tenant isolation)
 *   - Category, Confidence, Status, Source
 * 
 * ## Idempotency
 * 
 * Before creating, checks if an entry already exists with the same
 * Neo4j ID. If found, updates it instead of creating a duplicate.
 * 
 * ## Error Handling (Non-Blocking)
 * 
 * If the Notion MCP call fails, this function returns a failure
 * result but does NOT throw. The Neo4j promotion is already complete
 * and should not be rolled back.
 * 
 * @param params - Knowledge Hub promotion parameters
 * @param mcpClient - Notion MCP client (injected for testability)
 * @returns KnowledgeHubPromotionResult with page ID on success, error on failure
 */
export async function promoteToKnowledgeHub(
  params: KnowledgeHubPromotionParams,
  mcpClient: NotionMCPClient
): Promise<{ success: boolean; pageId?: string; pageUrl?: string; error?: string }> {
  // Validate input with Zod
  const parsed = KnowledgeHubPromotionParamsSchema.safeParse(params);
  if (!parsed.success) {
    const errorMessage = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.error('[knowledge-promotion] Validation error:', errorMessage);
    return { success: false, error: errorMessage };
  }

  const {
    content,
    topic,
    category,
    confidence,
    group_id,
    postgres_trace_id,
    neo4j_id,
    tier,
    approved_by,
    tags,
  } = parsed.data;

  console.log('[knowledge-promotion] Promoting to Knowledge Hub:', {
    topic,
    neo4j_id,
    pg_trace_id: postgres_trace_id,
    group_id,
  });

  // Idempotency check: search for existing entry by Neo4j ID
  const existingEntry = await queryKnowledgeHubBySourceId(neo4j_id, mcpClient);
  if (existingEntry) {
    console.log('[knowledge-promotion] Knowledge Hub entry already exists, updating:', existingEntry.notion_page_id);

    // Update existing entry with new trace IDs
    try {
      await mcpClient.updatePage({
        page_id: existingEntry.notion_page_id,
        command: 'update_properties',
        properties: {
          'Neo4j ID': neo4j_id,
          'PostgreSQL Trace ID': postgres_trace_id,
          Status: 'Approved',
          'date:Last Synced:start': new Date().toISOString().slice(0, 10),
          'date:Last Synced:is_datetime': 0,
        },
      });

      return {
        success: true,
        pageId: existingEntry.notion_page_id,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[knowledge-promotion] Failed to update existing Knowledge Hub entry:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // Build Notion page properties matching the Knowledge Hub schema
  const properties: Record<string, string | number> = {
    Topic: topic.slice(0, 100), // Notion title limit
    Category: category,
    Status: 'Approved',
    Confidence: confidence, // Stored as decimal (0.0-1.0), Notion displays as percent
    Source: TIER_TO_SOURCE[tier] || 'memory-orchestrator',
    group_id: group_id,
    'Neo4j ID': neo4j_id,
    'PostgreSQL Trace ID': postgres_trace_id,
    'date:Created:start': new Date().toISOString().slice(0, 10),
    'date:Created:is_datetime': 0,
    'date:Last Synced:start': new Date().toISOString().slice(0, 10),
    'date:Last Synced:is_datetime': 0,
  };

  // Add tags if provided
  if (tags && tags.length > 0) {
    properties['Tags'] = JSON.stringify(tags);
  }

  // Build page content
  const pageContent = buildKnowledgeHubContent({
    content,
    neo4j_id,
    postgres_trace_id,
    group_id,
    tier,
    approved_by,
  });

  try {
    const results = await mcpClient.createPages({
      parent: { data_source_id: KNOWLEDGE_HUB_DATA_SOURCE_ID },
      pages: [
        {
          properties,
          content: pageContent,
        },
      ],
    });

    if (!results || results.length === 0) {
      return {
        success: false,
        error: 'No page created — MCP returned empty results',
      };
    }

    console.log('[knowledge-promotion] Knowledge Hub page created:', {
      pageId: results[0].pageId,
      pageUrl: results[0].pageUrl,
    });

    return {
      success: true,
      pageId: results[0].pageId,
      pageUrl: results[0].pageUrl,
    };
  } catch (err) {
    // Non-blocking: return failure but don't throw
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[knowledge-promotion] Failed to create Knowledge Hub page:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Build Notion page content (body) for a Knowledge Hub entry.
 * 
 * Uses Notion-flavored Markdown for rich content.
 */
function buildKnowledgeHubContent(params: {
  content: string;
  neo4j_id: string;
  postgres_trace_id: string;
  group_id: string;
  tier: string;
  approved_by?: string;
}): string {
  const { content, neo4j_id, postgres_trace_id, group_id, tier, approved_by } = params;

  const lines = [
    `## Knowledge Insight`,
    ``,
    `**Neo4j ID:** \`${neo4j_id}\``,
    `**PG Trace ID:** \`${postgres_trace_id}\``,
    `**Group:** ${group_id}`,
    `**Tier:** ${tier}`,
    `**Approved By:** ${approved_by || 'system'}`,
    ``,
    `### Content`,
    ``,
    content,
  ];

  return lines.join('\n');
}

// ============================================================================
// Neo4j Promotion Functions
// ============================================================================

/**
 * Promote an insight to the knowledge graph (PostgreSQL + pgvector).
 *
 * Creates a memory node with Steel Frame versioning:
 *   - If new: Creates version 1
 *   - If update: Creates new version with SUPERSEDES relationship
 *
 * @param insight - Knowledge insight to promote
 * @returns Memory node ID
 */
export async function promoteToNeo4j(insight: KnowledgeInsight): Promise<string> {
  console.log('[knowledge-promotion] Promoting insight to knowledge graph:', {
    id: insight.id,
    topic: insight.topic,
    group_id: insight.group_id,
    workspace_id: insight.workspace_id,
  });

  if (!insight.proposal_id || insight.proposal_id.trim().length === 0) {
    throw new Error('Proposal ID is required for promotion approval');
  }
  if (!insight.workspace_id || insight.workspace_id.trim().length === 0) {
    throw new Error('Workspace ID is required for promotion');
  }

  await requireApprovalBeforePromotion(insight.proposal_id, insight.group_id);

  const createdAt = new Date().toISOString();
  // graph_memories constrains provenance to conversation|manual. A curator-
  // approved HITL promotion is the governed manual path.
  const provenance = 'manual' as const;

  try {
    return await withWorkspaceTransaction(
      {
        tenantId: insight.group_id,
        workspaceId: insight.workspace_id,
        principalId: insight.source,
      },
      async (client) => {
        let version = 1;
        if (insight.supersedes_id) {
          console.log('[knowledge-promotion] Creating new version superseding:', insight.supersedes_id);
          const prevResult = await client.query<{ version: number }>(
            `SELECT version FROM graph_memories
             WHERE id = $1 AND group_id = $2 AND workspace_id = $3
               AND workspace_scope_state = $4`,
            [insight.supersedes_id, insight.group_id, insight.workspace_id, 'workspace_scoped']
          );
          const previous = prevResult.rows[0];
          if (!previous) {
            throw new KnowledgePromotionError(insight.id, new Error(`Previous insight not found: ${insight.supersedes_id}`));
          }
          version = (previous.version ?? 1) + 1;
        }

        await client.query(
          `INSERT INTO graph_memories
             (id, group_id, workspace_id, workspace_scope_state, user_id, content, score, provenance, version, created_at, deprecated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, false)`,
          [insight.id, insight.group_id, insight.workspace_id, 'workspace_scoped', insight.source, insight.content, insight.confidence, provenance, version, createdAt]
        );

        if (insight.supersedes_id) {
          await client.query(
            `INSERT INTO graph_supersedes
               (newer_id, superseded_id, group_id, workspace_id, workspace_scope_state, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
            [insight.id, insight.supersedes_id, insight.group_id, insight.workspace_id, 'workspace_scoped', createdAt]
          );
        }

        console.log('[knowledge-promotion] Promotion complete:', {
          insight_id: insight.id,
          workspace_id: insight.workspace_id,
          version,
        });
        return insight.id;
      }
    );
  } catch (err) {
    if (err instanceof KnowledgePromotionError) throw err;
    throw new KnowledgePromotionError(insight.id, err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Create CONTRIBUTED relationship between Agent and Insight
 *
 * Links the agent who proposed this insight to the knowledge node.
 * Uses PostgreSQL graph_structural_nodes + adjacency table.
 *
 * @param agentId - Agent ID
 * @param insightId - Insight ID
 * @param confidence - Confidence score
 * @param groupId - Tenant identifier
 */
export async function linkInsightToAgent(
  agentId: string,
  insightId: string,
  confidence: number,
  groupId: string,
  workspaceId: string,
): Promise<void> {
  console.log('[knowledge-promotion] Linking insight to agent:', {
    agent_id: agentId,
    insight_id: insightId,
    confidence,
    group_id: groupId,
    workspace_id: workspaceId,
  });

  try {
    await withWorkspaceTransaction(
      { tenantId: groupId, workspaceId, principalId: agentId },
      (db) => db.query(
        `INSERT INTO graph_structural_edges
           (from_id, to_id, rel_type, group_id, workspace_id, workspace_scope_state, props, created_at)
         SELECT
           (SELECT node_id FROM graph_structural_nodes
             WHERE label = 'Agent' AND group_id = $1 AND workspace_id = $2
               AND workspace_scope_state = 'workspace_scoped' AND props->>'id' = $3 LIMIT 1),
           $4,
           'CONTRIBUTED',
           $1,
           $2,
           'workspace_scoped',
           $5::jsonb,
           NOW()
         WHERE EXISTS (
           SELECT 1 FROM graph_memories
            WHERE id = $4 AND group_id = $1 AND workspace_id = $2
              AND workspace_scope_state = 'workspace_scoped'
         )`,
        [groupId, workspaceId, agentId, insightId, JSON.stringify({ confidence, linked_at: new Date().toISOString() })],
      ),
    );

    console.log('[knowledge-promotion] Successfully linked insight to agent:', {
      agent_id: agentId,
      insight_id: insightId,
    });
  } catch (error) {
    // Non-fatal: link failure should not block promotion
    console.error('[knowledge-promotion] Failed to link insight to agent (non-fatal):', {
      agent_id: agentId,
      insight_id: insightId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Notion Knowledge Hub Updates
// ============================================================================

/**
 * Update Notion Knowledge Hub page with Neo4j ID
 * 
 * After promoting to Neo4j, sync the Neo4j ID back to Notion
 * so the knowledge hub can link to the graph.
 * 
 * @param notionPageId - Knowledge Hub page ID
 * @param neo4jId - Neo4j node ID
 * @param approvedBy - User who approved
 * @param mcpClient - Notion MCP client (injected for testability)
 */
export async function updateNotionWithNeo4jId(
  notionPageId: string,
  neo4jId: string,
  approvedBy: string,
  mcpClient: NotionMCPClient
): Promise<void> {
  console.log('[knowledge-promotion] Updating Notion Knowledge Hub:', {
    notion_page_id: notionPageId,
    neo4j_id: neo4jId,
    approved_by: approvedBy,
  });

  try {
    await mcpClient.updatePage({
      page_id: notionPageId,
      command: 'update_properties',
      properties: {
        'Neo4j ID': neo4jId,
        Status: 'Approved',
        'date:Last Synced:start': new Date().toISOString().slice(0, 10),
        'date:Last Synced:is_datetime': 0,
      },
    });
  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[knowledge-promotion] Failed to update Knowledge Hub page:', {
      notion_page_id: notionPageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Update Notion Approval Queue item status
 * 
 * After successful promotion, mark the Approval Queue item as complete.
 * 
 * @param notionPageId - Approval Queue page ID
 * @param neo4jId - Neo4j node ID
 * @param approvedBy - User who approved
 * @param mcpClient - Notion MCP client (injected for testability)
 */
export async function updateApprovalQueueItem(
  notionPageId: string,
  neo4jId: string,
  approvedBy: string,
  mcpClient: NotionMCPClient
): Promise<void> {
  console.log('[knowledge-promotion] Updating Approval Queue item:', {
    notion_page_id: notionPageId,
    neo4j_id: neo4jId,
    approved_by: approvedBy,
  });

  try {
    await mcpClient.updatePage({
      page_id: notionPageId,
      command: 'update_properties',
      properties: {
        Status: 'Approved',
        'Neo4j ID': neo4jId,
        'Notion Synced': '__YES__',
      },
    });
  } catch (error) {
    // Non-blocking: log but don't throw
    console.error('[knowledge-promotion] Failed to update Approval Queue item:', {
      notion_page_id: notionPageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// PostgreSQL Audit Logging
// ============================================================================

/**
 * Log promotion event to PostgreSQL
 * 
 * Creates immutable audit trail for knowledge promotion.
 * 
 * @param groupId - Tenant identifier
 * @param agentId - Agent or system performing promotion
 * @param insightId - Insight ID
 * @param neo4jId - Neo4j node ID
 * @param notionPageId - Notion page ID
 * @param status - Promotion status
 */
export async function logPromotionEvent(
  groupId: string,
  agentId: string,
  insightId: string,
  neo4jId: string,
  notionPageId: string,
  status: 'approved' | 'promoted' | 'rejected' | 'failed'
): Promise<EventRecord> {
  console.log('[knowledge-promotion] Logging promotion event:', {
    group_id: groupId,
    agent_id: agentId,
    insight_id: insightId,
    status,
  });

  const event = await insertEvent({
    group_id: groupId,
    event_type: 'knowledge_promotion',
    agent_id: agentId,
    metadata: {
      insight_id: insightId,
      neo4j_id: neo4jId,
      notion_page_id: notionPageId,
    },
    outcome: {
      status,
      promoted_at: new Date().toISOString(),
    },
    status: status === 'failed' ? 'failed' : 'completed',
  });

  return event;
}

// ============================================================================
// Main Promotion Workflow
// ============================================================================

/**
 * Process all approved insights from Notion Approval Queue
 * 
 * Batch processes approved items:
 *   1. Query canonical_proposals for Status = 'Approved'
 *   2. For each approved insight:
 *      a. Promote to Neo4j
 *      b. Promote to Knowledge Hub (Flow 2)
 *      c. Update Notion Knowledge Hub with Neo4j ID
 *      d. Update Approval Queue item status
 *      e. Create CONTRIBUTED relationship to agent
 *      f. Log promotion event to PostgreSQL
 * 
 * @param groupId - Tenant identifier (default: 'allura-system')
 * @param batchSize - Max items to process in one batch (default: 10)
 * @param mcpClient - Notion MCP client (injected for testability)
 * @returns Array of promotion results
 */
export async function processApprovedInsights(
  groupId: string,
  workspaceId: string,
  principalId: string,
  batchSize: number = 10,
  mcpClient?: NotionMCPClient
): Promise<PromotionResult[]> {
  console.log('[knowledge-promotion] Processing approved insights for group:', groupId);

  // Step 1: Query approved items from PostgreSQL
  const approvedItems = await queryApprovedInsights(groupId, workspaceId, principalId, batchSize);
  
  if (approvedItems.length === 0) {
    console.log('[knowledge-promotion] No approved items found');
    return [];
  }

  // Limit batch size
  const itemsToProcess = approvedItems.slice(0, batchSize);
  console.log('[knowledge-promotion] Processing', itemsToProcess.length, 'items');

  const results: PromotionResult[] = [];

  for (const item of itemsToProcess) {
    try {
      console.log('[knowledge-promotion] Processing item:', item.notion_page_id);

      // Step 2: Require approval audit before any Neo4j promotion path.
      await requireApprovalBeforePromotion(item.proposal_id, item.group_id);

      // Step 3: Promote to Neo4j
      const neo4jId = await promoteToNeo4j({
        id: item.postgres_trace_id, // Use trace ID as stable insight ID
        proposal_id: item.proposal_id,
        topic: item.topic,
        category: item.category,
        content: item.content,
        source: item.source,
        confidence: item.confidence,
        group_id: item.group_id,
        workspace_id: item.workspace_id,
        notion_page_id: item.notion_page_id,
        postgres_trace_id: item.postgres_trace_id,
        supersedes_id: item.supersedes_id,
      });

      // Step 3: Promote to Knowledge Hub (Flow 2)
      let knowledgeHubPageId: string | undefined;
      if (mcpClient) {
        const hubResult = await promoteToKnowledgeHub(
          {
            content: item.content,
            topic: item.topic,
            category: item.category,
            confidence: item.confidence,
            source: item.source,
            group_id: item.group_id,
            postgres_trace_id: item.postgres_trace_id,
            neo4j_id: neo4jId,
            tier: 'emerging', // Default tier; could be derived from item
            approved_by: item.approved_by,
          },
          mcpClient
        );

        if (hubResult.success) {
          knowledgeHubPageId = hubResult.pageId;
          console.log('[knowledge-promotion] Knowledge Hub page created:', knowledgeHubPageId);
        } else {
          console.warn('[knowledge-promotion] Knowledge Hub promotion failed (non-blocking):', hubResult.error);
        }
      } else {
        console.log('[knowledge-promotion] No MCP client provided, skipping Knowledge Hub sync');
      }

      // Step 4: Update Notion Knowledge Hub with Neo4j ID
      if (mcpClient && knowledgeHubPageId) {
        await updateNotionWithNeo4jId(knowledgeHubPageId, neo4jId, item.approved_by || 'system', mcpClient);
      }

      // Step 5: Update Approval Queue item
      if (mcpClient) {
        await updateApprovalQueueItem(item.notion_page_id, neo4jId, item.approved_by || 'system', mcpClient);
      }

      // Step 6: Create CONTRIBUTED relationship
      await linkInsightToAgent(item.source, neo4jId, item.confidence, item.group_id, item.workspace_id);

      // Step 7: Log promotion event
      await logPromotionEvent(
        item.group_id,
        item.source,
        item.postgres_trace_id,
        neo4jId,
        knowledgeHubPageId || item.notion_page_id,
        'promoted'
      );

      results.push({
        success: true,
        neo4j_id: neo4jId,
        notion_page_id: item.notion_page_id,
        knowledge_hub_page_id: knowledgeHubPageId,
      });

      console.log('[knowledge-promotion] Successfully promoted:', {
        notion_page_id: item.notion_page_id,
        neo4j_id: neo4jId,
        knowledge_hub_page_id: knowledgeHubPageId,
      });

    } catch (error) {
      console.error('[knowledge-promotion] Failed to promote item:', {
        notion_page_id: item.notion_page_id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Log failure event
      await logPromotionEvent(
        item.group_id,
        item.source,
        item.postgres_trace_id,
        '',
        item.notion_page_id,
        'failed'
      );

      results.push({
        success: false,
        notion_page_id: item.notion_page_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log('[knowledge-promotion] Batch processing complete:', {
    total: itemsToProcess.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });

  return results;
}

// ============================================================================
// Single Item Promotion
// ============================================================================

/**
 * Promote a single insight by ID
 * 
 * Used for on-demand promotion after HITL approval.
 * Queries canonical_proposals for the specific proposal, promotes
 * to Neo4j, then syncs to Knowledge Hub.
 * 
 * @param proposalId - UUID of the canonical_proposals record
 * @param groupId - Tenant identifier
 * @param approvedBy - User who approved
 * @param mcpClient - Notion MCP client (injected for testability)
 * @returns Promotion result
 */
export async function promoteSingleInsight(
  proposalId: string,
  groupId: string,
  workspaceId: string,
  principalId: string,
  approvedBy: string,
  mcpClient?: NotionMCPClient
): Promise<PromotionResult> {
  console.log('[knowledge-promotion] Promoting single insight:', proposalId);

  // Step 1: Query the approved proposal from PostgreSQL
  const item = await queryApprovedInsightById(proposalId, groupId, workspaceId, principalId);

  if (!item) {
    return {
      success: false,
      notion_page_id: proposalId,
      error: `No approved proposal found with id=${proposalId} and group_id=${groupId}`,
    };
  }

  try {
    // Step 2: Require approval audit before any Neo4j promotion path.
    await requireApprovalBeforePromotion(proposalId, item.group_id);

    // Step 3: Promote to Neo4j
    const neo4jId = await promoteToNeo4j({
      id: item.postgres_trace_id,
      proposal_id: proposalId,
      topic: item.topic,
      category: item.category,
      content: item.content,
      source: item.source,
      confidence: item.confidence,
      group_id: item.group_id,
      workspace_id: item.workspace_id,
      notion_page_id: item.notion_page_id,
      postgres_trace_id: item.postgres_trace_id,
      supersedes_id: item.supersedes_id,
    });

    // Step 3: Promote to Knowledge Hub (Flow 2)
    let knowledgeHubPageId: string | undefined;
    if (mcpClient) {
      const hubResult = await promoteToKnowledgeHub(
        {
          content: item.content,
          topic: item.topic,
          category: item.category,
          confidence: item.confidence,
          source: item.source,
          group_id: item.group_id,
          postgres_trace_id: item.postgres_trace_id,
          neo4j_id: neo4jId,
          tier: 'emerging',
          approved_by: approvedBy,
        },
        mcpClient
      );

      if (hubResult.success) {
        knowledgeHubPageId = hubResult.pageId;
      } else {
        console.warn('[knowledge-promotion] Knowledge Hub promotion failed (non-blocking):', hubResult.error);
      }
    }

    // Step 4: Update Notion pages
    if (mcpClient && knowledgeHubPageId) {
      await updateNotionWithNeo4jId(knowledgeHubPageId, neo4jId, approvedBy, mcpClient);
    }
    if (mcpClient) {
      await updateApprovalQueueItem(item.notion_page_id, neo4jId, approvedBy, mcpClient);
    }

    // Step 5: Create CONTRIBUTED relationship
    await linkInsightToAgent(item.source, neo4jId, item.confidence, item.group_id, item.workspace_id);

    // Step 6: Log promotion event
    await logPromotionEvent(
      item.group_id,
      item.source,
      item.postgres_trace_id,
      neo4jId,
      knowledgeHubPageId || item.notion_page_id,
      'promoted'
    );

    return {
      success: true,
      neo4j_id: neo4jId,
      notion_page_id: item.notion_page_id,
      knowledge_hub_page_id: knowledgeHubPageId,
    };
  } catch (error) {
    console.error('[knowledge-promotion] Failed to promote single insight:', {
      proposal_id: proposalId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Log failure event
    await logPromotionEvent(
      item.group_id,
      item.source,
      item.postgres_trace_id,
      '',
      item.notion_page_id,
      'failed'
    );

    return {
      success: false,
      notion_page_id: item.notion_page_id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that an insight is ready for promotion
 * 
 * Checks all required fields and constraints.
 * 
 * @param insight - Insight to validate
 * @returns True if valid, throws error if invalid
 */
export function validateInsightForPromotion(insight: KnowledgeInsight): boolean {
  if (!insight.id || insight.id.trim().length === 0) {
    throw new Error('Insight ID is required for promotion');
  }

  if (!insight.proposal_id || insight.proposal_id.trim().length === 0) {
    throw new Error('Proposal ID is required for promotion');
  }

  if (!insight.group_id || insight.group_id.trim().length === 0) {
    throw new Error('group_id is required for promotion');
  }

  if (!insight.workspace_id || insight.workspace_id.trim().length === 0) {
    throw new Error('Workspace ID is required for promotion');
  }

  if (!insight.content || insight.content.trim().length === 0) {
    throw new Error('Content is required for promotion');
  }

  if (insight.confidence < 0 || insight.confidence > 1) {
    throw new Error('Confidence must be between 0 and 1');
  }

  if (!insight.notion_page_id || insight.notion_page_id.trim().length === 0) {
    throw new Error('Notion page ID is required for promotion');
  }

  if (!insight.postgres_trace_id || insight.postgres_trace_id.trim().length === 0) {
    throw new Error('PostgreSQL trace ID is required for promotion');
  }

  return true;
}
