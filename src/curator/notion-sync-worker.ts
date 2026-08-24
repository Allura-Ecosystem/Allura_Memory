#!/usr/bin/env bun
/**
 * Notion Sync Worker — Processes notion_sync_pending events
 *
 * This worker runs as a separate process and:
 * 1. Polls PostgreSQL for notion_sync_pending events
 * 2. Calls MCP Docker Notion tools to create/update pages
 * 3. Updates event status and writes Notion page URL back to proposal
 * 4. Routes failures to the Dead Letter Queue (DLQ) for retry
 *
 * ## Architecture (AD-CURATOR-NOTION, AD-CURATOR-DLQ)
 *
 * The approve route emits a notion_sync_pending event. This worker
 * picks it up and calls MCP Docker Notion tools directly. No API keys
 * needed — the MCP Docker toolkit handles auth.
 *
 * When Notion page creation fails, the event is routed to the DLQ
 * (notion_sync_dlq table) with exponential backoff retry scheduling.
 * After 5 failed attempts, the entry is marked permanently_failed
 * for human intervention. This ensures 0% event drop rate.
 *
 * ## Usage
 *
 *   bun src/curator/notion-sync-worker.ts
 *
 * ## Environment
 *
 *   DATABASE_URL — PostgreSQL connection string
 *   NOTION_CURATOR_DB_ID — Curator Proposals database ID (optional, defaults to hardcoded)
 *
 * ## Notion DB Schema
 *
 *   data_source_id: 42894678-aedb-4c90-9371-6494a9fe5270
 *   Properties:
 *     Title        — title
 *     Status       — select: pending | approved | rejected
 *     Type         — select: insight | pattern | decision | constraint
 *     Score        — number (stored in content, Notion API rejects floats)
 *     Group ID     — text
 *     Notes        — text
 *     Proposed At  — date
 *     Reviewed By  — person
 *     Notion Synced — checkbox
 */

import {
  type DlqEntry,
  getDlqStats,
  getRetryableEntries,
  insertDlqEntry,
  type InsertDlqEntryParams,
  markEntryCompleted,
  markEntryFailed,
  markEntryRetrying,
} from "./notion-sync-dlq"
import { closePool, getPool } from "../lib/postgres/connection"
import { validateGroupId } from "../lib/validation/group-id"

// ── Types ──────────────────────────────────────────────────────────────────

export interface NotionSyncEvent {
  id: string
  group_id: string
  event_type: string
  agent_id: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface PendingProposal {
  proposal_id: string
  content: string
  score: number
  tier: string
  status: "approved" | "rejected"
  curator_id: string
  rationale?: string
  decided_at: string
  data_source_id: string
  group_id: string
}

// ── Tier to Type Mapping ────────────────────────────────────────────────────

const TIER_TO_TYPE: Record<string, string> = {
  emerging: "insight",
  adoption: "pattern",
  mainstream: "decision",
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Fetch pending notion_sync_pending events from PostgreSQL.
 */
export async function getPendingEvents(): Promise<NotionSyncEvent[]> {
  const pool = getPool()

  const result = await pool.query(
    `SELECT id, group_id, event_type, agent_id, status, metadata, created_at
     FROM events
     WHERE event_type = 'notion_sync_pending'
       AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 10`
  )

  return result.rows
}

/**
 * Mark event as completed by appending a completion event.
 *
 * Instead of mutating the original event row (which would violate the
 * append-only invariant), we INSERT a new event that references the
 * original via `metadata.supersedes_id`.
 */
async function markEventCompleted(
  eventId: string,
  groupId: string,
  agentId: string,
  notionPageUrl?: string
): Promise<void> {
  const pool = getPool()
  const now = new Date().toISOString()

  await pool.query(
    `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      groupId,
      "notion_sync_completed",
      agentId,
      "completed",
      JSON.stringify({
        supersedes_id: eventId,
        notion_page_url: notionPageUrl || null,
      }),
      now,
    ]
  )
}

/**
 * Mark event as failed and route to DLQ for retry.
 *
 * Instead of mutating the original event row (which would violate the
 * append-only invariant), we INSERT a new event that references the
 * original via `metadata.supersedes_id` with status 'failed'.
 * The event is also routed to the DLQ for exponential backoff retry.
 *
 * This ensures 0% event drop rate — every failure is tracked and retried.
 */
async function markEventFailed(
  eventId: string,
  error: string,
  groupId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const pool = getPool()
  const now = new Date().toISOString()

  // 1. Append a failure event (append-only — no UPDATE on events table)
  await pool.query(
    `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      groupId,
      "notion_sync_failed",
      "notion-sync-worker",
      "failed",
      JSON.stringify({
        supersedes_id: eventId,
        error,
        ...metadata,
      }),
      now,
    ]
  )

  // 2. Route to DLQ for retry
  const proposalId = metadata.proposal_id as string | undefined
  const dlqResult = await insertDlqEntry(pool, {
    groupId,
    originalEventId: parseInt(eventId, 10),
    proposalId,
    originalMetadata: metadata,
    errorMessage: error,
  })

  if (!dlqResult.success) {
    console.error(`[NotionSyncWorker] CRITICAL: Failed to insert DLQ entry for event ${eventId}: ${dlqResult.error}`)
    // The failure event is still recorded in the events table,
    // but we couldn't queue it for retry. This should trigger an alert.
  } else {
    console.log(`[NotionSyncWorker] Event ${eventId} routed to DLQ (dlq_id=${dlqResult.dlqId}) for retry`)
  }
}

/**
 * Write Notion page URL back to canonical_proposals.
 */
export async function writeNotionUrlToProposal(
  proposalId: string,
  groupId: string,
  notionPageUrl: string
): Promise<void> {
  const scopedGroupId = validateGroupId(groupId)
  // Validate proposalId is a valid UUID before querying
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(proposalId)) {
    console.warn(`[NotionSyncWorker] Skipping writeNotionUrlToProposal: invalid UUID "${proposalId}"`)
    return
  }

  const pool = getPool()

  await pool.query(
    `UPDATE canonical_proposals
     SET rationale = COALESCE(rationale, '') || $1
     WHERE id = $2 AND group_id = $3`,
    [`\n[notion-page:${notionPageUrl}]`, proposalId, scopedGroupId]
  )
}

/**
 * Build Notion page content (body) for a proposal decision.
 */
function buildProposalContent(proposal: PendingProposal): string {
  const lines = [
    `## Proposal Decision`,
    ``,
    `**Proposal ID:** \`${proposal.proposal_id}\``,
    `**Decision:** ${proposal.status === "approved" ? "✅ Approved" : "❌ Rejected"}`,
    `**Curator:** ${proposal.curator_id}`,
    `**Decided At:** ${proposal.decided_at}`,
    `**Score:** ${proposal.score}`,
    `**Tier:** ${proposal.tier}`,
    `**Group:** ${proposal.group_id}`,
    ``,
    `### Content`,
    ``,
    proposal.content,
  ]

  if (proposal.rationale) {
    lines.push("", "### Rationale", "", proposal.rationale)
  }

  if (proposal.status === "rejected") {
    lines.push("", "---", "", `> ⚠️ This proposal was **rejected** by ${proposal.curator_id}.`)
  }

  return lines.join("\n")
}

/**
 * Create Notion page via MCP Docker tools.
 *
 * This function is called by the agent (you) when processing events.
 * The actual MCP call happens in the agent context, not in this worker.
 *
 * @param proposal - Proposal data from the event
 * @returns Notion page ID and URL
 */
async function createNotionPage(proposal: PendingProposal): Promise<{ pageId: string; pageUrl: string }> {
  // This is a placeholder — the actual MCP call happens in the agent context
  // The agent (you) will call mcp__MCP_DOCKER__notion-create-pages directly
  //
  // The worker just prepares the data and emits the event.
  // When you (the agent) see notion_sync_pending events, you call:
  //
  //   mcp__MCP_DOCKER__notion-create-pages({
  //     parent: { data_source_id: "42894678-aedb-4c90-9371-6494a9fe5270" },
  //     pages: [{
  //       properties: { ... },
  //       content: buildProposalContent(proposal)
  //     }]
  //   })
  //
  // Then you update the event status and write the URL back.

  throw new Error(
    "createNotionPage must be called by the agent via MCP Docker tools. " + "The worker only prepares the event data."
  )
}

/**
 * Process a single notion_sync_pending event.
 *
 * This is the main entry point for the agent (you) to process events.
 * You call this function after fetching pending events from PostgreSQL.
 *
 * If the event processing fails, it is automatically routed to the DLQ
 * for exponential backoff retry. No event is ever silently dropped.
 */
export async function processNotionSyncEvent(
  event: NotionSyncEvent,
  notionClient?: import("./notion-bridge").NotionMCPClient
): Promise<{ success: boolean; pageUrl?: string; error?: string; dlqId?: number }> {
  const proposal: PendingProposal = {
    proposal_id: event.metadata.proposal_id as string,
    content: event.metadata.content as string,
    score: event.metadata.score as number,
    tier: event.metadata.tier as string,
    status: event.metadata.status as "approved" | "rejected",
    curator_id: event.metadata.curator_id as string,
    rationale: event.metadata.rationale as string | undefined,
    decided_at: event.metadata.decided_at as string,
    data_source_id: event.metadata.data_source_id as string,
    group_id: event.group_id,
  }

  const notionType = TIER_TO_TYPE[proposal.tier] || "insight"

  // Handle malformed events (missing content)
  const safeContent = proposal.content || "Untitled proposal"
  const safeTier = proposal.tier || "insight"
  const safeStatus = proposal.status || "approved"

  // Build properties for Notion page
  const properties: Record<string, string | number> = {
    Title: safeContent.slice(0, 100),
    Status: safeStatus,
    Type: TIER_TO_TYPE[safeTier] || "insight",
    "Group ID": event.group_id,
    "date:Proposed At:start": (proposal.decided_at || new Date().toISOString()).slice(0, 10),
  }

  if (proposal.rationale) {
    properties["Notes"] = `Decision: ${proposal.status} by ${proposal.curator_id}\nRationale: ${proposal.rationale}`
  } else {
    properties["Notes"] = `Decision: ${proposal.status} by ${proposal.curator_id}`
  }

  properties["Notion Synced"] = "__YES__"

  const content = buildProposalContent(proposal)

  // RK-16 Fix: If a Notion client is provided, create the page directly.
  // Otherwise, fall back to the old behavior (prepare data for MCP agent).
  if (notionClient) {
    try {
      // Use CURATOR_PROPOSALS_DB_ID as the Notion database ID
      // (data_source_id is a collection:// concept, not a Notion API database_id)
      const results = await notionClient.createPages({
        parent: { data_source_id: "08d2e672-2a73-45b0-a31d-b4a7be551e16" },
        pages: [{ properties, content }],
      })

      if (!results || results.length === 0) {
        return { success: false, error: "Notion API returned empty results" }
      }

      return {
        success: true,
        pageUrl: results[0].pageUrl,
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return { success: false, error: errorMessage }
    }
  }

  // Legacy path: no direct client available, prepare data for MCP delegation
  return {
    success: true,
    pageUrl: undefined, // Agent will fill this in after MCP call
    // The agent needs to call mcp__MCP_DOCKER__notion-create-pages with:
    //   parent: { data_source_id: proposal.data_source_id }
    //   pages: [{ properties, content }]
  }
}

/**
 * Handle a Notion sync failure by routing to the DLQ.
 *
 * This function is called when the MCP Notion call fails.
 * It routes the event to the DLQ for exponential backoff retry.
 *
 * @param event - The original event that failed
 * @param error - The error message from the failed Notion call
 * @returns DLQ entry ID if successfully routed, null otherwise
 */
export async function handleNotionSyncFailure(event: NotionSyncEvent, error: string): Promise<number | null> {
  const pool = getPool()

  // Route to DLQ
  const dlqResult = await insertDlqEntry(pool, {
    groupId: event.group_id,
    originalEventId: event.id as unknown as number,
    proposalId: event.metadata.proposal_id as string | undefined,
    originalMetadata: event.metadata as Record<string, unknown>,
    errorMessage: error,
  })

  if (!dlqResult.success) {
    console.error(`[NotionSyncWorker] CRITICAL: Failed to route event ${event.id} to DLQ: ${dlqResult.error}`)
    return null
  }

  console.log(`[NotionSyncWorker] Event ${event.id} routed to DLQ (dlq_id=${dlqResult.dlqId})`)

  // Also mark the original event as failed
  await markEventFailed(String(event.id), error, event.group_id, event.metadata as Record<string, unknown>)

  return dlqResult.dlqId ?? null
}

/**
 * Process DLQ retries for a given group_id.
 *
 * Fetches retryable entries from the DLQ and attempts to re-process them.
 * This should be called on a separate schedule from the main event processing.
 *
 * @param groupId - Tenant group_id for isolation
 * @param processFn - Function to process each entry (calls MCP Notion tools)
 * @returns Number of entries processed
 */
export async function processDlqRetries(
  groupId: string,
  processFn: (entry: DlqEntry) => Promise<{ success: boolean; pageId?: string; pageUrl?: string; error?: string }>
): Promise<{ processed: number; succeeded: number; failed: number; permanentlyFailed: number }> {
  const pool = getPool()
  const entries = await getRetryableEntries(pool, groupId)

  let succeeded = 0
  let failed = 0
  let permanentlyFailed = 0

  for (const entry of entries) {
    // Mark as retrying
    const retryResult = await markEntryRetrying(pool, entry.id, groupId)
    if (!retryResult.success) {
      console.error(`[NotionSyncWorker] Failed to mark DLQ entry ${entry.id} as retrying: ${retryResult.error}`)
      continue
    }

    try {
      const result = await processFn(entry)

      if (result.success) {
        // Mark as completed in DLQ
        await markEntryCompleted(pool, entry.id, groupId, result.pageId ?? "", result.pageUrl ?? "")

        // Also append a completion event referencing the original
        if (entry.original_event_id) {
          await markEventCompleted(String(entry.original_event_id), groupId, "notion-sync-worked", result.pageUrl)
        }

        // Write Notion URL back to proposal
        if (entry.proposal_id && result.pageUrl) {
          await writeNotionUrlToProposal(entry.proposal_id, groupId, result.pageUrl)
        }

        succeeded++
      } else {
        // Mark as failed in DLQ (schedules next retry or permanent failure)
        const failResult = await markEntryFailed(
          pool,
          entry.id,
          groupId,
          result.error ?? "Unknown error during DLQ retry"
        )

        if (!failResult.success) {
          console.error(`[NotionSyncWorker] Failed to update DLQ entry ${entry.id}: ${failResult.error}`)
        }

        // Check if this was the last retry
        if (entry.retry_count + 1 >= entry.max_retries) {
          permanentlyFailed++
          console.error(
            `[NotionSyncWorker] DLQ entry ${entry.id} permanently failed after ${entry.max_retries} attempts`
          )
        }

        failed++
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Mark as failed in DLQ
      await markEntryFailed(pool, entry.id, groupId, errorMessage)

      if (entry.retry_count + 1 >= entry.max_retries) {
        permanentlyFailed++
      }

      failed++
      console.error(`[NotionSyncWorker] DLQ retry ${entry.id} threw: ${errorMessage}`)
    }
  }

  return { processed: entries.length, succeeded, failed, permanentlyFailed }
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1]?.includes("notion-sync-worker.ts")

if (isMainModule) {
  async function main() {
    console.log("[NotionSyncWorker] Starting...")

    // RK-16 Fix: Use Direct Notion API client when NOTION_API_KEY is available
    let notionClient: import("./notion-bridge").NotionMCPClient | undefined
    try {
      const { createDirectNotionClient } = await import("./direct-notion-client")
      notionClient = createDirectNotionClient()
      console.log("[NotionSyncWorker] Using direct Notion API client")
    } catch (err) {
      console.warn("[NotionSyncWorker] NOTION_API_KEY not set — falling back to MCP delegation mode")
      console.warn("[NotionSyncWorker] Events will be prepared but NOT written to Notion")
    }

    console.log("[NotionSyncWorker] Fetching pending notion_sync_pending events...")

    const events = await getPendingEvents()
    console.log(`[NotionSyncWorker] Found ${events.length} pending events`)

    for (const event of events) {
      console.log(`[NotionSyncWorker] Processing event ${event.id}...`)
      console.log(`[NotionSyncWorker] Proposal: ${event.metadata.proposal_id}`)
      console.log(`[NotionSyncWorker] Status: ${event.metadata.status}`)
      console.log(`[NotionSyncWorker] Tier: ${event.metadata.tier}`)

      const result = await processNotionSyncEvent(event, notionClient)

      if (result.success && result.pageUrl) {
        console.log(`[NotionSyncWorker] ✅ Created Notion page: ${result.pageUrl}`)
        // Mark event as completed
        await markEventCompleted(String(event.id), event.group_id, "notion-sync-direct", result.pageUrl)
        // Write Notion URL back to proposal
        if (event.metadata.proposal_id) {
          await writeNotionUrlToProposal(event.metadata.proposal_id as string, event.group_id, result.pageUrl)
        }
      } else if (result.success && !result.pageUrl) {
        console.log(`[NotionSyncWorker] Event prepared for MCP delegation (no direct client)`)
        console.log(`[NotionSyncWorker] Agent must call mcp__MCP_DOCKER__notion-create-pages`)
      } else {
        console.error(`[NotionSyncWorker] Failed: ${result.error}`)
        const dlqId = await handleNotionSyncFailure(event, result.error ?? "Unknown error")
        if (dlqId) {
          console.log(`[NotionSyncWorker] Event routed to DLQ (dlq_id=${dlqId})`)
        }
      }
    }

    // Process DLQ retries
    console.log("[NotionSyncWorker] Processing DLQ retries...")
    const dlqStats = await getDlqStats(getPool(), "allura-system")
    console.log(`[NotionSyncWorker] DLQ stats: ${JSON.stringify(dlqStats)}`)

    if (dlqStats.pending_retry > 0) {
      console.log(
        `[NotionSyncWorker] ${dlqStats.pending_retry} entries pending retry — ` +
          `run processDlqRetries() with MCP Notion tools to process them`
      )
    }

    if (dlqStats.permanently_failed > 0) {
      console.error(
        `[NotionSyncWorker] ⚠️ ${dlqStats.permanently_failed} entries permanently failed — ` +
          `human intervention required`
      )
    }

    console.log("[NotionSyncWorker] Done.")
    await closePool()
  }

  main().catch((err) => {
    console.error("[NotionSyncWorker] Fatal error:", err)
    process.exit(1)
  })
}
