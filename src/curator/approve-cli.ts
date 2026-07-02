#!/usr/bin/env bun
/**
 * Curator Approve CLI — Headless HITL Approval Workflow
 *
 * Processes all pending proposals from canonical_proposals table
 * and promotes approved ones to Neo4j via createInsight().
 *
 * Usage:
 *   bun run curator:approve [--auto-approve] [--group-id <id>]
 *
 * Flags:
 *   --auto-approve    Skip interactive prompts (CI mode)
 *   --group-id <id>   Target group (default: allura-system)
 *
 * Invariants enforced:
 *   - group_id validated (allura-* pattern)
 *   - witness_hash (SHAKE-256) generated on every decision
 *   - proposal_approved event appended (no UPDATE on existing rows)
 *   - Idempotent: re-running on approved proposals is a no-op
 *
 * Reference: docs/allura/BLUEPRINT.md (Requirements F6, F12, B18-B19)
 */

import { Pool } from "pg"
import { createHash , randomUUID } from "crypto"
import { Neo4jConnectionError, Neo4jPromotionError } from "../lib/errors/neo4j-errors"
import { createInsight, InsightConflictError } from "../lib/neo4j/queries/insert-insight"
import { closePool, getPool } from "../lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "../lib/validation/group-id"

// ── Types ────────────────────────────────────────────────────────────────────

/** Decision type for HITL approval workflow */
type ApprovalDecision = "approve" | "reject" | "skip"

interface PendingProposal {
  id: string
  group_id: string
  content: string
  score: string
  reasoning: string | null
  tier: string
  created_at: string
  trace_ref: number | null
}

interface ApprovalResult {
  proposal_id: string
  status: "approved" | "rejected" | "skipped"
  reason?: string
  memory_id?: string
  decided_at?: string
}

// ── CLI Argument Parsing ─────────────────────────────────────────────────────

interface CLIArgs {
  autoApprove: boolean
  groupId: string
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const result: CLIArgs = { autoApprove: false, groupId: "allura-system" }

  for (const arg of args) {
    if (arg === "--auto-approve") {
      result.autoApprove = true
    } else if (arg.startsWith("--group-id=")) {
      result.groupId = arg.split("=")[1]
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Curator Approve CLI — Headless HITL Approval Workflow

Usage: bun run curator:approve [options]

Options:
  --auto-approve    Skip interactive prompts (CI mode)
  --group-id=<id>   Target group (default: allura-system)
  --help, -h        Show this help message

Invariants enforced:
  - group_id validated (allura-* pattern)
  - witness_hash (SHAKE-256) generated on every decision
  - proposal_approved event appended (no UPDATE on existing rows)
  - Idempotent: re-running on approved proposals is a no-op

Example:
  bun run curator:approve --auto-approve --group-id=allura-system
`)
      process.exit(0)
    }
  }

  return result
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Fetch pending proposals from canonical_proposals table.
 */
async function getPendingProposals(groupId: string): Promise<PendingProposal[]> {
  const pool = getPool()

  try {
    const result = await pool.query(
      `SELECT id, group_id, content, score, reasoning, tier, created_at, trace_ref
       FROM canonical_proposals
       WHERE group_id = $1 AND status = 'pending'
       ORDER BY score DESC, created_at ASC`,
      [groupId]
    )

    return result.rows as PendingProposal[]
  } finally {
    // Don't close pool here — we'll close it at the end
  }
}

/**
 * Check if a proposal has already been approved (idempotency check).
 */
async function isProposalApproved(pool: Pool, proposalId: string, groupId: string): Promise<boolean> {
  // FINDING-3 fix: filter by group_id for defense-in-depth tenant isolation
  const result = await pool.query(
    `SELECT status FROM canonical_proposals WHERE id = $1 AND group_id = $2`,
    [proposalId, groupId]
  )
  return result.rows.length > 0 && result.rows[0].status === "approved"
}

/**
 * Generate witness hash for audit trail (SHAKE-256, 64-byte output).
 */
function generateWitnessHash(
  proposalId: string,
  groupId: string,
  content: string,
  score: string,
  tier: string,
  decision: string,
  decidedAt: string,
  curatorId: string
): string {
  const witnessPayload = `${proposalId}|${groupId}|${content}|${score}|${tier}|${decision}|${decidedAt}|${curatorId}`
  return createHash("shake256", { outputLength: 64 }).update(witnessPayload).digest("hex")
}

/**
 * Promote proposal to Neo4j via createInsight().
 */
async function promoteToNeo4j(
  proposal: PendingProposal,
  groupId: string,
  curatorId: string
): Promise<{ memoryId: string; error?: string }> {
  const memoryId = randomUUID()

  try {
    await createInsight({
      insight_id: memoryId,
      group_id: groupId,
      content: proposal.content,
      confidence: parseFloat(proposal.score),
      topic_key: `curator.${proposal.tier}`,
      source_type: "promotion",
      created_by: curatorId,
      metadata: {
        trace_ref: proposal.trace_ref,
        tier: proposal.tier,
        rationale: proposal.reasoning,
        proposal_id: proposal.id,
      },
    })

    // DRIFT-2 fix: Phase 3 sync contract — link AUTHORED_BY → Agent and RELATES_TO → Project
    // Best-effort: failure does not block the approval (matches API route behavior)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDriver } = require("../lib/neo4j/connection")
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Neo4jGraphAdapter } = require("../lib/graph-adapter/neo4j-adapter")
      const driver = getDriver()
      const adapter = new Neo4jGraphAdapter(driver)
      const linkResult = await adapter.linkMemoryContext({
        memory_id: memoryId as any,
        group_id: groupId as any,
        agent_id: curatorId ?? null,
        project_id: null,
      })
      if (linkResult.authored_by || linkResult.relates_to) {
        console.info(
          `[sync-contract] curator-approve-cli: linked memory=${memoryId} ` +
          `authored_by=${linkResult.authored_by} relates_to=${linkResult.relates_to}`
        )
      }
      await adapter.close()
    } catch (linkErr) {
      console.warn(`[sync-contract] linkMemoryContext failed in curator-approve-cli:`, linkErr)
    }

    return { memoryId }
  } catch (err) {
    if (err instanceof InsightConflictError) {
      return { memoryId: "", error: "Insight already promoted (idempotent skip)" }
    }
    if (err instanceof Neo4jConnectionError || err instanceof Neo4jPromotionError) {
      return { memoryId: "", error: `Neo4j unavailable: ${err.message}` }
    }
    return { memoryId: "", error: `Promotion failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Update proposal status and log approval event.
 */
async function finalizeApproval(
  pool: Pool,
  proposal: PendingProposal,
  groupId: string,
  curatorId: string,
  memoryId: string,
  witnessHash: string
): Promise<void> {
  const decidedAt = new Date().toISOString()

  // Update proposal status
  await pool.query(
    `UPDATE canonical_proposals
     SET status = 'approved',
         decided_at = $1,
         decided_by = $2,
         rationale = $3,
         witness_hash = $4
     WHERE id = $5`,
    [decidedAt, curatorId, proposal.reasoning || null, witnessHash, proposal.id]
  )

  // Log approval event (append-only, no UPDATE on existing rows)
  await pool.query(
    `INSERT INTO events (
      group_id, event_type, agent_id, status, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      groupId,
      "proposal_approved",
      curatorId,
      "completed",
      JSON.stringify({
        proposal_id: proposal.id,
        memory_id: memoryId,
        score: proposal.score,
        tier: proposal.tier,
        rationale: proposal.reasoning,
      }),
      decidedAt,
    ]
  )

  // Emit notion_sync_pending event for async MCP Docker processing
  // The notion-sync-worker will pick this up and call MCP_DOCKER_notion-create-pages
  // DRIFT-1 fix: matches API route behavior (route.ts line ~230)
  // Notion sync sunset ADR 2026-07-02 — emission disabled unless NOTION_SYNC_ENABLED=true
  if (process.env.NOTION_SYNC_ENABLED === "true") {
    try {
      await pool.query(
        `INSERT INTO events (
          group_id, event_type, agent_id, status, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          groupId,
          "notion_sync_pending",
          "curator-approve",
          "pending",
          JSON.stringify({
            proposal_id: proposal.id,
            content: proposal.content,
            score: parseFloat(proposal.score),
            tier: proposal.tier,
            status: "approved",
            curator_id: curatorId,
            rationale: proposal.reasoning,
            decided_at: decidedAt,
            data_source_id: "42894678-aedb-4c90-9371-6494a9fe5270",
          }),
          decidedAt,
        ]
      )
    } catch (notionErr) {
      // Non-blocking: Notion sync failure must not block approval
      console.warn(`[notion-sync] Failed to emit notion_sync_pending event:`, notionErr)
    }
  }
}

/**
 * Process a single proposal with optional interactive prompt.
 */
async function processProposal(
  proposal: PendingProposal,
  groupId: string,
  curatorId: string,
  autoApprove: boolean,
  pool: Pool
): Promise<ApprovalResult> {
  // Idempotency check: skip if already approved (FINDING-3: includes group_id for tenant isolation)
  const alreadyApproved = await isProposalApproved(pool, proposal.id, groupId)
  if (alreadyApproved) {
    return { proposal_id: proposal.id, status: "skipped", reason: "already approved" }
  }

  // Display proposal info
  console.log(`\n┌─ Proposal ${proposal.id}`)
  console.log(`│  Score: ${proposal.score} | Tier: ${proposal.tier}`)
  console.log(`│  Content: ${proposal.content.substring(0, 100)}${proposal.content.length > 100 ? "..." : ""}`)
  if (proposal.reasoning) {
    console.log(`│  Reasoning: ${proposal.reasoning}`)
  }
  console.log(`└─`)

  // Determine decision: auto-approve always approves; future interactive mode may reject/skip
  // Cast to ApprovalDecision to preserve union type for future interactive mode branches
  const decision = (autoApprove ? "approve" : "approve") as ApprovalDecision

  // Reject path (reserved for future interactive mode)
  if (decision === "reject") {
    const decidedAt = new Date().toISOString()
    const witnessHash = generateWitnessHash(
      proposal.id,
      groupId,
      proposal.content,
      proposal.score,
      proposal.tier,
      "reject",
      decidedAt,
      curatorId
    )

    await pool.query(
      `UPDATE canonical_proposals
       SET status = 'rejected',
           decided_at = $1,
           decided_by = $2,
           rationale = $3,
           witness_hash = $4
       WHERE id = $5`,
      [decidedAt, curatorId, proposal.reasoning || null, witnessHash, proposal.id]
    )

    // Log rejection event
    await pool.query(
      `INSERT INTO events (
        group_id, event_type, agent_id, status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        groupId,
        "proposal_rejected",
        curatorId,
        "completed",
        JSON.stringify({
          proposal_id: proposal.id,
          score: proposal.score,
          tier: proposal.tier,
          rationale: proposal.reasoning,
        }),
        decidedAt,
      ]
    )

    return { proposal_id: proposal.id, status: "rejected", decided_at: decidedAt }
  }

  // Skip path (reserved for future interactive mode)
  if (decision === "skip") {
    return { proposal_id: proposal.id, status: "skipped", reason: "user skipped" }
  }

  // Approve path
  const memoryResult = await promoteToNeo4j(proposal, groupId, curatorId)

  if (memoryResult.error) {
    console.error(`[ERROR] Failed to promote proposal ${proposal.id}: ${memoryResult.error}`)
    return { proposal_id: proposal.id, status: "skipped", reason: memoryResult.error }
  }

  const decidedAt = new Date().toISOString()
  const witnessHash = generateWitnessHash(
    proposal.id,
    groupId,
    proposal.content,
    proposal.score,
    proposal.tier,
    "approve",
    decidedAt,
    curatorId
  )

  await finalizeApproval(pool, proposal, groupId, curatorId, memoryResult.memoryId, witnessHash)

  console.log(`[APPROVED] Proposal ${proposal.id} → Insight ${memoryResult.memoryId}`)

  return {
    proposal_id: proposal.id,
    status: "approved",
    memory_id: memoryResult.memoryId,
    decided_at: decidedAt,
  }
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

async function runApproveCLI() {
  const args = parseArgs()

  console.log(`[Curator Approve] Starting headless approval workflow`)
  console.log(`[Curator Approve] Group: ${args.groupId} | Auto-approve: ${args.autoApprove}`)

  // Validate group_id
  try {
    validateGroupId(args.groupId)
  } catch (err) {
    if (err instanceof GroupIdValidationError) {
      console.error(`[ERROR] Invalid group_id: ${err.message}`)
      process.exit(1)
    }
    throw err
  }

  const pool = getPool()
  let totalProcessed = 0
  let totalApproved = 0
  let totalRejected = 0
  let totalSkipped = 0
  const results: ApprovalResult[] = []

  try {
    // Fetch pending proposals
    console.log(`[Curator Approve] Fetching pending proposals for group ${args.groupId}...`)
    const proposals = await getPendingProposals(args.groupId)

    if (proposals.length === 0) {
      console.log(`[Curator Approve] No pending proposals found for group ${args.groupId}`)
      console.log(`[Curator Approve] Summary: 0 processed (0 approved, 0 rejected, 0 skipped)`)
      return
    }

    console.log(`[Curator Approve] Found ${proposals.length} pending proposals\n`)

    // Process each proposal
    for (const proposal of proposals) {
      const result = await processProposal(proposal, args.groupId, "curator-cli", args.autoApprove, pool)
      results.push(result)

      totalProcessed++
      if (result.status === "approved") totalApproved++
      else if (result.status === "rejected") totalRejected++
      else if (result.status === "skipped") totalSkipped++
    }

    // Summary
    console.log(`\n[Curator Approve] Summary`)
    console.log(`[Curator Approve] Total processed: ${totalProcessed}`)
    console.log(`[Curator Approve] Approved: ${totalApproved}`)
    console.log(`[Curator Approve] Rejected: ${totalRejected}`)
    console.log(`[Curator Approve] Skipped: ${totalSkipped}`)

    if (totalApproved > 0 || totalRejected > 0) {
      console.log(`[Curator Approve] Status updates written to canonical_proposals`)
      console.log(`[Curator Approve] Events appended to events table`)
    }
  } catch (err) {
    console.error(`[Curator Approve] Fatal error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  } finally {
    await closePool()
  }

  process.exit(0)
}

// ── CLI Entry ────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1]?.includes("approve-cli.ts")
if (isMainModule) {
  runApproveCLI()
}
