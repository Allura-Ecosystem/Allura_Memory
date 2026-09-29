import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ syscall: vi.fn(), insertWorkspaceEvent: vi.fn(), insertEvent: vi.fn() }))
vi.mock("@/control-plane/ruvix", () => ({ RuVixControlPlane: { syscall: mocks.syscall } }))
vi.mock("@/lib/postgres/queries/insert-trace", () => ({
  insertWorkspaceEvent: mocks.insertWorkspaceEvent,
  insertEvent: mocks.insertEvent,
}))

import { logTrace } from "@/lib/postgres/trace-logger"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.syscall.mockResolvedValue({
    success: true,
    auditId: "audit-allura-system-trace-1",
    proof: { signature: "signed-proof" },
  })
  mocks.insertWorkspaceEvent.mockImplementation(async (event) => ({
    ...event,
    id: 7,
    workspace_id: "workspace-a",
    outcome: event.outcome ?? {},
    metadata: event.metadata ?? {},
    status: event.status ?? "completed",
    confidence: event.confidence ?? null,
    evidence_ref: event.evidence_ref ?? null,
    workflow_id: event.workflow_id ?? null,
    step_id: event.step_id ?? null,
    parent_event_id: event.parent_event_id ?? null,
    created_at: new Date(0),
    inserted_at: new Date(0),
  }))
})

describe("trace authority receipt", () => {
  it("binds proof context and the durable event receipt to workspace, session, actor, and payload", async () => {
    await logTrace({
      group_id: "allura-system",
      workspace_id: "workspace-a",
      session_id: "verified-session",
      agent_id: "verified-user",
      trace_type: "decision",
      content: "approved design decision",
      confidence: 0.9,
      metadata: { source: "epic-30" },
    })

    const [, , context] = mocks.syscall.mock.calls[0]
    expect(context.audit_context).toMatchObject({
      trace_type: "decision",
      workspace_id: "workspace-a",
    })
    expect(context.audit_context.session_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(context.audit_context.payload_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(context.audit_context).not.toHaveProperty("content_preview")

    const event = mocks.insertWorkspaceEvent.mock.calls[0][0]
    expect(event.metadata.authority_receipt).toMatchObject({
      version: 1,
      group_id: "allura-system",
      workspace_id: "workspace-a",
      actor_id: "verified-user",
      payload_hash: context.audit_context.payload_hash,
      session_hash: context.audit_context.session_hash,
      audit_id: "audit-allura-system-trace-1",
    })
    expect(event.metadata.authority_receipt.proof_signature_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(event.metadata.authority_receipt)).not.toContain("verified-session")
    expect(mocks.insertEvent).not.toHaveBeenCalled()
  })
})
