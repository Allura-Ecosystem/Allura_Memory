/**
 * Curator Approve/Reject API
 *
 * POST /api/curator/approve - Approve or reject a proposal
 *
 * Reference: docs/allura/BLUEPRINT.md (Requirements F11-F12, B18-B19)
 *
 * ## Notion Integration (P0 — AD-CURATOR-NOTION)
 *
 * On approve/reject, a Notion page is created in the Curator Proposals
 * database. This is NON-BLOCKING — if the Notion MCP call fails,
 * the approval state machine still completes. The Notion page URL
 * is written back to the proposal's rationale field for traceability.
 *
 * Idempotency: Before creating a new page, we check if one already
 * exists (via the [notion-page:...] marker in rationale).
 */

import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { Neo4jConnectionError, Neo4jPromotionError } from "@/lib/errors/neo4j-errors"
import { ApprovalAuditAuthorizationError, logApprovalEvent, logProposalNeedsEvidenceEvent, SegregationOfDutiesError } from "@/lib/memory/approval-audit"
import { captureException } from "@/lib/observability/sentry"
import { getPool } from "@/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

const DEFAULT_GROUP_ID = process.env.DEFAULT_GROUP_ID || "allura-system"

function deterministicMemoryId(proposalId: string, groupId: string): string {
  const hex = createHash("sha256").update(`${groupId}:${proposalId}`).digest("hex")
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

async function getProposalRequester(pg: ReturnType<typeof getPool>, traceRef: unknown, groupId: string): Promise<string | undefined> {
  if (traceRef === null || traceRef === undefined) return undefined

  const result = await pg.query<{ agent_id: string | null }>(
    `SELECT agent_id
     FROM events
     WHERE id = $1 AND group_id = $2
     LIMIT 1`,
    [traceRef, groupId]
  )

  return result.rows[0]?.agent_id ?? undefined
}

async function updateProposalDecision(
  pg: Pick<ReturnType<typeof getPool>, "query">,
  params: {
    proposalId: string
    groupId: string
    status: "approved" | "rejected" | "pending"
    decision?: "needs_evidence"
    decidedAt: string
    curatorId: string
    rationale: string
    witnessHash: string
  }
): Promise<boolean> {
  const result = await pg.query(
    `UPDATE canonical_proposals
     SET status = $1,
         decided_at = $2,
         decided_by = $3,
         rationale = $4,
         witness_hash = $5
     WHERE id = $6
       AND group_id = $7
       AND status = 'pending'`,
    [
      params.status,
      params.decidedAt,
      params.curatorId,
      params.rationale,
      params.witnessHash,
      params.proposalId,
      params.groupId,
    ]
  )

  return !("rowCount" in result) || result.rowCount !== 0
}

async function withDecisionTransaction<T>(pg: ReturnType<typeof getPool>, action: (client: Pick<ReturnType<typeof getPool>, "query">) => Promise<T>): Promise<T> {
  if (!("connect" in pg) || typeof pg.connect !== "function") {
    return action(pg)
  }

  const client = await pg.connect()
  try {
    await client.query("BEGIN")
    const result = await action(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function enqueueNotionSync(
  queryable: Pick<ReturnType<typeof getPool>, "query">,
  params: {
    groupId: string
    proposalId: string
    content: string
    score: number
    tier: string
    status: "approved" | "rejected" | "pending"
    decision?: "needs_evidence"
    curatorId: string
    rationale: string
    decidedAt: string
  }
): Promise<void> {
  await queryable.query(
    `INSERT INTO events (
      group_id, event_type, agent_id, status, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.groupId,
      "notion_sync_pending",
      "curator-approve",
      "pending",
      JSON.stringify({
        proposal_id: params.proposalId,
        content: params.content,
        score: params.score,
        tier: params.tier,
        status: params.status,
        decision: params.decision,
        curator_id: params.curatorId,
        rationale: params.rationale,
        decided_at: params.decidedAt,
        data_source_id: "42894678-aedb-4c90-9371-6494a9fe5270",
      }),
      params.decidedAt,
    ]
  )
}

async function enqueuePromotionSync(
  queryable: Pick<ReturnType<typeof getPool>, "query">,
  params: {
    groupId: string
    proposalId: string
    memoryId: string
    content: string
    score: number
    tier: string
    traceRef: unknown
    curatorId: string
    requestedBy?: string
    rationale: string
    decidedAt: string
  }
): Promise<void> {
  await queryable.query(
    `INSERT INTO events (
      group_id, event_type, agent_id, status, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.groupId,
      "promotion_sync_pending",
      "curator-approve",
      "pending",
      JSON.stringify({
        proposal_id: params.proposalId,
        memory_id: params.memoryId,
        content: params.content,
        score: params.score,
        tier: params.tier,
        trace_ref: params.traceRef ?? null,
        curator_id: params.curatorId,
        requested_by: params.requestedBy ?? null,
        agent_id: params.requestedBy ?? null,
        rationale: params.rationale,
        decided_at: params.decidedAt,
      }),
      params.decidedAt,
    ]
  )
}

/**
 * POST /api/curator/approve
 *
 * Body:
 * - proposal_id: Required
 * - group_id: Required tenant identifier
 * - decision: 'approve' | 'reject' | 'request_evidence'
 * - curator_id: Ignored if supplied; server derives curator identity from auth
 * - rationale: Required human reasoning
 */
export async function POST(request: NextRequest) {
  // Auth: require curator or admin role
  const roleCheck = requireRole(request, "curator")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const body = await request.json()
    const { proposal_id, group_id, decision, rationale } = body
    const authenticatedUser = roleCheck.user
    const curatorId = authenticatedUser.id

    // Validate required fields
    if (!proposal_id) {
      return NextResponse.json({ error: "proposal_id is required" }, { status: 400 })
    }

    if (!group_id) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    if (!decision || !["approve", "reject", "request_evidence"].includes(decision)) {
      return NextResponse.json({ error: "decision must be 'approve', 'reject', or 'request_evidence'" }, { status: 400 })
    }

    if (typeof rationale !== "string" || rationale.trim().length === 0) {
      return NextResponse.json({ error: "rationale is required for curator decisions" }, { status: 400 })
    }

    const decisionRationale = rationale.trim()

    // Validate group_id format (ARCH-001: enforces allura-* pattern)
    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(group_id)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const pg = getPool()

    // Fetch proposal
    const proposalResult = await pg.query(
      `SELECT id, group_id, content, score, reasoning, tier, status, trace_ref
       FROM canonical_proposals
       WHERE id = $1 AND group_id = $2`,
      [proposal_id, validatedGroupId]
    )

    if (proposalResult.rows.length === 0) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 })
    }

    const proposal = proposalResult.rows[0]

    if (proposal.status !== "pending") {
      return NextResponse.json({ error: `Proposal already ${proposal.status}` }, { status: 400 })
    }

    const decidedAt = new Date().toISOString()
    const proposalRequester = await getProposalRequester(pg, proposal.trace_ref, validatedGroupId)
    if (decision === "approve" && !proposalRequester) {
      return NextResponse.json(
        { error: "Proposal requester provenance is required before approval" },
        { status: 403 }
      )
    }
    if (proposalRequester && proposalRequester === curatorId) {
      return NextResponse.json(
        { error: `Segregation of duties violation: requester and approver must be different actors (${curatorId})` },
        { status: 403 }
      )
    }
    const witnessPayload = `${proposal_id}|${validatedGroupId}|${proposal.content}|${proposal.score}|${proposal.tier}|${decision}|${decidedAt}|${curatorId}`
    // SHAKE-256 per spec (AD-CURATOR-WITNESS) — 64-byte output matches SHA-256 security level
    const witness_hash = createHash("shake256", { outputLength: 64 }).update(witnessPayload).digest("hex")

    if (decision === "request_evidence") {
      await withDecisionTransaction(pg, async (client) => {
        await logProposalNeedsEvidenceEvent({
          proposal_id,
          group_id: validatedGroupId,
          memory_id: proposal.trace_ref ?? proposal_id,
          requested_by: proposalRequester,
          curator_id: curatorId,
          decision_actor_role: authenticatedUser.role,
          decision: "needs_evidence",
          resulting_status: "pending",
          rationale: decisionRationale,
          score: parseFloat(proposal.score),
          tier: proposal.tier,
          approved_at: decidedAt,
        }, client as any)

        await enqueueNotionSync(client, {
          groupId: validatedGroupId,
          proposalId: proposal_id,
          content: proposal.content,
          score: parseFloat(proposal.score),
          tier: proposal.tier,
          status: "pending",
          decision: "needs_evidence",
          curatorId,
          rationale: decisionRationale,
          decidedAt,
        })
      })

      return NextResponse.json({
        success: true,
        decided_at: decidedAt,
        notion_sync: "pending",
        receipt: {
          proposal_id,
          group_id: validatedGroupId,
          decision: "needs_evidence",
          previous_status: "pending",
          resulting_status: "pending",
          promoted_memory_id: null,
          actor: curatorId,
          rationale: decisionRationale,
          decided_at: decidedAt,
          notion_sync: "pending",
        },
      })
    }

    if (decision === "approve") {
      // Queue governed Neo4j promotion via durable PostgreSQL outbox.
      const memoryId = deterministicMemoryId(proposal_id, validatedGroupId)

      const transitioned = await withDecisionTransaction(pg, async (client) => {
        const didTransition = await updateProposalDecision(client, {
          proposalId: proposal_id,
          groupId: validatedGroupId,
          status: "approved",
          decidedAt,
          curatorId,
          rationale: decisionRationale,
          witnessHash: witness_hash,
        })
        if (!didTransition) return false

        await logApprovalEvent(
          {
            proposal_id,
            group_id: validatedGroupId,
            memory_id: memoryId,
            requested_by: proposalRequester,
            curator_id: curatorId,
            decision_actor_role: authenticatedUser.role,
            decision: "approved",
            resulting_status: "approved",
            rationale: decisionRationale,
            score: parseFloat(proposal.score),
            tier: proposal.tier,
            approved_at: decidedAt,
          },
          client as any
        )

        const agentId = proposalRequester ?? null
        const promotionAuthorship = { agent_id: proposalRequester ?? null, agentId }
        await enqueuePromotionSync(client, {
          groupId: validatedGroupId,
          proposalId: proposal_id,
          memoryId,
          content: proposal.content,
          score: parseFloat(proposal.score),
          tier: proposal.tier,
          traceRef: proposal.trace_ref,
          curatorId,
          requestedBy: promotionAuthorship.agentId ?? undefined,
          rationale: decisionRationale,
          decidedAt,
        })

        await enqueueNotionSync(client, {
          groupId: validatedGroupId,
          proposalId: proposal_id,
          content: proposal.content,
          score: parseFloat(proposal.score),
          tier: proposal.tier,
          status: "approved",
          curatorId,
          rationale: decisionRationale,
          decidedAt,
        })

        return true
      })
      if (!transitioned) {
        return NextResponse.json({ error: "Proposal is no longer pending" }, { status: 409 })
      }

      return NextResponse.json({
        success: true,
        memory_id: memoryId,
        decided_at: decidedAt,
        notion_sync: "pending",
        promotion_sync: "pending",
        receipt: {
          proposal_id,
          group_id: validatedGroupId,
          decision: "approved",
          previous_status: "pending",
          resulting_status: "approved",
          promoted_memory_id: memoryId,
          queued_memory_id: memoryId,
          actor: curatorId,
          rationale: decisionRationale,
          decided_at: decidedAt,
          notion_sync: "pending",
        },
      })
    } else {
      const transitioned = await withDecisionTransaction(pg, async (client) => {
        const didTransition = await updateProposalDecision(client, {
          proposalId: proposal_id,
          groupId: validatedGroupId,
          status: "rejected",
          decidedAt,
          curatorId,
          rationale: decisionRationale,
          witnessHash: witness_hash,
        })
        if (!didTransition) return false

        await logApprovalEvent(
          {
            proposal_id,
            group_id: validatedGroupId,
            memory_id: proposal.trace_ref ?? proposal_id,
            requested_by: proposalRequester,
            curator_id: curatorId,
            decision_actor_role: authenticatedUser.role,
            decision: "rejected",
            rationale: decisionRationale,
            score: parseFloat(proposal.score),
            tier: proposal.tier,
            approved_at: decidedAt,
          },
          client as any
        )

        await enqueueNotionSync(client, {
          groupId: validatedGroupId,
          proposalId: proposal_id,
          content: proposal.content,
          score: parseFloat(proposal.score),
          tier: proposal.tier,
          status: "rejected",
          curatorId,
          rationale: decisionRationale,
          decidedAt,
        })

        return true
      })
      if (!transitioned) {
        return NextResponse.json({ error: "Proposal is no longer pending" }, { status: 409 })
      }

      return NextResponse.json({
        success: true,
        decided_at: decidedAt,
        notion_sync: "pending",
        receipt: {
          proposal_id,
          group_id: validatedGroupId,
          decision: "rejected",
          previous_status: "pending",
          resulting_status: "rejected",
          promoted_memory_id: null,
          actor: curatorId,
          rationale: decisionRationale,
          decided_at: decidedAt,
          notion_sync: "pending",
        },
      })
    }
  } catch (error) {
    if (error instanceof SegregationOfDutiesError || error instanceof ApprovalAuditAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof Neo4jConnectionError || error instanceof Neo4jPromotionError) {
      captureException(error, {
        tags: { route: "/api/curator/approve", method: "POST", error_type: "neo4j_unavailable" },
      })
      return NextResponse.json({ error: "Neo4j unavailable" }, { status: 503 })
    }
    captureException(error, { tags: { route: "/api/curator/approve", method: "POST" } })
    console.error("Failed to process curator decision:", error)
    return NextResponse.json({ error: "Failed to process curator decision" }, { status: 500 })
  }
}
