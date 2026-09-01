import { type CuratorDecision, type GovernanceReceipt, GovernanceReceiptSchema, type Proposal } from "./types"

export async function postCuratorDecision(input: {
  proposal: Proposal
  decision: CuratorDecision
  rationale: string
}): Promise<GovernanceReceipt> {
  const response = await fetch("/api/curator/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proposal_id: input.proposal.id,
      group_id: input.proposal.group_id,
      decision: input.decision,
      rationale: input.rationale,
    }),
  })
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : `Decision failed (${response.status})`
    throw new Error(message)
  }
  return GovernanceReceiptSchema.parse(body)
}
