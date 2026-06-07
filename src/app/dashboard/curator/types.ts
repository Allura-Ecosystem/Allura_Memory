export type ProposalStatus = "pending" | "approved" | "rejected"
export type ProposalTier = "emerging" | "adoption" | "mainstream"
export type CuratorDecision = "approve" | "reject" | "request_evidence" | "request_changes"

export interface DecisionReceipt {
  proposal_id: string
  group_id: string
  decision: "approved" | "rejected" | "needs_evidence" | "missing_receipt"
  previous_status: "pending"
  resulting_status: ProposalStatus | "pending"
  promoted_memory_id: string | null
  queued_memory_id?: string | null
  actor: string
  rationale: string | null
  decided_at: string | null
  trace_reference?: string | number | null
  source_event_type?: string
  receipt_status?: "available" | "missing_receipt_blocker"
  degraded_reason?: string
}

export interface Proposal {
  id: string
  group_id: string
  content: string
  score: number
  reasoning: string
  tier: ProposalTier
  status: ProposalStatus
  trace_ref: number | null
  created_at: string
  decision_receipt?: DecisionReceipt | null
}
