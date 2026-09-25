import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { WorkspaceMembershipLifecycleFixture } from "./workspace-membership-lifecycle-fixture"
import { grantWorkspaceMembership, readBackWorkspaceMembership, revokeWorkspaceMembership, type MembershipScope, type VerifiedMembershipApproval } from "./workspace-membership-lifecycle"

const actor: MembershipScope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "admin", sessionId: "session-a", role: "admin", policyEpoch: 7 }
const subject = { tenantId: actor.tenantId, workspaceId: actor.workspaceId, userId: "user-a" }
function approval(id: string, action: "grant" | "revoke", overrides: Partial<VerifiedMembershipApproval> = {}): VerifiedMembershipApproval { return { approvalId: id, action, tenantId: actor.tenantId, workspaceId: actor.workspaceId, subjectUserId: subject.userId, approverId: "membership-admin", approverRole: "workspace_membership_admin", provenanceRef: "signed-control-plane-ref", verified: true, policyEpoch: actor.policyEpoch, revokedAt: null, ...overrides } }
function fixture() { const value = new WorkspaceMembershipLifecycleFixture(actor); value.approvals.push(approval("grant-a", "grant"), approval("revoke-a", "revoke")); return value }

describe("workspace membership lifecycle", () => {
  it("grants from verified provenance, acknowledges a content-free receipt, and reads back exact state", async () => {
    const f = fixture(); const result = await grantWorkspaceMembership(actor, subject, "grant-a", f.deps())
    expect(result).toMatchObject({ ok: true, value: { approvedBy: "membership-admin", approvalId: "grant-a", policyEpoch: 1, revokedAt: null } })
    expect(f.consumedApprovals.includes("grant-a")).toBe(true)
    expect(JSON.stringify(f.receipts)).not.toContain(actor.sessionId)
    expect(f.receipts[0]).toMatchObject({ action: "membership_grant", authorityEpoch: 7, targetEpoch: 1 })
  })

  it.each([
    ["unverified", { verified: false }], ["revoked", { revokedAt: "revoked" }],
    ["wrong tenant", { tenantId: "allura-other" }], ["wrong workspace", { workspaceId: "other" }],
    ["wrong subject", { subjectUserId: "other" }], ["stale authority", { policyEpoch: 6 }],
    ["missing provenance", { provenanceRef: "" }], ["wrong action", { action: "revoke" }],
  ])("denies %s approval provenance without mutation", async (_label, change) => {
    const f = fixture(); f.approvals = f.approvals.filter(value => value.approvalId !== "grant-a"); f.approvals.push(approval("grant-a", "grant", change as Partial<VerifiedMembershipApproval>))
    expect(await grantWorkspaceMembership(actor, subject, "grant-a", f.deps())).toEqual({ ok: false, code: "DENIED" })
    expect(f.memberships).toHaveLength(0)
  })

  it("fails closed on receipt outage, mismatch, and replay before mutation", async () => {
    const outage = fixture(); outage.failReceipts = true
    expect(await grantWorkspaceMembership(actor, subject, "grant-a", outage.deps())).toEqual({ ok: false, code: "UNAVAILABLE" })
    const mismatch = fixture(); mismatch.mismatchReceipt = true
    expect(await grantWorkspaceMembership(actor, subject, "grant-a", mismatch.deps())).toEqual({ ok: false, code: "UNAVAILABLE" })
    const replay = fixture(); const ids = () => "fixed"
    expect((await grantWorkspaceMembership(actor, subject, "grant-a", replay.deps(ids))).ok).toBe(true)
    replay.approvals.push(approval("grant-b", "grant")); replay.memberships[0].revokedAt = "revoked"
    expect(await grantWorkspaceMembership(actor, subject, "grant-b", replay.deps(ids))).toEqual({ ok: false, code: "UNAVAILABLE" })
  })

  it("atomically denies actor or approval changes in the final commit window", async () => {
    const actorRace = fixture(); actorRace.beforeAtomicCommit = () => { actorRace.actor.policyEpoch = 8 }
    expect(await grantWorkspaceMembership(actor, subject, "grant-a", actorRace.deps())).toEqual({ ok: false, code: "DENIED" })
    const approvalRace = fixture(); approvalRace.beforeAtomicCommit = () => { approvalRace.approvals.find(value => value.approvalId === "grant-a")!.revokedAt = "revoked" }
    expect(await grantWorkspaceMembership(actor, subject, "grant-a", approvalRace.deps())).toEqual({ ok: false, code: "DENIED" })
  })

  it("requires separately verified revoke provenance and increments target epoch monotonically", async () => {
    const f = fixture(); await grantWorkspaceMembership(actor, subject, "grant-a", f.deps())
    const revoked = await revokeWorkspaceMembership(actor, subject, "revoke-a", f.deps())
    expect(revoked).toMatchObject({ ok: true, value: { approvalId: "revoke-a", policyEpoch: 2, revokedAt: "revoked" } })
    expect(await revokeWorkspaceMembership(actor, subject, "revoke-a", f.deps()).then(r => r.ok)).toBe(false)
  })

  it("regrants only with a new approval and never regresses the target epoch", async () => {
    const f = fixture(); await grantWorkspaceMembership(actor, subject, "grant-a", f.deps()); await revokeWorkspaceMembership(actor, subject, "revoke-a", f.deps())
    f.approvals.push(approval("grant-b", "grant"))
    expect(await grantWorkspaceMembership(actor, subject, "grant-b", f.deps())).toMatchObject({ ok: true, value: { policyEpoch: 3 } })
    expect(await grantWorkspaceMembership(actor, subject, "grant-a", f.deps())).toEqual({ ok: false, code: "DENIED" })
  })

  it("limits read-back to an exact current admin scope and rechecks after receipt", async () => {
    const f = fixture(); await grantWorkspaceMembership(actor, subject, "grant-a", f.deps())
    expect((await readBackWorkspaceMembership(actor, subject, f.deps())).ok).toBe(true)
    expect(await readBackWorkspaceMembership({ ...actor, role: "member" }, subject, f.deps())).toEqual({ ok: false, code: "DENIED" })
    expect(await readBackWorkspaceMembership({ ...actor, workspaceId: "other" }, subject, f.deps())).toEqual({ ok: false, code: "DENIED" })
    const original = f.persist.bind(f); f.persist = async receipt => { const ack = await original(receipt); f.actor.sessionId = "changed"; return ack }
    expect(await readBackWorkspaceMembership(actor, subject, f.deps())).toEqual({ ok: false, code: "DENIED" })
  })

  it("has no owner-pool, route, client authority, or Brain dependency", () => {
    const source = readFileSync(new URL("./workspace-membership-lifecycle.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/getPool|getOwnerPool|owner-pool|next\/headers|brain-client|read-service|api\//i)
  })
})
