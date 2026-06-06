import type { CuratorDecision, DecisionReceipt, Proposal } from "./types"

export interface CuratorDecisionResponse {
  success: boolean
  decided_at?: string
  receipt?: DecisionReceipt
}

function toBackendDecision(decision: CuratorDecision): "approve" | "reject" | "request_evidence" {
  return decision === "request_changes" ? "request_evidence" : decision
}

function toBackendRationale(decision: CuratorDecision, rationale: string): string {
  return decision === "request_changes" ? `Request changes: ${rationale}` : rationale
}

export async function postCuratorDecision(params: {
  proposal: Proposal
  decision: CuratorDecision
  rationale: string
}): Promise<CuratorDecisionResponse> {
  const res = await fetch("/api/curator/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proposal_id: params.proposal.id,
      group_id: params.proposal.group_id,
      decision: toBackendDecision(params.decision),
      rationale: toBackendRationale(params.decision, params.rationale),
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `Decision failed (${res.status})`)
  }
  return body as CuratorDecisionResponse
}
