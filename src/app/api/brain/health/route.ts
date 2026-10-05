/**
 * GET /api/brain/health — Brain subsystem liveness report.
 *
 * Story 24.11a AC-4. This route stays public. It is declared explicitly in
 * PUBLIC_ROUTE_MANIFEST (scope public:brain:health) with a recorded rationale:
 * audit_health_report returns subsystem status and queue depth only, never
 * memory content, so it is consistent with the other /api/health/* probes.
 *
 * If this handler is ever changed to return tenant rows, move its declaration
 * to ROUTE_SCOPE_MANIFEST.
 *
 * Fail-closed contract: the probe group is resolved only from the deployment
 * environment (ALLURA_BRAIN_PROBE_GROUP_ID) or the allura-system default —
 * never from user or request input. An invalid configured group, a Brain tool
 * error-shaped result, or a report without a valid string overall_status all
 * yield the generic 503 envelope with no backend details.
 */

import { NextResponse } from "next/server"

import { brainClient, isConfiguredBrainEndpoint } from "@/lib/brain-client"
import { isValidGroupId } from "@/lib/validation/group-id"

export const dynamic = "force-dynamic"

/** Liveness probes have no principal; the report is not tenant-scoped data. */
const DEFAULT_PROBE_GROUP_ID = "allura-system"

/**
 * Resolve the probe group from the environment only.
 * Returns null when the configured value fails the repository group-id
 * contract — the caller must then fail closed without contacting the Brain.
 */
function resolveProbeGroupId(): string | null {
  const raw = process.env.ALLURA_BRAIN_PROBE_GROUP_ID
  if (raw === undefined) return DEFAULT_PROBE_GROUP_ID
  if (raw.trim().length === 0) return null
  return isValidGroupId(raw) ? raw.trim() : null
}

/**
 * A report is trustworthy only when it is a health-report object with no tool
 * error payload and an exact allowlisted overall_status. Anything else — an
 * error-shaped MCP result (e.g. TENANT_MISMATCH), a null, a partial payload,
 * or an unrecognized status string — must not be surfaced as a healthy 200.
 */
const PUBLIC_OVERALL_STATUSES = ["healthy", "degraded", "unavailable", "unhealthy"] as const
type PublicOverallStatus = (typeof PUBLIC_OVERALL_STATUSES)[number]

function isPublicOverallStatus(status: unknown): status is PublicOverallStatus {
  return typeof status === "string"
    && (PUBLIC_OVERALL_STATUSES as readonly string[]).includes(status)
}

/**
 * Construct the bounded public body from a trusted report.
 *
 * Pike remediation (2026-10-04): the trusted MCP report is not public data.
 * audit_health_report can embed raw backend exception strings in
 * subsystems.*.detail, plus latency, counts, tool names, timestamps, and meta.
 * The public route therefore returns a newly constructed object containing
 * only the allowlisted overall_status — never the source report and never a
 * reference into it.
 */
function toPublicHealthBody(report: unknown): { overall_status: PublicOverallStatus } | null {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    return null
  }
  const record = report as Record<string, unknown>
  if (record.error !== undefined && record.error !== null) return null
  const status = record.overall_status
  return isPublicOverallStatus(status) ? { overall_status: status } : null
}

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: "Brain health check unavailable", overall_status: "unhealthy" as const },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

export async function GET(): Promise<NextResponse> {
  if (!isConfiguredBrainEndpoint()) return unavailable()
  const probeGroupId = resolveProbeGroupId()
  if (probeGroupId === null) return unavailable()
  try {
    const report = await brainClient.healthReport(probeGroupId)
    const body = toPublicHealthBody(report)
    if (body === null) return unavailable()
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return unavailable()
  }
}