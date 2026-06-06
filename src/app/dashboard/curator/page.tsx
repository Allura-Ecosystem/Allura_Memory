"use client"

import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  FileSearch,
  Filter,
  Hash,
  HelpCircle,
  List,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  XCircle,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { postCuratorDecision } from "./curator-actions"
import { DecisionDialog } from "./decision-dialog"
import type { CuratorDecision, DecisionReceipt, Proposal, ProposalStatus, ProposalTier } from "./types"

// ── Data quality (reuse Story 6-4 pattern) ────────────────────────────

type DataQualityState = "fresh" | "stale" | "degraded" | "unavailable" | "unknown"

const DATA_QUALITY: Record<DataQualityState, { label: string; description: string; icon: typeof Activity; bg: string; fg: string }> = {
  fresh:       { label: "Fresh",       description: "Data retrieved successfully from curator store",       icon: ShieldCheck, bg: "#dcfce7", fg: "#166534" },
  stale:       { label: "Stale",       description: "Data was fetched but may be outdated",                 icon: Clock,       bg: "#fef3c7", fg: "#92400e" },
  degraded:    { label: "Degraded",    description: "Partial results returned from curator store",          icon: ShieldAlert, bg: "#fef3c7", fg: "#92400e" },
  unavailable: { label: "Unavailable", description: "Curator store could not be reached",                   icon: ShieldOff,   bg: "#fef2f2", fg: "#991b1b" },
  unknown:     { label: "Unknown",     description: "Data quality could not be determined",                  icon: HelpCircle,  bg: "#f3f4f6", fg: "#6b7280" },
}

function computeDataQuality(fetchedAt: Date | null, error: string | null): DataQualityState {
  if (error) return "unavailable"
  if (!fetchedAt) return "unknown"
  const ageMs = Date.now() - fetchedAt.getTime()
  if (ageMs > 5 * 60 * 1000) return "stale"
  return "fresh"
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 1000) return "just now"
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function proposalAge(isoDate: string): string {
  try {
    return relativeTime(new Date(isoDate))
  } catch {
    return "unknown"
  }
}

// ── Badge maps ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ProposalStatus, { bg: string; fg: string; label: string }> = {
  pending:  { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  approved: { bg: "#dcfce7", fg: "#166534", label: "Approved" },
  rejected: { bg: "#fef2f2", fg: "#991b1b", label: "Rejected" },
}

const TIER_BADGE: Record<ProposalTier, { bg: string; fg: string; label: string }> = {
  emerging:    { bg: "#f3f4f6", fg: "#6b7280", label: "Emerging" },
  adoption:    { bg: "#e0e7ff", fg: "#3730a3", label: "Adoption" },
  mainstream:  { bg: "#dcfce7", fg: "#166534", label: "Mainstream" },
}

// ── Filter options ────────────────────────────────────────────────────

type FilterStatus = "pending" | "approved" | "rejected" | "all"

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "pending",  label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all",      label: "All" },
]

function normalizeFilterStatus(value: string | null): FilterStatus {
  return value === "approved" || value === "rejected" || value === "all" || value === "pending"
    ? value
    : "pending"
}

// ── Score bar component ───────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.85 ? "#166534" : score >= 0.6 ? "#92400e" : "#991b1b"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 48,
          height: 6,
          borderRadius: 3,
          background: "#e5e7eb",
          overflow: "hidden",
        }}
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence score: ${pct}%`}
      >
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>
        {pct}%
      </span>
    </div>
  )
}

// ── Badge component ───────────────────────────────────────────────────

function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 9999,
        background: bg,
        color: fg,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}

function missingDecisionReceipt(proposal: Proposal): DecisionReceipt {
  return {
    proposal_id: proposal.id,
    group_id: proposal.group_id,
    decision: "missing_receipt",
    previous_status: "pending",
    resulting_status: proposal.status,
    promoted_memory_id: null,
    actor: "unknown",
    rationale: null,
    decided_at: null,
    trace_reference: proposal.trace_ref,
    source_event_type: "missing",
    receipt_status: "missing_receipt_blocker",
    degraded_reason: `Missing append-only curator decision receipt for proposal ${proposal.id}`,
  }
}

function DecisionReceiptPanel({ receipt }: { receipt: DecisionReceipt }) {
  const isMissing = receipt.receipt_status === "missing_receipt_blocker"
  const promotedMemory = receipt.promoted_memory_id ?? receipt.queued_memory_id ?? null

  return (
    <section
      aria-label="Decision Receipt"
      style={{
        marginTop: 18,
        padding: "12px 14px",
        borderRadius: 8,
        border: isMissing ? "1px solid #fecaca" : "1px solid #bbf7d0",
        background: isMissing ? "#fef2f2" : "#f0fdf4",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {isMissing ? <ShieldAlert size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: isMissing ? "#991b1b" : "#166534" }}>
          {isMissing ? "Receipt unavailable" : "Decision Receipt"}
        </h4>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>read-only</span>
      </div>

      {isMissing && (
        <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.5, color: "#991b1b" }}>
          {receipt.degraded_reason ?? "Missing append-only curator decision receipt"}
        </p>
      )}

      <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px 10px", margin: 0, fontSize: 12 }}>
        <dt style={receiptTermStyle}>Actor</dt>
        <dd style={receiptValueStyle}>{receipt.actor}</dd>
        <dt style={receiptTermStyle}>Timestamp</dt>
        <dd style={receiptValueStyle}>{receipt.decided_at ?? "unknown"}</dd>
        <dt style={receiptTermStyle}>Rationale</dt>
        <dd style={receiptValueStyle}>{receipt.rationale ?? "No rationale recorded"}</dd>
        <dt style={receiptTermStyle}>Prior status</dt>
        <dd style={receiptValueStyle}>{receipt.previous_status}</dd>
        <dt style={receiptTermStyle}>New status</dt>
        <dd style={receiptValueStyle}>{receipt.resulting_status}</dd>
        <dt style={receiptTermStyle}>Trace reference</dt>
        <dd style={receiptValueStyle}>{receipt.trace_reference ?? "No trace reference"}</dd>
        <dt style={receiptTermStyle}>Promoted memory</dt>
        <dd style={receiptValueStyle}>{promotedMemory ?? "Not applicable"}</dd>
      </dl>
    </section>
  )
}

// ── Empty state component ─────────────────────────────────────────────

function EmptyState({ status }: { status: FilterStatus }) {
  const messages: Record<FilterStatus, { title: string; body: string }> = {
    pending: {
      title: "No pending proposals",
      body: "The curator watchdog hasn't generated new proposals, or all proposals have been reviewed. Run `bun run curator:watchdog` to scan for promotable memories.",
    },
    approved: {
      title: "No approved proposals",
      body: "No proposals have been approved yet. Review pending proposals to promote high-confidence memories to the knowledge graph.",
    },
    rejected: {
      title: "No rejected proposals",
      body: "No proposals have been rejected. This is normal for new systems.",
    },
    all: {
      title: "No proposals found",
      body: "The proposal queue is empty. The curator watchdog scans episodic memory for promotable content. Run `bun run curator:watchdog` to generate proposals.",
    },
  }

  const msg = messages[status]

  return (
    <div
      style={{
        textAlign: "center",
        padding: "64px 24px",
        color: "#6b7280",
      }}
      role="status"
    >
      <FileSearch
        size={40}
        style={{ margin: "0 auto 12px", opacity: 0.4 }}
        aria-hidden="true"
      />
      <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>
        {msg.title}
      </p>
      <p style={{ fontSize: 13, maxWidth: 480, margin: "0 auto", lineHeight: 1.5 }}>
        {msg.body}
      </p>
    </div>
  )
}

// ── Proposal row component ────────────────────────────────────────────

function ProposalRow({
  proposal,
  selected,
  onSelect,
}: {
  proposal: Proposal
  selected: boolean
  onSelect: (id: string) => void
}) {
  const preview = proposal.content.length > 120
    ? proposal.content.slice(0, 120) + "…"
    : proposal.content

  return (
    <tr
      onClick={() => onSelect(proposal.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(proposal.id)
        }
      }}
      tabIndex={0}
      role="row"
      aria-selected={selected}
      style={{
        cursor: "pointer",
        background: selected ? "#fffbeb" : "transparent",
        borderBottom: "1px solid #e5e7eb",
        transition: "background 0.1s",
      }}
    >
      {/* ID */}
      <td style={{ padding: "10px 12px", fontSize: 11, fontFamily: "monospace", color: "#6b7280", whiteSpace: "nowrap" }}>
        {proposal.id.slice(0, 8)}
      </td>
      {/* Content preview */}
      <td style={{ padding: "10px 12px", fontSize: 13, color: "#1f2937", maxWidth: 400 }}>
        {preview}
      </td>
      {/* Score */}
      <td style={{ padding: "10px 12px" }}>
        <ScoreBar score={proposal.score} />
      </td>
      {/* Tier */}
      <td style={{ padding: "10px 12px" }}>
        <Badge {...TIER_BADGE[proposal.tier]} />
      </td>
      {/* Status */}
      <td style={{ padding: "10px 12px" }}>
        <Badge {...STATUS_BADGE[proposal.status]} />
      </td>
      {/* Trace ref */}
      <td style={{ padding: "10px 12px", fontSize: 11, fontFamily: "monospace", color: "#6b7280" }}>
        {proposal.trace_ref ?? "—"}
      </td>
      {/* Age */}
      <td
        style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}
        title={proposal.created_at}
      >
        {proposalAge(proposal.created_at)}
      </td>
    </tr>
  )
}

// ── Detail panel component ────────────────────────────────────────────

function ProposalDetail({
  proposal,
  onClose,
  onDecision,
}: {
  proposal: Proposal
  onClose: () => void
  onDecision: (decision: CuratorDecision, proposal: Proposal) => void
}) {
  const receipt = proposal.decision_receipt ?? (proposal.status !== "pending" ? missingDecisionReceipt(proposal) : null)

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: 420,
        height: "100vh",
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        overflowY: "auto",
        padding: "24px 20px",
        zIndex: 50,
      }}
      aria-label="Proposal detail"
      role="complementary"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
          Proposal Detail
        </h3>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 4,
            color: "#6b7280",
          }}
        >
          <XCircle size={20} />
        </button>
      </div>

      {/* ID */}
      <dl style={{ margin: 0 }}>
        <DetailField label="ID" icon={<Hash size={14} />}>
          <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
            {proposal.id}
          </code>
        </DetailField>

        {/* Status + Tier */}
        <DetailField label="Status" icon={<CheckCircle2 size={14} />}>
          <div style={{ display: "flex", gap: 6 }}>
            <Badge {...STATUS_BADGE[proposal.status]} />
            <Badge {...TIER_BADGE[proposal.tier]} />
          </div>
        </DetailField>

        {/* Score */}
        <DetailField label="Confidence" icon={<Activity size={14} />}>
          <ScoreBar score={proposal.score} />
        </DetailField>

        {/* Reasoning */}
        <DetailField label="Reasoning" icon={<FileSearch size={14} />}>
          <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.5 }}>
            {proposal.reasoning || "No reasoning provided"}
          </p>
        </DetailField>

        {/* Content */}
        <DetailField label="Full Content" icon={<List size={14} />}>
          <div
            style={{
              fontSize: 13,
              color: "#1f2937",
              background: "#f9fafb",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {proposal.content}
          </div>
        </DetailField>

        {/* Trace reference */}
        <DetailField label="Trace Reference" icon={<Hash size={14} />}>
          {proposal.trace_ref ? (
            <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
              event #{proposal.trace_ref}
            </code>
          ) : (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>No trace reference</span>
          )}
        </DetailField>

        {/* Timestamp */}
        <DetailField label="Created" icon={<Clock size={14} />}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {proposalAge(proposal.created_at)} — {proposal.created_at}
          </span>
        </DetailField>

        {/* group_id */}
        <DetailField label="Tenant" icon={<ShieldCheck size={14} />}>
          <code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>
            {proposal.group_id}
          </code>
        </DetailField>
      </dl>

      {receipt && <DecisionReceiptPanel receipt={receipt} />}

      {proposal.status === "pending" && (
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 18 }}>
          <button
            type="button"
            onClick={() => onDecision("approve", proposal)}
            style={{ ...decisionButtonStyle, background: "#166534", color: "#fff", borderColor: "#166534" }}
          >
            <Check size={14} aria-hidden="true" />
            Approve proposal
          </button>
          <button
            type="button"
            onClick={() => onDecision("reject", proposal)}
            style={{ ...decisionButtonStyle, background: "#fff", color: "#991b1b", borderColor: "#fecaca" }}
          >
            <XCircle size={14} aria-hidden="true" />
            Reject proposal
          </button>
          <button
            type="button"
            onClick={() => onDecision("request_evidence", proposal)}
            style={{ ...decisionButtonStyle, background: "#fff", color: "#92400e", borderColor: "#fde68a" }}
          >
            <FileSearch size={14} aria-hidden="true" />
            Request Evidence
          </button>
          <button
            type="button"
            onClick={() => onDecision("request_changes", proposal)}
            style={{ ...decisionButtonStyle, background: "#fff", color: "#374151", borderColor: "#d1d5db" }}
          >
            <AlertCircle size={14} aria-hidden="true" />
            Request Changes
          </button>
        </div>
      )}

      {/* Source of truth declaration */}
      <div
        style={{
          marginTop: 20,
          padding: "10px 12px",
          background: "#f9fafb",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          fontSize: 11,
          color: "#6b7280",
        }}
      >
        <strong>Source of truth:</strong> <code>/api/curator/proposals</code> → <code>canonical_proposals</code> table.
        Decisions are human-gated through <code>/api/curator/approve</code>. Approval queues governed promotion; rejection preserves evidence.
      </div>
    </aside>
  )
}

function DetailField({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <dt
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {icon} {label}
      </dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  )
}

// ── Main page component ───────────────────────────────────────────────

export default function CuratorProposalQueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlStatus = normalizeFilterStatus(searchParams.get("status"))

  const [groupId] = useState("allura-system")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(urlStatus)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedProposalSnapshot, setSelectedProposalSnapshot] = useState<Proposal | null>(null)
  const [decisionTarget, setDecisionTarget] = useState<{ decision: CuratorDecision; proposal: Proposal } | null>(null)
  const [decisionSubmitting, setDecisionSubmitting] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const queueHeadingRef = useRef<HTMLHeadingElement | null>(null)

  const dataQuality = computeDataQuality(lastFetched, error)
  const refreshedSelectedProposal = selectedId ? proposals.find((p) => p.id === selectedId) : null
  const selectedProposal = selectedId
    ? refreshedSelectedProposal && selectedProposalSnapshot?.id === refreshedSelectedProposal.id
      ? {
        ...refreshedSelectedProposal,
        decision_receipt: refreshedSelectedProposal.decision_receipt ?? selectedProposalSnapshot.decision_receipt,
      }
      : refreshedSelectedProposal ?? selectedProposalSnapshot
    : null

  // Fetch proposals
  const fetchProposals = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        group_id: groupId,
        status: filterStatus,
        limit: "50",
      })
      const res = await fetch(`/api/curator/proposals?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Failed to fetch proposals (${res.status})`)
      }
      const data = await res.json()
      setProposals(data.proposals ?? [])
      setLastFetched(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch proposals")
      setProposals([])
      setLastFetched(new Date())
    } finally {
      setLoading(false)
    }
  }, [groupId, filterStatus])

  // Auto-fetch on mount and filter change
  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  // URL sync
  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status)
    setSelectedId(null)
    setSelectedProposalSnapshot(null)
    const params = new URLSearchParams()
    if (status !== "pending") params.set("status", status)
    const qs = params.toString()
    router.replace(`/dashboard/curator${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const submitDecision = async (rationale: string) => {
    if (!decisionTarget) return
    setDecisionSubmitting(true)
    setDecisionError(null)

    try {
      const result = await postCuratorDecision({
        proposal: decisionTarget.proposal,
        decision: decisionTarget.decision,
        rationale,
      })
      const receipt = result.receipt
      const decidedProposal: Proposal = {
        ...decisionTarget.proposal,
        status: receipt?.resulting_status === "approved" || receipt?.resulting_status === "rejected"
          ? receipt.resulting_status
          : decisionTarget.proposal.status,
        decision_receipt: receipt ?? null,
      }
      setSelectedProposalSnapshot(decidedProposal)
      setSelectedId(decidedProposal.id)
      setDecisionTarget(null)
      await fetchProposals()
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : "Failed to record curator decision")
    } finally {
      setDecisionSubmitting(false)
    }
  }

  const QualityInfo = DATA_QUALITY[dataQuality]
  const QualityIcon = QualityInfo.icon

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 32px",
        background: "#f5f1e6",
      }}
    >
      {/* Header */}
      <h1
        ref={queueHeadingRef}
        tabIndex={-1}
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#1a1a1a",
          margin: "0 0 4px",
          letterSpacing: "-0.02em",
        }}
      >
        Curator Proposal Queue
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
        Review pending proposals for promotion to governed knowledge
      </p>

      {/* Data quality bar */}
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          marginBottom: 16,
          padding: "10px 16px",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          fontSize: 12,
        }}
      >
        {/* Scope */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#6b7280" }}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>group_id:</span>
          <code style={{ fontWeight: 600, color: "#1f2937" }}>{groupId}</code>
        </div>

        {/* Source */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#6b7280" }}>
          <FileSearch size={14} aria-hidden="true" />
          <span>source:</span>
          <code style={{ fontWeight: 600, color: "#1f2937" }}>/api/curator/proposals</code>
        </div>

        {/* Quality badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 9999,
              background: QualityInfo.bg,
              color: QualityInfo.fg,
            }}
            title={QualityInfo.description}
          >
            <QualityIcon size={12} aria-hidden="true" />
            {QualityInfo.label}
          </span>
          {lastFetched && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {relativeTime(lastFetched)}
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Filter size={14} style={{ color: "#6b7280" }} aria-hidden="true" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleFilterChange(f.value)}
            aria-pressed={filterStatus === f.value}
            style={{
              fontSize: 12,
              fontWeight: filterStatus === f.value ? 700 : 400,
              padding: "4px 12px",
              borderRadius: 9999,
              border: filterStatus === f.value ? "1px solid #374151" : "1px solid #d1d5db",
              background: filterStatus === f.value ? "#1f2937" : "#fff",
              color: filterStatus === f.value ? "#fff" : "#374151",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {f.label}
          </button>
        ))}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
          {loading ? "Loading…" : `${proposals.length} proposal${proposals.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            width: "100%",
            maxWidth: 960,
            marginBottom: 12,
            padding: "10px 16px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          role="alert"
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Main content */}
      <div style={{ width: "100%", maxWidth: 960 }}>
        {loading && proposals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: "#6b7280" }}>
            <Loader2 size={28} style={{ animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, margin: 0 }}>Fetching proposals…</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : proposals.length === 0 && !error ? (
          <EmptyState status={filterStatus} />
        ) : (
          <div
            style={{
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
              role="grid"
              aria-label="Curator proposals"
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                  <th style={{ ...thStyle, width: 80 }}>ID</th>
                  <th style={{ ...thStyle }}>Content</th>
                  <th style={{ ...thStyle, width: 110 }}>Score</th>
                  <th style={{ ...thStyle, width: 100 }}>Tier</th>
                  <th style={{ ...thStyle, width: 90 }}>Status</th>
                  <th style={{ ...thStyle, width: 80 }}>Trace</th>
                  <th style={{ ...thStyle, width: 90 }}>Age</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <ProposalRow
                    key={p.id}
                    proposal={p}
                    selected={selectedId === p.id}
                    onSelect={(id) => {
                      setSelectedId(id)
                      setSelectedProposalSnapshot(proposals.find((proposal) => proposal.id === id) ?? null)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedProposal && (
        <ProposalDetail
          proposal={selectedProposal}
          onClose={() => {
            setSelectedId(null)
            setSelectedProposalSnapshot(null)
          }}
          onDecision={(decision, proposal) => {
            setDecisionError(null)
            setDecisionTarget({ decision, proposal })
          }}
        />
      )}

      {decisionTarget && (
        <DecisionDialog
          proposal={decisionTarget.proposal}
          decision={decisionTarget.decision}
          submitting={decisionSubmitting}
          error={decisionError}
          restoreFocusRef={queueHeadingRef}
          onCancel={() => {
            if (!decisionSubmitting) {
              setDecisionTarget(null)
              setDecisionError(null)
            }
          }}
          onConfirm={submitDecision}
        />
      )}

      {/* Source of truth */}
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          marginTop: 16,
          fontSize: 11,
          color: "#9ca3af",
          textAlign: "center",
        }}
      >
        Source of truth: <code>canonical_proposals</code> via <code>/api/curator/proposals</code> •
        Viewing is read-only; approve/reject dialogs record governed curator decisions •
        group_id: <code>{groupId}</code>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}

const decisionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  flex: 1,
  fontSize: 12,
  fontWeight: 700,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid",
  cursor: "pointer",
}

const receiptTermStyle: React.CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontWeight: 700,
}

const receiptValueStyle: React.CSSProperties = {
  margin: 0,
  color: "#1f2937",
  overflowWrap: "anywhere",
}
