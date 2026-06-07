import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "fs"

import { postCuratorDecision } from "@/app/dashboard/curator/curator-actions"
import type { Proposal } from "@/app/dashboard/curator/types"

const proposal: Proposal = {
  id: "proposal-1",
  group_id: "allura-test",
  content: "Promote this governed memory",
  score: 0.91,
  reasoning: "Human evidence is sufficient",
  tier: "mainstream",
  status: "pending",
  trace_ref: 42,
  created_at: "2026-06-05T12:00:00.000Z",
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const pageSource = () => readFileSync("src/app/dashboard/curator/page.tsx", "utf8")
const dialogSource = () => readFileSync("src/app/dashboard/curator/decision-dialog.tsx", "utf8")
const actionSource = () => readFileSync("src/app/dashboard/curator/curator-actions.ts", "utf8")

type FetchMock = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  mock: { calls: Array<[RequestInfo | URL, RequestInit?]> }
}

function installFetchMock(response: Response): FetchMock {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response) as unknown as FetchMock
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function requestBody(fetchMock: FetchMock): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1]
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

describe("curator dashboard approve/reject actions", () => {
  it("renders governed approve/reject affordances only through confirmation dialogs", () => {
    const page = pageSource()
    const dialog = dialogSource()
    const action = actionSource()

    expect(page).toContain("DecisionDialog")
    expect(page).toContain("Approve proposal")
    expect(page).toContain("Reject proposal")
    expect(dialog).toContain('role="dialog"')
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain("rationale is required")
    expect(action).toContain("/api/curator/approve")
    expect(action).not.toContain("/api/curator/promote")
  })

  it("renders request-evidence and request-changes affordances without adding schema states", () => {
    const page = pageSource()
    const action = actionSource()

    expect(page).toContain("Request Evidence")
    expect(page).toContain("Request Changes")
    expect(action).toContain("toBackendDecision")
    expect(action).toContain("request_evidence")
    expect(action).not.toContain('decision: "request_changes"')
    expect(page).not.toContain("needs_changes")
  })

  it("documents focus-trap and focus-restore behavior for the decision dialog", () => {
    const page = pageSource()
    const dialog = dialogSource()

    expect(dialog).toContain("previouslyFocusedElement")
    expect(dialog).toContain("focusableSelectors")
    expect(dialog).toContain("e.key === \"Tab\"")
    expect(dialog).toContain("previouslyFocusedElement.current?.focus()")
    expect(page).toContain("restoreFocusRef={queueHeadingRef}")
  })

  it("normalizes invalid URL status filters before rendering empty states or API requests", () => {
    const page = pageSource()

    expect(page).toContain("function normalizeFilterStatus")
    expect(page).toContain('searchParams.get("status")')
    expect(page).toContain('status\"))')
    expect(page).not.toContain('as FilterStatus')
  })

  it("posts governed approval decisions through the shared curator action helper", async () => {
    const fetchMock = installFetchMock(new Response(JSON.stringify({ success: true }), { status: 200 }))

    await expect(postCuratorDecision({ proposal, decision: "approve", rationale: "Evidence supports promotion" })).resolves.toEqual({ success: true })

    expect(fetchMock).toHaveBeenCalledWith("/api/curator/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        decision: "approve",
        rationale: "Evidence supports promotion",
      }),
    })
  })

  it("surfaces route errors instead of silently changing proposal state", async () => {
    installFetchMock(new Response(JSON.stringify({ error: "rationale is required" }), { status: 400 }))

    await expect(postCuratorDecision({ proposal, decision: "reject", rationale: "" })).rejects.toThrow("rationale is required")
  })

  it("posts request-evidence as the documented pending-preserving backend decision", async () => {
    const fetchMock = installFetchMock(new Response(JSON.stringify({ success: true }), { status: 200 }))

    await postCuratorDecision({ proposal, decision: "request_evidence", rationale: "Attach the source packet" })

    expect(requestBody(fetchMock)).toMatchObject({
      proposal_id: "proposal-1",
      group_id: "allura-test",
      decision: "request_evidence",
      rationale: "Attach the source packet",
    })
  })

  it("maps request-changes UI intent onto request-evidence backend behavior", async () => {
    const fetchMock = installFetchMock(new Response(JSON.stringify({ success: true }), { status: 200 }))

    await postCuratorDecision({ proposal, decision: "request_changes", rationale: "Clarify the memory scope" })

    expect(requestBody(fetchMock)).toMatchObject({
      proposal_id: "proposal-1",
      group_id: "allura-test",
      decision: "request_evidence",
      rationale: "Request changes: Clarify the memory scope",
    })
  })

  it("renders read-only curator decision receipts with required audit fields", () => {
    const page = pageSource()
    const types = readFileSync("src/app/dashboard/curator/types.ts", "utf8")
    const action = actionSource()

    expect(types).toContain("DecisionReceipt")
    expect(action).toContain("receipt?: DecisionReceipt")
    expect(page).toContain("DecisionReceiptPanel")
    expect(page).toContain("Decision Receipt")
    expect(page).toContain("Actor")
    expect(page).toContain("Timestamp")
    expect(page).toContain("Rationale")
    expect(page).toContain("Prior status")
    expect(page).toContain("New status")
    expect(page).toContain("Trace reference")
    expect(page).toContain("Promoted memory")
    expect(page).toContain("read-only")
  })

  it("shows degraded receipt blockers instead of hiding missing receipts", () => {
    const page = pageSource()

    expect(page).toContain("missing_receipt_blocker")
    expect(page).toContain("Missing append-only curator decision receipt")
    expect(page).toContain("Receipt unavailable")
    expect(page).toContain("proposal.status !== \"pending\"")
  })
})
