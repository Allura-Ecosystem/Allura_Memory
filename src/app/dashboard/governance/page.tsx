import type { Metadata } from "next"
import type React from "react"
import { headers } from "next/headers"
import { getPool, isPoolHealthy } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"
import { CANONICAL_POLICIES, type PolicySeverity } from "@/lib/governance/policies"

export const metadata: Metadata = {
  title: "Governance — Allura Memory",
}

export const dynamic = "force-dynamic"

// ── Governance audit trail (append-only events) ─────────────────────────────────

interface GovEvent {
  event_type: string
  agent_id: string
  created_at: string
}

async function fetchGovernanceEvents(groupId: string): Promise<GovEvent[] | null> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return null
  }
  if (!(await isPoolHealthy())) return null
  try {
    const res = await pool.query<GovEvent>(
      `SELECT event_type, agent_id, created_at
       FROM events
       WHERE group_id = $1
         AND event_type IN ('governance_policy_updated','governance_gate_checked','governance_approval_consumed')
       ORDER BY created_at DESC
       LIMIT 10`,
      [groupId],
    )
    return res.rows
  } catch (err) {
    if (isConnectionError(err)) return null
    return []
  }
}

const SEV_TONE: Record<PolicySeverity, { bg: string; fg: string }> = {
  critical: { bg: "var(--c-red-soft)", fg: "var(--c-red)" },
  high: { bg: "var(--c-orange-soft)", fg: "var(--c-orange)" },
  medium: { bg: "var(--c-gold-soft)", fg: "var(--c-gold)" },
  low: { bg: "var(--c-blue-soft)", fg: "var(--c-blue)" },
}

function relativeTime(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

export default async function GovernancePage(): Promise<React.ReactElement> {
  const headersList = await headers()
  let groupId = "allura-system"
  try {
    groupId = validateGroupId(headersList.get("x-allura-group-id") ?? "allura-system")
  } catch (e) {
    if (!(e instanceof GroupIdValidationError)) throw e
  }

  const events = await fetchGovernanceEvents(groupId)

  return (
    <div className="page-enter" style={{ padding: "28px 30px 60px", maxWidth: 1100, margin: "0 auto", fontFamily: "var(--sans)" }}>
      {/* Page header */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--c-blue)",
          marginBottom: 4,
        }}
      >
        Governance
      </div>
      <h1 style={{ margin: 0, fontSize: 27, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--c-ink)" }}>
        Rules &amp; Guardrails
      </h1>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--c-muted)" }}>
        The rules Allura checks on every change. They keep your data safe and tidy.
      </p>

      {/* Plain-language explainer banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--c-blue-soft)",
          border: "1px solid var(--c-border)",
          borderRadius: 12,
          padding: "12px 16px",
          margin: "18px 0 22px",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span style={{ fontSize: 13, color: "var(--c-ink)", lineHeight: 1.5 }}>
          These rules can&apos;t be switched off from here. Changing one always needs a person to approve it first —
          that&apos;s on purpose, so nothing important can be quietly turned off.
        </span>
      </div>

      {/* Policy list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CANONICAL_POLICIES.map((p) => {
          const tone = SEV_TONE[p.severity]
          return (
            <div
              key={p.id}
              style={{
                background: "var(--c-card)",
                border: "1px solid var(--c-border)",
                borderRadius: 14,
                padding: "16px 18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--c-ink)", flex: 1 }}>{p.name}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: tone.bg,
                    color: tone.fg,
                  }}
                >
                  {p.severity}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: p.overridable ? "var(--c-gold)" : "var(--c-green)",
                  }}
                >
                  {p.overridable ? "Override needs approval" : "Always on"}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--c-muted)", lineHeight: 1.55 }}>{p.description}</p>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--mono)" }}>
                {p.id} · {p.invariant_key} · v{p.version}
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent governance activity */}
      <h2 style={{ margin: "30px 0 12px", fontSize: 16, fontWeight: 600, color: "var(--c-ink)" }}>
        Recent rule activity
      </h2>
      <div
        style={{
          background: "var(--c-card)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        {events === null ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--c-muted)" }}>
            Memory store not reachable — activity unavailable.
          </p>
        ) : events.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--c-muted)" }}>
            No rule changes or checks recorded yet. Approvals and overrides will show up here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ flex: 1, color: "var(--c-ink)" }}>{e.event_type.replace(/_/g, " ")}</span>
                <span style={{ color: "var(--c-muted)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
                  {e.agent_id} · {relativeTime(e.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: "var(--c-muted)", margin: "18px 0 0" }}>
        {groupId} · {CANONICAL_POLICIES.length} rules · live
      </p>
    </div>
  )
}
