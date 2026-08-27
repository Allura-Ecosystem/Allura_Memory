/**
 * Story 26.6 — governed containment authorization.
 *
 * These tests exercise the REAL control-plane gate (executeSyscall in
 * ../../control-plane/syscalls.ts is not mocked) so a missing/malformed
 * approval_ref genuinely fails closed through the same REQ-GOV-008 code
 * path production uses -- mirrors src/lib/mitigation/__tests__/governed-approval.test.ts's
 * convention exactly. Only the DB-touching leaves (target-resolver, policy,
 * withWorkspaceTransaction) are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "crypto"
import type { ResolvedWorkspaceScope } from "../../db/workspace-scope"
import type { ContainmentProposal } from "../types"

const mockResolveTarget = vi.fn()
const mockWithWorkspaceTransaction = vi.fn()

vi.mock("@/control-plane/target-resolver", () => ({ resolveTarget: mockResolveTarget }))
vi.mock("@/control-plane/policy", () => ({ evaluatePoliciesOrThrow: vi.fn() }))
vi.mock("../../db/tenant-transaction", () => ({ withWorkspaceTransaction: mockWithWorkspaceTransaction }))

process.env.RUVIX_CONTROL_PLANE_SECRET = "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars"
process.env.CONTAINMENT_MCP_TOKEN_REVOCATION_ENABLED = "true"
process.env.CONTAINMENT_WORKSPACE_LOCK_ENABLED = "true"

const { executeContainmentAction } = await import("../governed-authorization")

function scope(): ResolvedWorkspaceScope {
  return { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "security-owner-1" }
}

function tokenRevocationProposal(): ContainmentProposal {
  return {
    connector: "mcp_token_revocation",
    action: "revoke",
    target_ref: "token-123",
    group_id: "allura-test",
    workspace_id: "workspace-a",
    description: "would revoke token-123",
    reversible: false,
    rollback_description: "not reversible",
  }
}

function workspaceLockProposal(): ContainmentProposal {
  return {
    connector: "workspace_lock",
    action: "lock:full_lockdown",
    target_ref: "workspace-b",
    group_id: "allura-test",
    workspace_id: "workspace-a",
    description: "would lock workspace-b",
    reversible: true,
    rollback_description: "reversible",
  }
}

describe("Story 26.6 — executeContainmentAction", () => {
  const mockQuery = vi.fn()

  beforeEach(() => {
    mockResolveTarget.mockReset().mockResolvedValue({ success: true, affected_rows: 1 })
    mockWithWorkspaceTransaction.mockReset()
    mockQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 })
    mockWithWorkspaceTransaction.mockImplementation(async (_scope: unknown, callback: (c: unknown) => unknown) =>
      callback({ query: mockQuery }),
    )
  })

  it("rejects a non-admin actor before any DB call at all (AD-58)", async () => {
    await expect(
      executeContainmentAction(
        scope(),
        tokenRevocationProposal(),
        { id: "curator-1", role: "curator" },
        "attempting containment as curator",
        randomUUID(),
        "policy-v1",
      ),
    ).rejects.toThrow(/admin/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
  })

  it("rejects endpoint_isolation regardless of role or approval (no connector implementation)", async () => {
    const proposal: ContainmentProposal = {
      connector: "endpoint_isolation",
      action: "isolate",
      target_ref: "endpoint-1",
      group_id: "allura-test",
      workspace_id: "workspace-a",
      description: "would isolate endpoint-1",
      reversible: true,
      rollback_description: "n/a",
    }

    await expect(
      executeContainmentAction(scope(), proposal, { id: "admin-1", role: "admin" }, "test", randomUUID(), "policy-v1"),
    ).rejects.toThrow(/no connector implementation/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("rejects a disabled connector before any DB call", async () => {
    delete process.env.CONTAINMENT_WORKSPACE_LOCK_ENABLED
    await expect(
      executeContainmentAction(
        scope(),
        workspaceLockProposal(),
        { id: "admin-1", role: "admin" },
        "test",
        randomUUID(),
        "policy-v1",
      ),
    ).rejects.toThrow(/disabled/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
    process.env.CONTAINMENT_WORKSPACE_LOCK_ENABLED = "true"
  })

  it("rejects a proposal whose tenant scope does not match the caller's scope", async () => {
    const proposal = { ...tokenRevocationProposal(), group_id: "allura-other" }
    await expect(
      executeContainmentAction(scope(), proposal, { id: "admin-1", role: "admin" }, "test", randomUUID(), "policy-v1"),
    ).rejects.toThrow(/tenant scope/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("rejects a blank rationale", async () => {
    await expect(
      executeContainmentAction(scope(), tokenRevocationProposal(), { id: "admin-1", role: "admin" }, "   ", randomUUID(), "policy-v1"),
    ).rejects.toThrow(/rationale/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("fails closed when approval_ref is missing (real REQ-GOV-008 gate, not a mock)", async () => {
    await expect(
      executeContainmentAction(scope(), tokenRevocationProposal(), { id: "admin-1", role: "admin" }, "test", "", "policy-v1"),
    ).rejects.toThrow(/approval_ref/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
  })

  it("fails closed when approval_ref is not a well-formed UUID", async () => {
    await expect(
      executeContainmentAction(scope(), tokenRevocationProposal(), { id: "admin-1", role: "admin" }, "test", "not-a-uuid", "policy-v1"),
    ).rejects.toThrow(/approval_ref/i)
    expect(mockResolveTarget).not.toHaveBeenCalled()
  })

  it("persists a real receipt and only then performs the real mutation, for token revocation", async () => {
    const approvalRef = randomUUID()
    const receipt = await executeContainmentAction(
      scope(),
      tokenRevocationProposal(),
      { id: "admin-1", role: "admin" },
      "suspected leaked token",
      approvalRef,
      "policy-v1",
    )

    expect(mockResolveTarget).toHaveBeenCalledTimes(1)
    const receiptCall = mockResolveTarget.mock.calls[0]![0]
    expect(receiptCall.target).toBe("pg:containment_receipts")
    expect(receiptCall.data.approval_ref).toBe(approvalRef)
    expect(receiptCall.data.actor_role).toBe("admin")

    expect(mockWithWorkspaceTransaction).toHaveBeenCalledTimes(1)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0]![0]).toContain("UPDATE mcp_tokens")
    expect(mockQuery.mock.calls[0]![1]).toEqual(["token-123", "allura-test"])

    expect(receipt.approval_ref).toBe(approvalRef)
    expect(receipt.authorization_chain).toEqual(["role:admin", `policy:policy-v1`, `approval:${approvalRef}`])
  })

  it("persists a real receipt and performs the real mutation for workspace lock", async () => {
    const approvalRef = randomUUID()
    await executeContainmentAction(
      scope(),
      workspaceLockProposal(),
      { id: "admin-1", role: "admin" },
      "active incident containment",
      approvalRef,
      "policy-v1",
    )

    expect(mockQuery.mock.calls[0]![0]).toContain("UPDATE workspaces")
    expect(mockQuery.mock.calls[0]![1]).toEqual(["full_lockdown", "workspace-b", "allura-test"])
  })

  it("never performs the real mutation if the gated receipt insert fails (fail-safe ordering)", async () => {
    mockResolveTarget.mockResolvedValue({ success: false, error: "simulated DB failure" })

    await expect(
      executeContainmentAction(
        scope(),
        tokenRevocationProposal(),
        { id: "admin-1", role: "admin" },
        "test",
        randomUUID(),
        "policy-v1",
      ),
    ).rejects.toThrow()

    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
  })
})
