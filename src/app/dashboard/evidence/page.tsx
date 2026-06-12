import type { Metadata } from "next"
import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"

export const metadata: Metadata = {
  title: "Evidence",
}

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

// Evidence packet types from types.ts
const EVIDENCE_TYPES = [
  "all",
  "general",
  "gate_result",
  "review",
  "approval",
  "test_result",
  "audit",
] as const

type EvidenceTypeFilter = (typeof EVIDENCE_TYPES)[number]

interface EvidencePacketRow {
  id: string
  work_item_id: string | null
  run_id: string | null
  step_id: string | null
  actor_id: string
  packet_type: string
  content: Record<string, unknown>
  artifact_refs: string[] | null
  created_at: Date
}

interface EvidenceData {
  packets: EvidencePacketRow[]
  typeFilter: EvidenceTypeFilter
  workItemId: string | null
  runId: string | null
}

async function loadEvidence(
  typeFilter: EvidenceTypeFilter,
  workItemId: string | null,
  runId: string | null,
): Promise<EvidenceData | null> {
  let pool
  try {
    pool = getPool()
  } catch {
    return null
  }

  try {
    const conditions: string[] = ["group_id = $1"]
    const values: unknown[] = [GROUP_ID]
    let paramIdx = 2

    if (typeFilter !== "all") {
      conditions.push(`packet_type = $${paramIdx}`)
      values.push(typeFilter)
      paramIdx++
    }

    if (workItemId) {
      conditions.push(`work_item_id = $${paramIdx}`)
      values.push(workItemId)
      paramIdx++
    }

    if (runId) {
      conditions.push(`run_id = $${paramIdx}`)
      values.push(runId)
      paramIdx++
    }

    const result = await pool.query<EvidencePacketRow>(
      `SELECT id, work_item_id, run_id, step_id, actor_id, packet_type, content, artifact_refs, created_at
       FROM evidence_packets
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 100`,
      values,
    )

    return {
      packets: result.rows,
      typeFilter,
      workItemId,
      runId,
    }
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      return null
    }
    return { packets: [], typeFilter, workItemId, runId }
  }
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e8e3d8",
  borderRadius: 10,
  background: "#fff",
  overflow: "hidden",
}

const sectionHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 20px",
  borderBottom: "1px solid #f0ece0",
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#1a1a1a",
  letterSpacing: "-0.01em",
  margin: 0,
}

const countBadgeStyle = (count: number): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  borderRadius: 999,
  background: count > 0 ? "#2563eb" : "#f3f4f6",
  color: count > 0 ? "#fff" : "#6b7280",
  fontSize: 11,
  fontWeight: 700,
  padding: "0 6px",
})

const emptyStyle: React.CSSProperties = {
  padding: "16px 20px",
  fontSize: 13,
  color: "#9ca3af",
  fontStyle: "italic",
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "12px 20px",
  borderBottom: "1px solid #f9f8f5",
  fontSize: 13,
  color: "#374151",
}

const monoStyle: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 11,
  color: "#6b7280",
}

const typePillStyle = (type: string): React.CSSProperties => {
  const map: Record<string, { bg: string; color: string }> = {
    test_result: { bg: "#dbeafe", color: "var(--allura-blue)" },
    gate_result: { bg: "#fef3c7", color: "#92400e" },
    approval: { bg: "#d1fae5", color: "#065f46" },
    review: { bg: "#ede9fe", color: "#5b21b6" },
    audit: { bg: "#f3f4f6", color: "#374151" },
    general: { bg: "#f9f8f5", color: "#6b7280" },
  }
  const style = map[type] ?? { bg: "#f3f4f6", color: "#6b7280" }
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: style.bg,
    color: style.color,
    flexShrink: 0,
    whiteSpace: "nowrap",
  }
}

interface PageSearchParams {
  type?: string
  work_item_id?: string
  run_id?: string
}

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>
}) {
  const resolvedParams = await searchParams
  const rawType = resolvedParams.type ?? "all"
  const typeFilter: EvidenceTypeFilter =
    (EVIDENCE_TYPES as readonly string[]).includes(rawType)
      ? (rawType as EvidenceTypeFilter)
      : "all"
  const workItemId = resolvedParams.work_item_id ?? null
  const runId = resolvedParams.run_id ?? null

  const data = await loadEvidence(typeFilter, workItemId, runId)

  if (!data) {
    return (
      <div style={{ padding: "32px" }}>
        <PageHeader />
        <div
          style={{
            padding: "24px 20px",
            border: "1px solid #fecaca",
            borderRadius: 10,
            background: "#fff",
            color: "#991b1b",
            fontSize: 14,
          }}
        >
          Cannot load Evidence. Check PostgreSQL connectivity.
        </div>
      </div>
    )
  }

  const { packets } = data

  return (
    <div style={{ padding: "32px", maxWidth: 900 }}>
      <PageHeader />

      {/* Type filter tabs */}
      <TypeFilterTabs active={typeFilter} workItemId={workItemId} runId={runId} />

      {/* Active filters display */}
      {(workItemId || runId) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
            padding: "8px 12px",
            background: "#eff6ff",
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--allura-blue)", fontWeight: 600 }}>Filters:</span>
          {workItemId && (
            <span style={monoStyle}>work_item: {workItemId.slice(0, 16)}</span>
          )}
          {runId && (
            <span style={monoStyle}>run: {runId.slice(0, 16)}</span>
          )}
          <a
            href={`/dashboard/evidence?type=${typeFilter}`}
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#2563eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Clear
          </a>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>
            Evidence Packets
            {typeFilter !== "all" && ` — ${typeFilter.replace("_", " ")}`}
          </h2>
          <span style={countBadgeStyle(packets.length)}>{packets.length}</span>
        </div>
        {packets.length === 0 ? (
          <div style={emptyStyle}>No evidence packets found</div>
        ) : (
          packets.map((packet) => (
            <div key={packet.id} style={rowStyle}>
              <span style={{ ...monoStyle, paddingTop: 2 }}>{packet.id.slice(0, 8)}</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={typePillStyle(packet.packet_type)}>{packet.packet_type.replace("_", " ")}</span>
                  <span style={{ ...monoStyle, color: "#374151" }}>{packet.actor_id}</span>
                  <span style={{ ...monoStyle, marginLeft: "auto" }}>
                    {formatRelativeTime(packet.created_at)}
                  </span>
                </div>

                {/* Links */}
                <div style={{ display: "flex", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
                  {packet.work_item_id && (
                    <a
                      href={`/dashboard/evidence?type=all&work_item_id=${packet.work_item_id}`}
                      style={{ ...monoStyle, color: "#2563eb", textDecoration: "none" }}
                    >
                      work item: {packet.work_item_id.slice(0, 12)}
                    </a>
                  )}
                  {packet.run_id && (
                    <a
                      href={`/dashboard/evidence?type=all&run_id=${packet.run_id}`}
                      style={{ ...monoStyle, color: "#0f766e", textDecoration: "none" }}
                    >
                      run: {packet.run_id.slice(0, 12)}
                    </a>
                  )}
                  {packet.step_id && (
                    <span style={monoStyle}>step: {packet.step_id.slice(0, 12)}</span>
                  )}
                </div>

                {/* Content preview */}
                <ContentPreview content={packet.content} />

                {/* Artifact refs */}
                {Array.isArray(packet.artifact_refs) && packet.artifact_refs.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: "#6b7280",
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {packet.artifact_refs.length} artifact{packet.artifact_refs.length !== 1 ? "s" : ""}:{" "}
                    {packet.artifact_refs.slice(0, 3).join(", ")}
                    {packet.artifact_refs.length > 3 && ` +${packet.artifact_refs.length - 3} more`}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ContentPreview({ content }: { content: Record<string, unknown> }) {
  if (!content || typeof content !== "object") return null

  // Try to find a meaningful summary field
  const summaryField =
    (content.summary as string | undefined) ??
    (content.message as string | undefined) ??
    (content.description as string | undefined) ??
    (content.result as string | undefined) ??
    (content.output as string | undefined)

  if (summaryField) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "#374151",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 600,
        }}
      >
        {summaryField.slice(0, 150)}
      </div>
    )
  }

  // Fall back to a truncated JSON preview
  const json = JSON.stringify(content)
  return (
    <div
      style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 11,
        color: "#9ca3af",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 600,
      }}
    >
      {json.slice(0, 150)}{json.length > 150 ? "…" : ""}
    </div>
  )
}

function PageHeader() {
  return (
    <div style={{ marginBottom: 24 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--allura-blue)",
          margin: "0 0 8px",
        }}
      >
        Work Plane
      </p>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--allura-charcoal)",
          letterSpacing: "-0.01em",
          margin: "0 0 4px",
        }}
      >
        Evidence
      </h1>
      <p style={{ fontSize: 14, color: "var(--allura-gray-500)", margin: 0 }}>
        Append-only evidence packets linked to work items and runs. Filter by type, work item, or run.
      </p>
    </div>
  )
}

function TypeFilterTabs({
  active,
  workItemId,
  runId,
}: {
  active: EvidenceTypeFilter
  workItemId: string | null
  runId: string | null
}) {
  const extra =
    [workItemId ? `work_item_id=${workItemId}` : "", runId ? `run_id=${runId}` : ""]
      .filter(Boolean)
      .join("&")

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        marginBottom: 16,
        background: "#f9f8f5",
        borderRadius: 8,
        padding: 4,
        width: "fit-content",
        border: "1px solid #e8e3d8",
      }}
    >
      {EVIDENCE_TYPES.map((type) => {
        const href = `/dashboard/evidence?type=${type}${extra ? `&${extra}` : ""}`
        return (
          <a
            key={type}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: active === type ? 600 : 400,
              color: active === type ? "#2563eb" : "#6b7280",
              background: active === type ? "#fff" : "transparent",
              textDecoration: "none",
              boxShadow: active === type ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "background 0.15s, color 0.15s",
              textTransform: type === "all" ? undefined : undefined,
            }}
            aria-current={active === type ? "page" : undefined}
          >
            {type === "all" ? "All" : type.replace("_", " ")}
          </a>
        )
      })}
    </div>
  )
}
