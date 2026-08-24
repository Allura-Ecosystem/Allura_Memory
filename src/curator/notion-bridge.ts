/**
 * Curator Notion Bridge — MCP-based Notion page creation for proposals
 *
 * Creates/updates Notion pages in the Curator Proposals database
 * when proposals are approved or rejected via the HITL pipeline.
 *
 * ## Architecture Decision (AD-CURATOR-NOTION)
 *
 * Notion writes are NON-BLOCKING. If the Notion MCP call fails,
 * the approval state machine still completes. The Notion page URL
 * is written back to the proposal record for traceability.
 *
 * ## Notion DB Schema (data_source_id: 42894678-aedb-4c90-9371-6494a9fe5270)
 *
 * Properties:
 *   Title        — title
 *   Status       — select: pending | approved | rejected
 *   Type         — select: insight | pattern | decision | constraint
 *   Score        — number
 *   Group ID     — text
 *   Notes        — text
 *   Proposed At  — date
 *   Reviewed By  — person
 *   Notion Synced — checkbox
 *
 * ## Usage
 *
 * This module is called from the approve/reject route handler.
 * It uses MCP_DOCKER_notion-create-pages and notion-update-page
 * via the canonical MCP tools interface.
 */

import type { Pool } from "pg";

// ── Types ──────────────────────────────────────────────────────────────────

/** Curator Proposals data_source_id in Notion */
export const CURATOR_PROPOSALS_DATA_SOURCE_ID =
  "42894678-aedb-4c90-9371-6494a9fe5270";

/** Curator Proposals database_id in Notion */
export const CURATOR_PROPOSALS_DB_ID = "08d2e672-2a73-45b0-a31d-b4a7be551e16";

/** Proposal type mapping from tier to Notion Type select */
const TIER_TO_TYPE: Record<string, string> = {
  emerging: "insight",
  adoption: "pattern",
  mainstream: "decision",
};

/** Notion page creation result */
export interface NotionPageResult {
  success: boolean;
  pageId?: string;
  pageUrl?: string;
  error?: string;
}

/** Parameters for creating a Notion proposal page */
export interface CreateProposalPageParams {
  /** Proposal content/title */
  content: string;
  /** Proposal score (0.0–1.0) */
  score: number;
  /** Promotion tier: emerging | adoption | mainstream */
  tier: string;
  /** Tenant group_id */
  groupId: string;
  /** Decision: approved | rejected */
  status: "approved" | "rejected";
  /** Curator who made the decision */
  curatorId: string;
  /** Optional rationale for the decision */
  rationale?: string;
  /** ISO-8601 timestamp of the decision */
  decidedAt: string;
  /** Proposal UUID from canonical_proposals */
  proposalId: string;
}

// ── Notion MCP Call Interface ───────────────────────────────────────────────

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
   * Create a page in the Curator Proposals database.
   * Maps to MCP_DOCKER_notion-create-pages.
   */
  createPages(params: {
    parent: { data_source_id: string };
    pages: Array<{
      properties: Record<string, string | number>;
      content?: string;
    }>;
  }): Promise<{ pageId: string; pageUrl: string }[]>;

  /**
   * Update a page in Notion.
   * Maps to MCP_DOCKER_notion-update-page.
   */
  updatePage(params: {
    page_id: string;
    command: "update_properties" | "update_content";
    properties: Record<string, string | number>;
    content_updates?: Array<{ old_str: string; new_str: string }>;
  }): Promise<{ success: boolean }>;
}

// ── Core Functions ──────────────────────────────────────────────────────────

/**
 * Create a Notion page for a curator proposal decision.
 *
 * This is the primary P0 function — called when a proposal
 * is approved or rejected. It creates a structured Notion page
 * in the Curator Proposals database with all proposal metadata.
 *
 * ## Error Handling (Non-Blocking)
 *
 * If the Notion MCP call fails, this function returns a failure
 * result but does NOT throw. The approval state machine completes
 * regardless of Notion sync status.
 *
 * ## Notion Property Format Notes
 *
 * - Score is stored in page content, not as a property (Notion API rejects floats)
 * - date:Proposed At:start must be YYYY-MM-DD format (no time)
 * - Notion Synced uses "__YES__" for checked, "__NO__" for unchecked
 *
 * @param params - Proposal page creation parameters
 * @param mcpClient - Notion MCP client (injected for testability)
 * @returns NotionPageResult with page ID/URL on success, error on failure
 */
export async function createProposalNotionPage(
  params: CreateProposalPageParams,
  mcpClient: NotionMCPClient
): Promise<NotionPageResult> {
  const {
    content,
    score,
    tier,
    groupId,
    status,
    curatorId,
    rationale,
    decidedAt,
    proposalId,
  } = params;

  // Map tier to Notion Type select value
  const notionType = TIER_TO_TYPE[tier] || "insight";

  // Build Notion page properties matching the DB schema exactly
  // Note: Score is omitted because Notion API rejects float values in number properties
  // The score is stored in the page content instead
  const properties: Record<string, string | number> = {
    Title: content.slice(0, 100), // Notion title limit
    Status: status,
    Type: notionType,
    "Group ID": groupId,
    "date:Proposed At:start": decidedAt.slice(0, 10), // ISO date only (YYYY-MM-DD)
  };

  // Add rationale as Notes if provided
  if (rationale) {
    properties["Notes"] = `Decision: ${status} by ${curatorId}\nRationale: ${rationale}`;
  } else {
    properties["Notes"] = `Decision: ${status} by ${curatorId}`;
  }

  // Mark as synced since we're creating it from the system
  properties["Notion Synced"] = "__YES__";

  try {
    const results = await mcpClient.createPages({
      parent: { data_source_id: CURATOR_PROPOSALS_DATA_SOURCE_ID },
      pages: [
        {
          properties,
          content: buildProposalContent(params),
        },
      ],
    });

    if (!results || results.length === 0) {
      return {
        success: false,
        error: "No page created — MCP returned empty results",
      };
    }

    return {
      success: true,
      pageId: results[0].pageId,
      pageUrl: results[0].pageUrl,
    };
  } catch (err) {
    // Non-blocking: return failure but don't throw
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    console.error("[notion-bridge] Failed to create Notion page:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Update an existing Notion proposal page with the decision result.
 *
 * Called after the approval state machine completes to update
 * the Status and add reviewer notes.
 *
 * @param pageId - Notion page ID to update
 * @param status - New status (approved/rejected)
 * @param curatorId - Who made the decision
 * @param rationale - Optional rationale
 * @param mcpClient - Notion MCP client
 * @returns NotionPageResult
 */
export async function updateProposalNotionPage(
  pageId: string,
  status: "approved" | "rejected",
  curatorId: string,
  rationale: string | undefined,
  mcpClient: NotionMCPClient
): Promise<NotionPageResult> {
  const properties: Record<string, string | number> = {
    Status: status,
    "Notion Synced": "__YES__",
  };

  if (rationale) {
    properties["Notes"] = `Decision: ${status} by ${curatorId}\nRationale: ${rationale}`;
  }

  try {
    await mcpClient.updatePage({
      page_id: pageId,
      command: "update_properties",
      properties,
    });

    return { success: true, pageId };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    console.error("[notion-bridge] Failed to update Notion page:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Write the Notion page URL back to the canonical_proposals record.
 *
 * This creates a traceability link from the proposal in PostgreSQL
 * to the Notion page. Uses the rationale field to append the URL
 * (matching the existing markSynced pattern).
 *
 * @param proposalId - UUID of the canonical_proposals record
 * @param notionPageUrl - URL of the created Notion page
 * @param pg - PostgreSQL pool
 */
export async function writeNotionUrlToProposal(
  proposalId: string,
  groupId: string,
  notionPageUrl: string,
  pg: Pool
): Promise<void> {
  await pg.query(
    `UPDATE canonical_proposals
     SET rationale = COALESCE(rationale, '') || $1
     WHERE id = $2 AND group_id = $3`,
    [`\n[notion-page:${notionPageUrl}]`, proposalId, groupId]
  );
}

// ── Content Builder ─────────────────────────────────────────────────────────

/**
 * Build the Notion page content (body) for a proposal decision.
 *
 * Uses Notion-flavored Markdown for rich content.
 */
function buildProposalContent(params: CreateProposalPageParams): string {
  const { content, score, tier, groupId, status, curatorId, rationale, decidedAt, proposalId } = params;

  const lines = [
    `## Proposal Decision`,
    ``,
    `**Proposal ID:** \`${proposalId}\``,
    `**Decision:** ${status === "approved" ? "✅ Approved" : "❌ Rejected"}`,
    `**Curator:** ${curatorId}`,
    `**Decided At:** ${decidedAt}`,
    `**Score:** ${score}`,
    `**Tier:** ${tier}`,
    `**Group:** ${groupId}`,
    ``,
    `### Content`,
    ``,
    content,
  ];

  if (rationale) {
    lines.push("", "### Rationale", "", rationale);
  }

  if (status === "rejected") {
    lines.push("", "---", "", `> ⚠️ This proposal was **rejected** by ${curatorId}.`);
  }

  return lines.join("\n");
}

// ── Idempotency Check ────────────────────────────────────────────────────────

/**
 * Check if a Notion page already exists for this proposal.
 *
 * Prevents duplicate page creation on retry. Checks the proposal's
 * rationale field for an existing `[notion-page:...]` marker.
 *
 * @param proposalId - UUID of the canonical_proposals record
 * @param pg - PostgreSQL pool
 * @returns Existing Notion page URL if found, null otherwise
 */
export async function findExistingNotionPage(
  proposalId: string,
  pg: Pool
): Promise<string | null> {
  const result = await pg.query(
    `SELECT rationale FROM canonical_proposals WHERE id = $1`,
    [proposalId]
  );

  if (result.rows.length === 0) return null;

  const rationale = result.rows[0].rationale || "";
  const match = rationale.match(/\[notion-page:(https?:\/\/[^\]]+)\]/);

  return match ? match[1] : null;
}