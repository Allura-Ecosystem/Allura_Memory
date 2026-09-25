import { describe, expect, it, vi } from "vitest"
import { ProductionMembershipStore } from "./workspace-membership-production"
const scope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "admin", sessionId: "s", role: "admin" as const, policyEpoch: 1 }
describe("production membership provenance adapter", () => {
  it("rechecks the exact current database actor instead of echoing caller authority", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: "admin", policyEpoch: "1" }] })
    const store = new ProductionMembershipStore({ query } as never)
    await expect(store.currentActor(scope)).resolves.toEqual(scope)
    expect(query.mock.calls[0][0]).toContain("current_setting('app.current_principal'")
    expect(query.mock.calls[0][1]).toEqual(["allura-test", "workspace-a", "admin", 1])
    query.mockResolvedValueOnce({ rows: [{ role: "viewer", policyEpoch: "1" }] })
    await expect(store.currentActor(scope)).resolves.toBeNull()
  })
  it("uses restricted exact-scope reads and maps verified approvals", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ approvalId: "a", action: "grant", tenantId: "allura-test", workspaceId: "workspace-a", subjectUserId: "u", approverId: "admin", approverRole: "workspace_membership_admin", provenanceRef: "control-plane:a", verified: true, policyEpoch: 1, revokedAt: null }] })
    const store = new ProductionMembershipStore({ query } as never)
    await expect(store.verifiedApproval("a")).resolves.toMatchObject({ verified: true, provenanceRef: "control-plane:a" })
    expect(query.mock.calls[0][0]).toContain("current_setting('app.current_group_id'")
  })
  it("has no implicit production write path", async () => {
    const store = new ProductionMembershipStore({ query: vi.fn() } as never)
    await expect(store.commitGrant()).rejects.toThrow(/governed transaction adapter/)
    await expect(store.commitRevoke()).rejects.toThrow(/governed transaction adapter/)
  })
  it("does not accept owner-pool or client-authority configuration", () => {
    expect(ProductionMembershipStore.length).toBe(1)
    expect(scope.role).toBe("admin")
  })
})
