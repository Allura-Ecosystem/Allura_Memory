/**
 * Skill Usage Tracking API — Story 1.2
 *
 * GET /api/tracking/skill-usage?group_id=X[&skill_name=Y][&since=ISO8601]
 *
 * Returns a usage summary (count, success rate, avg tokens, avg duration) per
 * skill_name for the given tenant group_id. Reads flow through the controlPlane
 * `syscall_query` path (AD-40 compliance for the read side as well).
 *
 * Query params:
 *   group_id   — Required tenant identifier (allura-* format).
 *   skill_name — Optional filter for a single skill.
 *   since      — Optional ISO-8601 timestamp; only include events at or after.
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import {
  SkillUsageValidationError,
  getSkillUsageSummary,
} from "@/lib/tracking/skill-usage-tracker"

// Always render live — analytics should never be statically cached.
export const dynamic = "force-dynamic"

// ── Helpers ─────────────────────────────────────────────────────────────────

function handle(error: unknown): NextResponse {
  if (error instanceof GroupIdValidationError) {
    return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
  }
  if (error instanceof SkillUsageValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  console.error("skill-usage API error:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

// ── GET /api/tracking/skill-usage ────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)

    const groupIdParam = searchParams.get("group_id")
    if (!groupIdParam) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(groupIdParam)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const skillName = searchParams.get("skill_name") ?? undefined
    const sinceParam = searchParams.get("since") ?? undefined
    let since: Date | undefined
    if (sinceParam) {
      const parsed = new Date(sinceParam)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: `Invalid 'since' timestamp: ${sinceParam}` }, { status: 400 })
      }
      since = parsed
    }

    const summary = await getSkillUsageSummary({
      group_id: validatedGroupId,
      skill_name: skillName ?? undefined,
      since,
    })

    // Aggregate top-level totals across all skills in this group
    const totals = summary.reduce(
      (acc, row) => {
        acc.total_count += row.total_count
        acc.success_count += row.success_count
        acc.failure_count += row.failure_count
        return acc
      },
      { total_count: 0, success_count: 0, failure_count: 0 },
    )
    const overall_success_rate_pct =
      totals.total_count > 0
        ? Number(((100.0 * totals.success_count) / totals.total_count).toFixed(2))
        : 0

    return NextResponse.json(
      {
        group_id: validatedGroupId,
        skill_name: skillName ?? null,
        since: since?.toISOString() ?? null,
        totals: {
          ...totals,
          success_rate_pct: overall_success_rate_pct,
          skill_count: summary.length,
        },
        skills: summary,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    )
  } catch (error) {
    return handle(error)
  }
}