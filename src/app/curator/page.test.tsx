import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("curator pending proposal queue page safety", () => {
  const source = () => readFileSync("src/app/curator/page.tsx", "utf8")

  it("does not claim pending high-confidence memories are auto-promoted", () => {
    expect(source()).not.toMatch(/auto-promoted/i)
  })

  it("kept Story 4.1 pending queue rendering read-only before Story 4.2 actions", () => {
    const page = source()

    expect(page).not.toMatch(/Approve ✓|Reject ✕|Edit ✎/)
  })

  it("exposes Story 4.2 explicit approve and reject actions through the governed curator endpoint", () => {
    const page = source()

    expect(page).toContain("/api/curator/approve")
    expect(page).toMatch(/submitProposalDecision/)
    expect(page).toContain('submitProposalDecision(selectedProposal, "approve")')
    expect(page).toContain('submitProposalDecision(selectedProposal, "reject")')
    expect(page).toMatch(/Human rationale/i)
    expect(page).toMatch(/Approval writes semantic knowledge through the governed curator flow/i)
    expect(page).toMatch(/Reject keeps source evidence and records an audit receipt/i)
  })

  it("renders decision receipt state after approve or reject actions", () => {
    const page = source()

    expect(page).toContain("decisionReceipt")
    expect(page).toContain("Audit receipt")
    expect(page).toContain("previous_status")
    expect(page).toContain("resulting_status")
    expect(page).toContain("promoted_memory_id")
    expect(page).toContain("rationale")
    expect(page).toContain("decided_at")
  })

  it("shows missing curator receipts as degraded blockers rather than hiding them", () => {
    const page = source()

    expect(page).toContain("receipt_status")
    expect(page).toMatch(/missing receipt blocker/i)
    expect(page).toMatch(/Missing append-only decision receipt/i)
    expect(page).toContain("trace_reference")
    expect(page).toContain("source_event_type")
  })

  it("keeps the selected proposal detail mounted after decisions so receipts remain inspectable", () => {
    const page = source()

    expect(page).toContain("setDecisionReceipt(result.receipt ?? null)")
    expect(page).toContain("proposals.length === 0 && !decisionReceipt")
    expect(page).not.toContain("setSelectedProposal(null)\n    await fetchProposals()")
  })

  it("maps request evidence UI to request_evidence without claiming an unsupported proposal status", () => {
    const page = source()

    expect(page).toContain('submitProposalDecision(selectedProposal, "request_evidence")')
    expect(page).toMatch(/Request evidence/i)
    expect(page).toMatch(/Request evidence keeps the proposal pending/i)
    expect(page).toContain('decision: "needs_evidence"')
    expect(page).not.toContain('status: "needs_evidence"')
  })

  it("builds the pending queue URL with encoded search parameters", () => {
    const page = source()

    expect(page).toContain("new URLSearchParams")
    expect(page).toContain("group_id: groupId")
    expect(page).toContain('status: "pending"')
    expect(page).not.toContain("group_id=${groupId}&status=pending")
  })
  it("encodes group scope before fetching pending proposals", () => {
    const page = source()

    expect(page).toContain("new URLSearchParams")
    expect(page).toContain("group_id: groupId")
    expect(page).toContain('status: "pending"')
  })

  it("clears selected proposal details when group scope changes", () => {
    const page = source()

    expect(page).toContain("setSelectedProposal(null)")
  })

  it("clears stale rationale and receipt when selecting a proposal", () => {
    const page = source()

    expect(page).toContain("selectProposalForDecision")
    expect(page).toContain("setDecisionRationale(\"\")")
    expect(page).toContain("setDecisionReceipt(null)")
  })

  it("does not present approval as available when trace provenance is missing", () => {
    const page = source()

    expect(page).toContain("const approvalDisabled = selectedProposal ? !selectedProposal.trace_ref : true")
    expect(page).toContain("disabled={approvalDisabled}")
    expect(page).toMatch(/Approval requires trace requester provenance/i)
  })
})
