/**
 * POST /api/curator/reject
 *
 * Dedicated reject endpoint. Sets status=rejected, records curator_id,
 * rationale, and decided_at. Emits a notion_sync_pending event for
 * async downstream processing.
 *
 * Reference: docs/allura/BLUEPRINT.md (F11-F12)
 */

import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { getPool } from "@/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

export async function POST(request: NextRequest) {
  const roleCheck = requireRole(request, "curator")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const body = await request.json()
    const { proposal_id, group_id, rationale } = body
    const curatorId = roleCheck.user.id

    if (!proposal_id) {
      return NextResponse.json({ error: "proposal_id is required" }, { status: 400 })
    }
    if (!group_id) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    const trimmedRationale = typeof rationale === "string" ? rationale.trim() : ""
    if (!trimmedRationale) {
      return NextResponse.json({ error: "rationale is required" }, { status: 400 })
    }

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
    const witnessPayload = `${proposal_id}|${validatedGroupId}|${proposal.content}|${proposal.score}|${proposal.tier}|reject|${decidedAt}|${curatorId}`
    const witness_hash = createHash("shake256", { outputLength: 64 }).update(witnessPayload).digest("hex")

    await pg.query(
      `UPDATE canonical_proposals
       SET status = 'rejected',
           decided_at = $1,
           decided_by = $2,
           rationale = $3,
           witness_hash = $4
       WHERE id = $5`,
        [decidedAt, curatorId, trimmedRationale, witness_hash, proposal_id]
    )

    await pg.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        validatedGroupId,
        "proposal_rejected",
        curatorId,
        "completed",
        JSON.stringify({ proposal_id, score: proposal.score, tier: proposal.tier, rationale: trimmedRationale }),
        decidedAt,
      ]
    )

    await pg.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        validatedGroupId,
        "notion_sync_pending",
        "curator-reject",
        "pending",
        JSON.stringify({
          proposal_id,
          content: proposal.content,
          score: parseFloat(proposal.score),
          tier: proposal.tier,
          status: "rejected",
          curator_id: curatorId,
          rationale: trimmedRationale,
          decided_at: decidedAt,
          data_source_id: "42894678-aedb-4c90-9371-6494a9fe5270",
        }),
        decidedAt,
      ]
    )

    return NextResponse.json({
      success: true,
      decided_at: decidedAt,
      notion_sync: "pending",
    })
  } catch (error) {
    captureException(error, { tags: { route: "/api/curator/reject", method: "POST" } })
    console.error("Failed to reject proposal:", error)
    return NextResponse.json({ error: "Failed to reject proposal" }, { status: 500 })
  }
}
