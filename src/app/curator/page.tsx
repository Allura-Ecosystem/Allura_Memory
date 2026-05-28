"use client"

import { useEffect, useState } from "react"
import { ConfidenceBar } from "@/components/allura/confidence-bar"
import { EmptyState } from "@/components/allura/empty-state"
import { StatusBadge } from "@/components/allura/status-badge"
import { TraceCard } from "@/components/allura/trace-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Trace {
  id: string
  group_id: string
  event_type: string
  agent_id: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

interface Proposal {
  id: string
  group_id: string
  content: string
  score: number
  reasoning: string
  tier: "emerging" | "adoption" | "established"
  status: "pending" | "approved" | "rejected"
  trace_ref: string
  created_at: string
}

interface Insight {
  id: string
  group_id: string
  content: string
  score: number
  provenance: string
  created_at: string
  promoted_at?: string
  promoted_by?: string
}

interface DecisionReceipt {
  proposal_id: string
  group_id: string
  decision: "approved" | "rejected" | "needs_evidence" | "missing_receipt"
  previous_status: "pending"
  resulting_status: "approved" | "rejected" | "pending"
  promoted_memory_id: string | null
  actor: string
  rationale: string | null
  decided_at: string | null
  trace_reference?: string | null
  source_event_type?: string
  receipt_status?: "available" | "missing_receipt_blocker"
  degraded_reason?: string
  notion_sync: "pending" | "completed" | "failed"
}

type CuratorTab = "pending" | "approved" | "traces"

const requestEvidenceReceiptPreview = { decision: "needs_evidence" as const }

function getProposalStatus(proposal: Proposal): "active" | "proposed" | "forgotten" | "low_confidence" {
  if (proposal.status === "approved") return "active"
  if (proposal.status === "rejected") return "forgotten"
  if (proposal.score < 0.5) return "low_confidence"
  return "proposed"
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins} minutes ago`
  if (diffHours < 24) return `${diffHours} hours ago`
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString()
}

export default function CuratorDashboardPage() {
  const [activeTab, setActiveTab] = useState<CuratorTab>("pending")
  const [groupId, setGroupId] = useState("allura-system")
  const [traces, setTraces] = useState<Trace[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [decisionRationale, setDecisionRationale] = useState("")
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null)
  const [decisionReceipt, setDecisionReceipt] = useState<DecisionReceipt | null>(null)

  const fetchTraces = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/memory/traces?group_id=${groupId}&limit=50`)
      const data = await response.json()
      setTraces(data.traces || [])
    } catch (error) {
      console.error("Failed to fetch traces:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchInsights = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/memory/insights?group_id=${groupId}&limit=50`)
      const data = await response.json()
      setInsights(data.insights || [])
    } catch (error) {
      console.error("Failed to fetch insights:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchProposals = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ group_id: groupId, status: "pending" })
      const response = await fetch(`/api/curator/proposals?${params.toString()}`)
      const data = await response.json()
      setProposals(data.proposals || [])
    } catch (error) {
      console.error("Failed to fetch proposals:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === "traces") fetchTraces()
    else if (activeTab === "approved") fetchInsights()
    else if (activeTab === "pending") fetchProposals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, groupId])

  useEffect(() => {
    setSelectedProposal(null)
    setDecisionRationale("")
    setDecisionMessage(null)
    setDecisionReceipt(null)
  }, [groupId])

  const submitProposalDecision = async (proposal: Proposal, decision: "approve" | "reject" | "request_evidence") => {
    if (decisionRationale.trim().length === 0) {
      setDecisionMessage("Human rationale is required before approving, rejecting, or requesting evidence for a proposal.")
      return
    }

    const response = await fetch("/api/curator/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal_id: proposal.id,
        group_id: proposal.group_id,
        decision,
        rationale: decisionRationale.trim(),
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setDecisionMessage(String(result.error || "Curator decision failed"))
      return
    }

    setDecisionReceipt(result.receipt ?? null)
    setDecisionMessage(`Decision recorded: ${decision}. Audit receipt returned from governed events.`)
    setDecisionRationale("")
    await fetchProposals()
  }

  const selectProposalForDecision = (proposal: Proposal) => {
    setSelectedProposal(selectedProposal?.id === proposal.id ? null : proposal)
    setDecisionRationale("")
    setDecisionMessage(null)
    setDecisionReceipt(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--allura-pure-white)]">
      {/* Header */}
      <header className="border-b border-[var(--allura-deep-navy)]/10 bg-[var(--allura-deep-navy)] px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-[var(--allura-pure-white)]">Curator Dashboard</h1>
            <p className="text-sm text-[var(--allura-clarity-blue)]">Human-in-the-loop governance for memory promotion</p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="group_id"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-48 border-[var(--allura-clarity-blue)]/30 bg-[var(--allura-deep-navy)] text-sm text-[var(--allura-pure-white)] placeholder:text-[var(--allura-clarity-blue)]/60"
              style={{ borderRadius: "var(--allura-radius-input)" }}
            />
            <Button
              onClick={() => {
                if (activeTab === "traces") fetchTraces()
                else if (activeTab === "approved") fetchInsights()
                else if (activeTab === "pending") fetchProposals()
              }}
              variant="outline"
              className="border-[var(--allura-clarity-blue)]/30 text-[var(--allura-pure-white)] hover:bg-[var(--allura-clarity-blue)]/20"
              style={{ borderRadius: "var(--allura-radius-button)" }}
            >
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
        <div className="flex gap-1 rounded-xl bg-[var(--allura-navy-5)] p-1">
          {(["pending", "approved", "traces"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-white text-[var(--allura-deep-navy)] shadow-[var(--allura-shadow-card)]"
                  : "text-[var(--allura-warm-gray)] hover:text-[var(--allura-deep-navy)]"
              }`}
              style={{ borderRadius: "var(--allura-radius-button)" }}
            >
              {tab === "pending" && `Pending (${proposals.length})`}
              {tab === "approved" && "Approved"}
              {tab === "traces" && "Traces (Admin)"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        {activeTab === "pending" && (
          <PendingView
            proposals={proposals}
            isLoading={isLoading}
            selectedProposal={selectedProposal}
            selectProposalForDecision={selectProposalForDecision}
            decisionRationale={decisionRationale}
            setDecisionRationale={setDecisionRationale}
            decisionMessage={decisionMessage}
            decisionReceipt={decisionReceipt}
            submitProposalDecision={submitProposalDecision}
          />
        )}
        {activeTab === "approved" && (
          <ApprovedView insights={insights} isLoading={isLoading} />
        )}
        {activeTab === "traces" && (
          <TracesView traces={traces} isLoading={isLoading} />
        )}
      </div>
    </div>
  )
}

interface PendingViewProps {
  proposals: Proposal[]
  isLoading: boolean
  selectedProposal: Proposal | null
  selectProposalForDecision: (p: Proposal) => void
  decisionRationale: string
  setDecisionRationale: (value: string) => void
  decisionMessage: string | null
  decisionReceipt: DecisionReceipt | null
  submitProposalDecision: (proposal: Proposal, decision: "approve" | "reject" | "request_evidence") => Promise<void>
}

function PendingView({
  proposals,
  isLoading,
  selectedProposal,
  selectProposalForDecision,
  decisionRationale,
  setDecisionRationale,
  decisionMessage,
  decisionReceipt,
  submitProposalDecision,
}: PendingViewProps) {
  const approvalDisabled = selectedProposal ? !selectedProposal.trace_ref : true

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--allura-deep-navy)] border-t-transparent" />
      </div>
    )
  }

  if (proposals.length === 0 && !decisionReceipt) {
    return <EmptyState title="All caught up." description="No pending proposals require human curator review right now." />
  }

  return (
    <div className="flex gap-4" style={{ minHeight: 500 }}>
      {/* Left column — compact card list */}
      <div className="w-[300px] shrink-0 overflow-y-auto rounded-xl border border-[var(--allura-deep-navy)]/10 bg-white">
        <div className="space-y-0 divide-y divide-[var(--allura-deep-navy)]/10">
          {proposals.map((proposal) => (
            <button
              key={proposal.id}
              type="button"
              onClick={() => {
                selectProposalForDecision(proposal)
              }}
              className={`flex w-full items-start gap-2 px-4 py-3 text-left transition-colors ${
                selectedProposal?.id === proposal.id
                  ? "bg-[var(--allura-navy-5)]"
                  : "hover:bg-[var(--allura-navy-5)]/50"
              }`}
            >
              <StatusBadge status={getProposalStatus(proposal)} className="shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-[var(--allura-ink-black)]">{proposal.content}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--allura-warm-gray)]">
                  <span>{proposal.id}</span>
                  <span>&middot;</span>
                  <span>{formatRelativeTime(proposal.created_at)}</span>
                  <span>&middot;</span>
                  <span className="capitalize">{proposal.tier}</span>
                  <span>&middot;</span>
                  <span className="capitalize">{proposal.status}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right column — detail */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--allura-deep-navy)]/10 bg-white p-6">
        {selectedProposal ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--allura-ink-black)]">
                  Proposal Detail
                </h3>
                <div className="mt-1 flex items-center gap-2 text-sm text-[var(--allura-warm-gray)]">
                  <span>{formatRelativeTime(selectedProposal.created_at)}</span>
                  <span>&middot;</span>
                  <span className="capitalize">{selectedProposal.tier}</span>
                  <span>&middot;</span>
                  <span>{selectedProposal.group_id}</span>
                  <span>&middot;</span>
                  <span className="capitalize">{selectedProposal.status}</span>
                </div>
              </div>
              <StatusBadge status={getProposalStatus(selectedProposal)} />
            </div>

            <p className="leading-7 text-[var(--allura-ink-black)]">{selectedProposal.content}</p>

            <div className="flex items-end gap-4">
              <ConfidenceBar value={selectedProposal.score * 100} />
            </div>

            <dl className="grid gap-3 rounded-xl border border-[var(--allura-deep-navy)]/10 bg-[var(--allura-pure-white)] p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Proposal ID</dt>
                <dd className="mt-1 text-[var(--allura-ink-black)]">{selectedProposal.id}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Trace reference</dt>
                <dd className="mt-1 text-[var(--allura-ink-black)]">{selectedProposal.trace_ref || "No trace reference attached"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Created</dt>
                <dd className="mt-1 text-[var(--allura-ink-black)]">{selectedProposal.created_at}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Decision mode</dt>
                <dd className="mt-1 text-[var(--allura-ink-black)]">HITL curator action; decisions require rationale and append-only audit receipts.</dd>
              </div>
            </dl>

            <div className="space-y-3 rounded-xl border border-[var(--allura-deep-navy)]/10 bg-[var(--allura-pure-white)] p-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Human rationale</p>
                <Input
                  value={decisionRationale}
                  onChange={(event) => setDecisionRationale(event.target.value)}
                  placeholder="Explain the human approval or rejection decision"
                  className="mt-2"
                />
              </div>
              <p className="text-xs leading-5 text-[var(--allura-warm-gray)]">
                Approval writes semantic knowledge through the governed curator flow. Reject keeps source evidence and records an audit receipt.
              </p>
              <p className="text-xs leading-5 text-[var(--allura-warm-gray)]">
                Request evidence keeps the proposal pending and records a needs-evidence receipt without promoting or deleting source material.
              </p>
              {!selectedProposal.trace_ref && (
                <p className="text-xs text-[var(--allura-warm-gray)]">Approval requires trace requester provenance before semantic promotion.</p>
              )}
              {decisionMessage && <p className="text-sm text-[var(--allura-deep-navy)]">{decisionMessage}</p>}
              {decisionReceipt && (
                <dl className="grid gap-2 rounded-lg border border-[var(--allura-deep-navy)]/10 bg-white p-3 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Audit receipt</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.proposal_id}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Resulting status</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.resulting_status}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Previous status</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.previous_status}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Promoted memory</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.promoted_memory_id ?? "none"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Actor</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.actor}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Rationale</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.rationale ?? "none recorded"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Decided at</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.decided_at ?? "missing receipt blocker"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Trace reference</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.trace_reference ?? "not attached"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Source event type</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.source_event_type ?? "live route receipt"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-[var(--allura-deep-navy)]">Receipt status</dt>
                    <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.receipt_status ?? "available"}</dd>
                  </div>
                  {decisionReceipt.receipt_status === "missing_receipt_blocker" && (
                    <div className="sm:col-span-2">
                      <dt className="font-semibold text-[var(--allura-deep-navy)]">Missing append-only decision receipt</dt>
                      <dd className="text-[var(--allura-warm-gray)]">{decisionReceipt.degraded_reason ?? "Missing append-only decision receipt must be treated as a degraded blocker, not hidden."}</dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={approvalDisabled} onClick={() => submitProposalDecision(selectedProposal, "approve")}>Approve proposal</Button>
                <Button type="button" variant="outline" onClick={() => submitProposalDecision(selectedProposal, "reject")}>Reject proposal</Button>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Request evidence (${requestEvidenceReceiptPreview.decision})`}
                  onClick={() => submitProposalDecision(selectedProposal, "request_evidence")}
                >
                  Request evidence
                </Button>
              </div>
            </div>

            {selectedProposal.reasoning && (
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Reasoning</p>
                <p className="text-sm leading-6 text-[var(--allura-warm-gray)]">{selectedProposal.reasoning}</p>
              </div>
            )}

            {/* Trace evidence */}
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-[0.2em] text-[var(--allura-deep-navy)] uppercase">Evidence</p>
              <TraceCard
                tool="memory.propose"
                snippet={`Trace: ${selectedProposal.trace_ref || "unavailable"} — Score: ${(selectedProposal.score * 100).toFixed(0)}% — ${selectedProposal.reasoning || "Scored by curator pipeline; awaiting human review"}`}
                timestamp={formatRelativeTime(selectedProposal.created_at)}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center py-20">
            <p className="text-sm text-[var(--allura-warm-gray)]">Select a proposal to review</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovedView({ insights, isLoading }: { insights: Insight[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--allura-deep-navy)] border-t-transparent" />
      </div>
    )
  }

  if (insights.length === 0) {
    return <EmptyState title="No approved knowledge yet" description="Approved memories will appear here after curator review." />
  }

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <div
          key={insight.id}
          className="rounded-xl border border-[var(--allura-deep-navy)]/10 bg-white p-4 shadow-[var(--allura-shadow-card)]"
          style={{ borderRadius: "var(--allura-radius-card)" }}
        >
          <p className="mb-2 text-sm text-[var(--allura-ink-black)]">{insight.content}</p>
          <div className="flex items-center gap-2 text-xs text-[var(--allura-warm-gray)]">
            <span>{formatRelativeTime(insight.created_at)}</span>
            <span>&middot;</span>
            <span>{insight.provenance}</span>
            {insight.promoted_by && (
              <>
                <span>&middot;</span>
                <span>Promoted by {insight.promoted_by}</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function TracesView({ traces, isLoading }: { traces: Trace[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--allura-deep-navy)] border-t-transparent" />
      </div>
    )
  }

  if (traces.length === 0) {
    return <EmptyState title="No traces found" description="Raw event traces will appear here when available." />
  }

  return (
    <div className="space-y-3">
      {traces.map((trace) => (
        <div
          key={trace.id}
          className="rounded-xl border border-[var(--allura-deep-navy)]/10 bg-white p-4 shadow-[var(--allura-shadow-card)]"
          style={{ borderRadius: "var(--allura-radius-card)" }}
        >
          <div className="mb-2 flex items-start justify-between">
            <StatusBadge
              status={trace.status === "completed" ? "active" : trace.status === "pending" ? "proposed" : "low_confidence"}
            />
            <span className="text-xs text-[var(--allura-warm-gray)]">
              {formatRelativeTime(trace.created_at)}
            </span>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-[var(--allura-pure-white)] p-2 text-xs text-[var(--allura-ink-black)]">
            {JSON.stringify(trace.metadata, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  )
}
