"use client"

import {
  Boxes,
  Check,
  FileCheck2,
  FileSearch,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"

import type { AuthUser } from "@/lib/auth/types"
import type { CuratorModuleIssue } from "@/lib/curator/module-contract"

import { postCuratorDecision } from "./curator-actions"
import { DecisionDialog } from "./decision-dialog"
import { CuratorModuleShell } from "./module-shell"
import {
  type CuratorDecision,
  type GovernanceReceipt,
  type Proposal,
  ProposalResponseSchema,
} from "./types"

type ConsoleTab = "queue" | "evidence" | "modules" | "receipt"
type SourceState = "loading" | "fresh" | "empty" | "error"
const QUEUE_TIMEOUT_MS = 10_000

const TABS: ReadonlyArray<{ id: ConsoleTab; label: string; icon: typeof FileSearch }> = [
  { id: "queue", label: "Review queue", icon: FileSearch },
  { id: "evidence", label: "Evidence path", icon: FileCheck2 },
  { id: "modules", label: "Module registry", icon: Boxes },
  { id: "receipt", label: "Receipt contract", icon: ReceiptText },
]

function references(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string") return [value]
  return []
}

function ReceiptPanel({ receipt, headingId }: { receipt: GovernanceReceipt; headingId: string }) {
  return (
    <section className="curator-receipt" aria-labelledby={headingId}>
      <div className="curator-panel-heading">
        <div>
          <p className="curator-eyebrow">Server-issued result</p>
          <h2 id={headingId}>Decision receipt</h2>
        </div>
        <span>{receipt.action}</span>
      </div>
      <dl className="curator-receipt-grid">
        <div><dt>Receipt ID</dt><dd>{receipt.id}</dd></div>
        <div><dt>Actor</dt><dd>{receipt.actor_id} · {receipt.actor_role}</dd></div>
        <div><dt>Policy</dt><dd>{receipt.policy_reference} · {receipt.policy_version}</dd></div>
        <div><dt>Recorded</dt><dd>{receipt.occurred_at}</dd></div>
        <div><dt>Rationale</dt><dd>{receipt.rationale}</dd></div>
        <div><dt>Outbox</dt><dd>{receipt.outbox_state}</dd></div>
      </dl>
    </section>
  )
}

export function CuratorDashboard({ user, issue }: { user: AuthUser; issue: CuratorModuleIssue }) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>("queue")
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceState, setSourceState] = useState<SourceState>("loading")
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [decisionTarget, setDecisionTarget] = useState<{ proposal: Proposal; decision: CuratorDecision } | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const selected = proposals.find((proposal) => proposal.id === selectedId) ?? proposals[0] ?? null
  const canReview = user.role === "curator" || user.role === "admin"

  async function load() {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), QUEUE_TIMEOUT_MS)
    setSourceState("loading")
    setSourceError(null)
    try {
      const query = new URLSearchParams({
        group_id: user.groupId,
        workspace_id: user.workspaceId ?? "",
        status: "all",
        limit: "50",
      })
      const response = await fetch(`/api/curator/proposals?${query.toString()}`, { signal: controller.signal })
      const body: unknown = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : `Queue failed (${response.status})`
        throw new Error(message)
      }
      const parsed = ProposalResponseSchema.parse(body)
      setProposals(parsed.proposals)
      setSelectedId((current) => current && parsed.proposals.some((proposal) => proposal.id === current) ? current : parsed.proposals[0]?.id ?? null)
      setSourceState(parsed.proposals.length === 0 ? "empty" : "fresh")
    } catch (error) {
      setProposals([])
      setSelectedId(null)
      setSourceState("error")
      setSourceError(error instanceof DOMException && error.name === "AbortError"
        ? "The proposal queue timed out after 10 seconds. No decision data was loaded."
        : error instanceof Error ? error.message : "The proposal queue is unavailable.")
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  useEffect(() => {
    void load()
    // Authenticated scope is immutable for this mounted operator surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.groupId, user.workspaceId])

  async function decide(rationale: string) {
    if (!decisionTarget) return
    setSubmitting(true)
    setDecisionError(null)
    try {
      const receipt = await postCuratorDecision({ ...decisionTarget, rationale })
      setProposals((current) => current.map((proposal) => proposal.id === decisionTarget.proposal.id
        ? {
          ...proposal,
          status: receipt.action === "approve" ? "approved" : receipt.action === "reject" ? "rejected" : proposal.status,
          decision_receipt: receipt,
        }
        : proposal))
      setDecisionTarget(null)
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "The decision could not be recorded.")
    } finally {
      setSubmitting(false)
    }
  }

  function moveTab(current: ConsoleTab, key: string) {
    const currentIndex = TABS.findIndex((tab) => tab.id === current)
    let nextIndex = currentIndex
    if (key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length
    else if (key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    else if (key === "Home") nextIndex = 0
    else if (key === "End") nextIndex = TABS.length - 1
    else return
    const next = TABS[nextIndex].id
    setActiveTab(next)
    document.getElementById(`curator-tab-${next}`)?.focus()
  }

  return (
    <div className="curator-dashboard">
      <div className="curator-workspace">
        <header className="curator-header">
          <div><span>Organization</span><strong>{user.groupId}</strong></div>
          <div><span>Workspace</span><strong>{user.workspaceId}</strong></div>
          <div><span>Authority</span><strong><ShieldCheck aria-hidden="true" /> {user.role}</strong></div>
        </header>

        <main className="curator-main">
          <div className="curator-title-row">
            <div>
              <p>Governed operator surface</p>
              <h1>Command Center</h1>
              <span>Inspect evidence, record a human decision, and verify the immutable receipt.</span>
            </div>
            <span className={`curator-state curator-state-${issue.state}`} role="status">{issue.message ?? `System state: ${issue.state}`}</span>
          </div>

          <div className="curator-tabs" role="tablist" aria-label="Command Center views">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                tabIndex={activeTab === id ? 0 : -1}
                aria-selected={activeTab === id}
                aria-controls={`curator-panel-${id}`}
                id={`curator-tab-${id}`}
                onClick={() => setActiveTab(id)}
                onKeyDown={(event) => {
                  if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) event.preventDefault()
                  moveTab(id, event.key)
                }}
              >
                <Icon aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          <section id="curator-panel-queue" role="tabpanel" aria-labelledby="curator-tab-queue" hidden={activeTab !== "queue"}>
            <div className="curator-review-grid" data-source-state={sourceState}>
              <section className="curator-queue" aria-labelledby="review-queue-heading">
                <div className="curator-panel-heading">
                  <div><p className="curator-eyebrow">Scoped work</p><h2 id="review-queue-heading">Review queue</h2></div>
                  <button type="button" className="curator-icon-button" aria-label="Refresh review queue" onClick={() => void load()} disabled={sourceState === "loading"}><RefreshCw aria-hidden="true" /></button>
                </div>
                {sourceState === "loading" && <p role="status">Loading the governed proposal queue…</p>}
                {sourceState === "error" && <div className="curator-error-state" role="alert"><strong>Queue unavailable</strong><span>{sourceError}</span></div>}
                {sourceState === "empty" && <div className="curator-empty" role="status"><strong>No proposals in this workspace</strong><span>The server returned an empty governed queue.</span></div>}
                {proposals.length > 0 && (
                  <div className="curator-case-list" aria-label="Proposal cases">
                    {proposals.map((proposal) => (
                      <button key={proposal.id} type="button" aria-pressed={selected?.id === proposal.id} onClick={() => setSelectedId(proposal.id)}>
                        <span className={`curator-status curator-status-${proposal.status}`}>{proposal.status}</span>
                        <strong>{proposal.content}</strong>
                        <small>{Math.round(proposal.score * 100)}% confidence · {proposal.tier}</small>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <div className="curator-review-detail">
                <section className="curator-evidence" aria-labelledby="evidence-heading">
                  <div className="curator-panel-heading">
                    <div><p className="curator-eyebrow">Evidence before action</p><h2 id="evidence-heading">Evidence</h2></div>
                    {selected && <span>{selected.trace_ref === null ? "No trace" : `event #${selected.trace_ref}`}</span>}
                  </div>
                  {!selected && <p>Select a proposal to inspect its source trace, reasoning, and evidence requests.</p>}
                  {selected && (
                    <div className="curator-evidence-stack">
                      <article><span>Proposal content</span><p>{selected.content}</p></article>
                      <article><span>Server reasoning</span><p>{selected.reasoning ?? "No reasoning was supplied."}</p></article>
                      <article>
                        <span>Evidence requests</span>
                        {selected.evidence.length === 0 ? <p>No additional evidence has been requested.</p> : selected.evidence.map((item) => (
                          <div key={item.id} className="curator-evidence-request">
                            <strong>{item.reason}</strong>
                            <small>{item.state} · requested {item.requested_at}</small>
                            {references(item.evidence_references).map((reference) => <code key={reference}>{reference}</code>)}
                          </div>
                        ))}
                      </article>
                    </div>
                  )}
                </section>

                <section className="curator-human-review" aria-labelledby="human-review-heading">
                  <div className="curator-panel-heading"><div><p className="curator-eyebrow">Rationale required</p><h2 id="human-review-heading">Human review</h2></div></div>
                  {!selected && <p>Decision controls unlock only for a server-scoped pending proposal.</p>}
                  {selected?.decision_receipt && <ReceiptPanel receipt={selected.decision_receipt} headingId="review-decision-receipt-heading" />}
                  {selected && !selected.decision_receipt && selected.status !== "pending" && <div className="curator-error-state" role="alert"><strong>Receipt unavailable</strong><span>This decided proposal has no server-issued receipt in the read contract.</span></div>}
                  {selected?.status === "pending" && canReview && (
                    <div className="curator-decision-actions">
                      <button type="button" className="curator-button curator-button-primary" onClick={() => setDecisionTarget({ proposal: selected, decision: "approve" })}><Check aria-hidden="true" /> Approve</button>
                      <button type="button" className="curator-button curator-button-secondary" onClick={() => setDecisionTarget({ proposal: selected, decision: "request_evidence" })}><FileSearch aria-hidden="true" /> Request more evidence</button>
                      <button type="button" className="curator-button curator-button-danger" onClick={() => setDecisionTarget({ proposal: selected, decision: "reject" })}><X aria-hidden="true" /> Reject</button>
                    </div>
                  )}
                  {selected?.status === "pending" && !canReview && <p role="status">Your viewer role can inspect evidence but cannot record decisions.</p>}
                </section>
              </div>
            </div>
          </section>

          <section id="curator-panel-evidence" role="tabpanel" aria-labelledby="curator-tab-evidence" hidden={activeTab !== "evidence"}>
            <h2>Evidence path</h2>
            <ol className="curator-flow" aria-label="Governed review flow">
              <li><strong>Queue</strong><span>Server-scoped proposal</span></li>
              <li><strong>Evidence</strong><span>Source trace and requests</span></li>
              <li><strong>Human review</strong><span>Rationale-bound decision</span></li>
              <li><strong>Receipt</strong><span>Immutable result</span></li>
            </ol>
          </section>

          <section id="curator-panel-modules" role="tabpanel" aria-labelledby="curator-tab-modules" hidden={activeTab !== "modules"}><CuratorModuleShell issue={issue} /></section>
          <section id="curator-panel-receipt" role="tabpanel" aria-labelledby="curator-tab-receipt" hidden={activeTab !== "receipt"}>
            <h2>Receipt contract</h2>
            <p>No decision is presented as complete until the server returns its immutable governance receipt.</p>
            {selected?.decision_receipt ? <ReceiptPanel receipt={selected.decision_receipt} headingId="contract-decision-receipt-heading" /> : <div className="curator-empty"><strong>No selected receipt</strong><span>Choose a decided proposal or record a governed decision.</span></div>}
          </section>
        </main>
      </div>

      {decisionTarget && <DecisionDialog proposal={decisionTarget.proposal} decision={decisionTarget.decision} submitting={submitting} serverError={decisionError} onCancel={() => { setDecisionTarget(null); setDecisionError(null) }} onConfirm={decide} />}
    </div>
  )
}
