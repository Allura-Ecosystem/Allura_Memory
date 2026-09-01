/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CuratorDashboard } from "@/components/curator/curator-dashboard"

const user = {
  id: "curator-1",
  email: "curator@example.test",
  name: "Rosa Marin",
  role: "curator" as const,
  groupId: "allura-acme",
  workspaceId: "workspace-a",
  sessionId: "session-a",
}

const proposal = {
  id: "11111111-2222-4333-8444-555555555555",
  group_id: "allura-acme",
  workspace_id: "workspace-a",
  content: "Preserve the verified source relationship for the launch decision.",
  score: 0.92,
  reasoning: "The source event and workspace policy agree.",
  tier: "adoption",
  status: "pending",
  trace_ref: 42,
  created_at: "2026-08-30T10:00:00.000Z",
  evidence: [
    {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      proposal_id: "11111111-2222-4333-8444-555555555555",
      requested_by: "agent-1",
      requested_at: "2026-08-30T10:05:00.000Z",
      state: "open",
      reason: "Confirm the source packet hash.",
      resolved_at: null,
      resolved_by: null,
      evidence_references: ["event:42", "packet:launch"],
    },
  ],
  decision_receipt: null,
}

const issue = {
  state: "complete" as const,
  modules: [
    {
      id: "bumblebee" as const,
      state: "available" as const,
      title: "Bumblebee - Supply-Chain Threat Intelligence",
      summary: { sources: 4, unpinnedActions: 1, openExposures: 2, incidents: 1, receipts: 3 },
    },
  ],
}

const receipt = {
  id: "99999999-8888-4777-8666-555555555555",
  proposal_id: proposal.id,
  action: "approve",
  actor_id: user.id,
  actor_role: "curator",
  rationale: "Evidence and policy support promotion.",
  policy_reference: "policy://allura/curator-decision",
  policy_version: "25.2a/v1",
  memory_id: "memory-1",
  result_ref: "outbox-1",
  outbox_state: "queued",
  evidence_request_id: null,
  evidence_references: ["event:42"],
  occurred_at: "2026-08-30T10:10:00.000Z",
}

beforeEach(() => cleanup())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("brand-locked curator command center", () => {
  it("loads the scoped queue and places evidence before human review controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ proposals: [proposal] }), { status: 200 })))

    const { container } = render(<CuratorDashboard user={user} issue={issue} />)

    expect((await screen.findAllByText(proposal.content)).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText("event #42")).toBeDefined()
    expect(screen.getByText("Confirm the source packet hash.")).toBeDefined()
    expect(screen.getByRole("button", { name: "Approve" })).toBeDefined()

    const evidence = screen.getByRole("heading", { name: "Evidence" })
    const review = screen.getByRole("heading", { name: "Human review" })
    expect(evidence.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('[data-source-state="fresh"]')).not.toBeNull()
  })

  it("supports arrow-key navigation across the command center tabs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ proposals: [] }), { status: 200 })))
    render(<CuratorDashboard user={user} issue={issue} />)

    const queueTab = screen.getByRole("tab", { name: "Review queue" })
    const evidenceTab = screen.getByRole("tab", { name: "Evidence path" })
    queueTab.focus()
    fireEvent.keyDown(queueTab, { key: "ArrowRight" })

    expect(evidenceTab.getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(evidenceTab)
    expect(queueTab.getAttribute("tabindex")).toBe("-1")
  })

  it("requires rationale and renders only the server-returned receipt as success", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify(receipt), { status: 200 })
      return new Response(JSON.stringify({ proposals: [proposal] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<CuratorDashboard user={user} issue={issue} />)
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }))

    const dialog = screen.getByRole("dialog", { name: "Approve proposal" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Record approval" }))
    expect(within(dialog).getByRole("alert").textContent).toMatch(/rationale is required/i)

    fireEvent.change(within(dialog).getByLabelText(/human rationale/i), {
      target: { value: "Evidence and policy support promotion." },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Record approval" }))

    expect(await screen.findByRole("heading", { name: "Decision receipt" })).toBeDefined()
    expect(within(screen.getByRole("region", { name: "Human review" })).getByText(receipt.id)).toBeDefined()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const post = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      proposal_id: proposal.id,
      group_id: user.groupId,
      decision: "approve",
      rationale: "Evidence and policy support promotion.",
    })
  })

  it("keeps decision controls unavailable to a viewer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ proposals: [proposal] }), { status: 200 })))

    render(<CuratorDashboard user={{ ...user, role: "viewer" }} issue={issue} />)

    expect(await screen.findByText(/viewer role can inspect evidence/i)).toBeDefined()
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull()
  })

  it("reports a queue failure truthfully and never invents proposal data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Database connection unavailable" }), { status: 503 })))

    const { container } = render(<CuratorDashboard user={user} issue={issue} />)

    expect((await screen.findByRole("alert")).textContent).toContain("Database connection unavailable")
    expect(container.querySelector('[data-source-state="error"]')).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
  })

  it("leaves loading state when the queue request times out", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
    })))

    render(<CuratorDashboard user={user} issue={issue} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(screen.getByRole("alert").textContent).toMatch(/timed out/i)
  })
})
