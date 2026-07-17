/**
 * POST /api/genesis/proposals/approve
 * Story 2.2: Genesis Engine — HITL approve gate.
 *
 * Approves a `proposed` pattern proposal. On approval a skill template draft
 * (Markdown) is generated and returned — it is NOT auto-deployed.
 *
 * The UPDATE flows through the kernel `syscall_mutate` path (AD-40) so it
 * is kernel-gated, proof-stamped, and audit-trailed. The DB trigger on
 * `pattern_proposals` restricts UPDATE to status / reviewed_at.
 *
 * Body:
 * - group_id: Required tenant namespace (format: allura-*).
 * - proposal_id: Required id of the proposal to approve.
 *
 * Auth: requires curator role or above.
 */

import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { captureException } from "@/lib/observability/sentry";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";
import { reviewProposal, generateSkillTemplateDraft } from "@/lib/genesis/proposal-generator";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const roleCheck = requireRole(request, "curator");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be JSON" },
        { status: 400 }
      );
    }

    const { group_id, proposal_id } = body as {
      group_id?: unknown;
      proposal_id?: unknown;
    };

    // ── Validate group_id ──
    if (typeof group_id !== "string" || group_id.length === 0) {
      return NextResponse.json(
        { error: "group_id is required" },
        { status: 400 }
      );
    }
    let validatedGroupId: string;
    try {
      validatedGroupId = validateGroupId(group_id);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    // ── Validate proposal_id ──
    if (typeof proposal_id !== "number" || !Number.isInteger(proposal_id)) {
      return NextResponse.json(
        { error: "proposal_id is required and must be an integer" },
        { status: 400 }
      );
    }

    // ── Guard: only `proposed` proposals can be approved ──
    const pool = getPool();
    const existing = await pool.query(
      `SELECT status FROM pattern_proposals WHERE id = $1 AND group_id = $2`,
      [proposal_id, validatedGroupId]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: `Proposal ${proposal_id} not found in group ${validatedGroupId}` },
        { status: 404 }
      );
    }
    const currentStatus = existing.rows[0].status;
    if (currentStatus !== "proposed") {
      return NextResponse.json(
        { error: `Proposal ${proposal_id} is already ${currentStatus}; only proposed proposals can be approved` },
        { status: 409 }
      );
    }

    // ── Apply the approval through the kernel syscall_mutate path ──
    const result = await reviewProposal(validatedGroupId, proposal_id, "approved");
    if (!result.updated) {
      return NextResponse.json(
        { error: result.error ?? "Failed to approve proposal" },
        { status: 500 }
      );
    }

    // ── Generate skill template draft (not auto-deployed) ──
    const skill_template = result.skill_template ?? generateSkillTemplateDraft(validatedGroupId, proposal_id);

    return NextResponse.json({
      proposal_id,
      status: "approved",
      reviewed_at: new Date().toISOString(),
      skill_template,
    });
  } catch (error) {
    captureException(error, { tags: { route: "/api/genesis/proposals/approve", method: "POST" } });
    console.error("[/api/genesis/proposals/approve] Failed to approve proposal:", error);
    const message = error instanceof Error ? error.message : "Failed to approve proposal";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}