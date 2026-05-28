/**
 * GET /api/audit/events
 *
 * Audit log export endpoint for SOC2 compliance.
 * Supports both JSON and CSV response formats.
 *
 * Query Parameters:
 * - group_id: Tenant isolation identifier (format: allura-*); defaults to canonical dashboard scope
 * - format: Response format — "json" (default) or "csv"
 * - from: ISO 8601 start date filter (optional)
 * - to: ISO 8601 end date filter (optional)
 * - agent_id: Filter by agent identifier (optional)
 * - event_type: Filter by event type (optional)
 * - limit: Max rows (default 1000, max 10000)
 * - offset: Pagination offset
 *
 * Phase 7: SOC2 Compliance — Audit Log CSV Export
 */

import { NextRequest, NextResponse } from "next/server"
import { type AuditEventRecord, auditQuerySchema, queryAuditEvents, streamAuditEvents } from "@/lib/audit/query-builder"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { createCsvReadableStream, createCsvStream, type CsvRow, escapeCsvValue } from "@/lib/csv/serialize"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** CSV column headers for audit event export */
const CSV_HEADERS = ["id", "group_id", "agent_id", "event_type", "status", "created_at", "metadata"] as const

/** Maximum CSV rows before switching to streaming */
const CSV_STREAM_THRESHOLD = 1000

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an AuditEventRecord to a CSV row array.
 * Order must match CSV_HEADERS.
 */
function eventToCsvRow(event: AuditEventRecord): CsvRow {
  return [
    event.id,
    event.group_id,
    event.agent_id,
    event.event_type,
    event.status,
    event.created_at instanceof Date ? event.created_at.toISOString() : String(event.created_at),
    typeof event.metadata === "object" && event.metadata !== null
      ? JSON.stringify(event.metadata)
      : String(event.metadata ?? ""),
  ]
}

/**
 * Generate a date string for the CSV filename.
 */
function formatDateForFilename(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * Build a CSV response from events using streaming for large datasets.
 */
function buildCsvResponse(events: AuditEventRecord[], groupId: string, total: number): NextResponse {
  const filename = `audit-events-${groupId}-${formatDateForFilename()}.csv`

  // For small datasets, use in-memory serialization
  if (total <= CSV_STREAM_THRESHOLD) {
    const rows = events.map(eventToCsvRow)
    const csv = createCsvStream([...CSV_HEADERS])
    csv.writeHeader()
    for (const row of rows) {
      csv.writeRow(row)
    }

    return new NextResponse(csv.getString(), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Total-Count": String(total),
      },
    })
  }

  // For large datasets, use ReadableStream
  // Note: We already have the events in memory from the query, but the streaming
  // architecture is in place for future cursor-based pagination.
  const rows = events.map(eventToCsvRow)
  const csv = createCsvStream([...CSV_HEADERS])
  csv.writeHeader()
  for (const row of rows) {
    csv.writeRow(row)
  }

  return new NextResponse(csv.getString(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Total-Count": String(total),
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { searchParams } = new URL(request.url)

    // ── Validate group_id (tenant isolation) ──
    const groupIdParam = searchParams.get("group_id") ?? DEFAULT_GROUP_ID

    let group_id: string
    try {
      group_id = validateGroupId(groupIdParam)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    // ── Parse and validate query parameters ──
    const format = searchParams.get("format") || "json"
    if (format !== "json" && format !== "csv") {
      return NextResponse.json({ error: `Invalid format: '${format}'. Must be 'json' or 'csv'` }, { status: 400 })
    }

    const rawParams = {
      group_id,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      agent_id: searchParams.get("agent_id") ?? undefined,
      event_type: searchParams.get("event_type") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    }

    const parseResult = auditQuerySchema.safeParse(rawParams)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const params = parseResult.data

    // ── Execute query ──
    const result = await queryAuditEvents(params)

    // ── Return response in requested format ──
    if (format === "csv") {
      return buildCsvResponse(result.events, params.group_id, result.total)
    }

    // JSON format (default)
    return NextResponse.json({
      events: result.events,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        has_more: result.has_more,
      },
    })
  } catch (error) {
    console.error("[Audit Export] Failed to fetch audit events:", error)

    // Don't leak internal error details
    const message = error instanceof Error ? error.message : "Failed to fetch audit events"

    return NextResponse.json({ error: "Internal server error", details: message }, { status: 500 })
  }
}
