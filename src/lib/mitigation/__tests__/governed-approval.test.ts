/**
 * Story 26.5 AC-6/AC-7 — governed mitigation-approval receipt path.
 *
 * These tests exercise the REAL control-plane gate (executeSyscall in
 * ./syscalls.ts is not mocked) so a missing/malformed approval_ref genuinely
 * fails closed through the same REQ-GOV-008 code path production uses.
 * Only the DB-touching leaves (target-resolver) and the policy engine are
 * mocked, mirroring src/control-plane/syscalls.test.ts's own convention.
 */

import { randomUUID } from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MitigationDraft } from "../types"
import type { TenantScope } from "../../inventory/types"

const mockResolveTarget = vi.fn()

vi.mock("@/control-plane/target-resolver", () => ({
  resolveTarget: mockResolveTarget,
}))

vi.mock("@/control-plane/policy", () => ({
  evaluatePoliciesOrThrow: vi.fn(),
}))

process.env.RUVIX_CONTROL_PLANE_SECRET =
  "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars"

const { recordGovernedMitigationApproval } = await import("../governed-approval")

function makeScope(): TenantScope {
  return { group_id: "allura-test", workspace_id: "workspace-a" }
}

function makeDraft(override?: Partial<MitigationDraft>): MitigationDraft {
  return {
    id: "draft-1",
    group_id: "allura-test",
    workspace_id: "workspace-a",
    alert_id: "alert-1",
    template_id: "template-package-block-v1",
    template_version: "1.0.0",
    parameters: {},
    scope_explanation: "affects package foo@1.2.3",
    dry_run_result: "would block foo@1.2.3 in workspace-a",
    rollback_evidence: "no changes applied; nothing to roll back",
    authority_state: "simulated_only",
    approval_state: "reviewed",
    evidence_ids: ["evidence-1"],
    created_at: "2026-08-26T00:00:00Z",
    ...override,
  }
}

describe("Story 26.5 — recordGovernedMitigationApproval", () => {
  beforeEach(() => {
    mockResolveTarget.mockReset()
    mockResolveTarget.mockResolvedValue({ success: true, affected_rows: 1 })
  })

  it("fails closed when approval_ref is missing", async () => {
    await expect(
      recordGovernedMitigationApproval(
        makeScope(),
        makeDraft(),
        { id: "security-owner-1", role: "admin" },
        "approved_for_activation",
        "verified exposure, approving for later enforcement",
        ""
      )
    ).rejects.toThrow(/approval_ref/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("fails closed when approval_ref is not a well-formed UUID", async () => {
    await expect(
      recordGovernedMitigationApproval(
        makeScope(),
        makeDraft(),
        { id: "security-owner-1", role: "admin" },
        "approved_for_activation",
        "verified exposure, approving for later enforcement",
        "not-a-uuid"
      )
    ).rejects.toThrow(/approval_ref/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("persists a real row through the control-plane gate given a valid approval_ref", async () => {
    const approvalRef = randomUUID()
    const receipt = await recordGovernedMitigationApproval(
      makeScope(),
      makeDraft(),
      { id: "security-owner-1", role: "admin" },
      "approved_for_activation",
      "verified exposure, approving for later enforcement",
      approvalRef
    )

    expect(mockResolveTarget).toHaveBeenCalledTimes(1)
    const call = mockResolveTarget.mock.calls[0]![0]
    expect(call.target).toBe("pg:mitigation_receipts")
    expect(call.intent).toBe("mutate")
    expect(call.data.approval_ref).toBe(approvalRef)
    expect(call.data.group_id).toBe("allura-test")

    expect(receipt.approval_ref).toBe(approvalRef)
    expect(receipt.action).toBe("approved_for_activation")
    expect(receipt.draft_id).toBe("draft-1")
    expect(receipt.evidence_ids).toEqual(["evidence-1"])
  })

  it("rejects a rationale that is blank", async () => {
    await expect(
      recordGovernedMitigationApproval(
        makeScope(),
        makeDraft(),
        { id: "security-owner-1", role: "admin" },
        "rejected",
        "   ",
        randomUUID()
      )
    ).rejects.toThrow(/rationale/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("rejects a draft whose tenant scope does not match the caller's scope", async () => {
    await expect(
      recordGovernedMitigationApproval(
        makeScope(),
        makeDraft({ workspace_id: "workspace-other" }),
        { id: "security-owner-1", role: "admin" },
        "approved_for_activation",
        "verified exposure, approving for later enforcement",
        randomUUID()
      )
    ).rejects.toThrow(/tenant scope/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("propagates resolveTarget failure as a thrown error", async () => {
    mockResolveTarget.mockResolvedValueOnce({ success: false })
    await expect(
      recordGovernedMitigationApproval(
        makeScope(),
        makeDraft(),
        { id: "security-owner-1", role: "admin" },
        "rejected",
        "rejecting: draft scope too broad",
        randomUUID()
      )
    ).rejects.toThrow()
  })
})
