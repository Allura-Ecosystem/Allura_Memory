import { describe, expect, it, vi } from "vitest"
import type { ReadOnlyAskProvider } from "./ask-answer"
import { createProductionAskCandidate, type ProductionAuthorizedReadProviderLike } from "./production-ask"
import type { AuthorizedDocument } from "./read-service"
const scope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "u" }
const doc = (overrides: Partial<AuthorizedDocument> = {}): AuthorizedDocument => ({ id: "doc-a", groupId: scope.tenantId, workspaceId: scope.workspaceId, ownerId: "u", departmentId: null, visibility: "private", title: "Runbook", content: "Authorized body", updatedAt: new Date("2026-01-01T00:00:00Z"), ...overrides })
const provider = (answer: string, citationIds: readonly string[], hook?: () => void): ReadOnlyAskProvider => ({ policy: { retention: "none", training: "none" }, answer: async () => { hook?.(); return { answer, citationIds } } })
const authority = (overrides = {}) => ({ tenantId: scope.tenantId, workspaceId: scope.workspaceId, principalId: scope.principalId, sessionId: "s", actorRole: "viewer" as const, policyEpoch: 1, receiptWitnessHash: "a".repeat(64), priorReceiptWitnessHash: null as string | null, decision: "authorized" as const, ...overrides })
function reader(sequence: AuthorizedDocument[][], authorities = sequence.map((_, index) => authority(index === 0 ? {} : { receiptWitnessHash: "b".repeat(64), priorReceiptWitnessHash: "a".repeat(64) }))): ProductionAuthorizedReadProviderLike { let i = 0; return { readAuthorizedSnapshot: async (_scope, prior) => { const index = Math.min(i++, sequence.length - 1); const snapshot = { authority: authorities[index], documents: sequence[index] }; if (index > 0 && snapshot.authority.priorReceiptWitnessHash !== prior) return { ...snapshot, authority: { ...snapshot.authority, priorReceiptWitnessHash: "0".repeat(64) } }; return snapshot } } }
describe("provider-neutral production Ask candidate", () => {
  it("returns only a grounded answer with context-bound citations", async () => { await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([[doc()], [doc()]]), provider("Answer", ["doc-a"]))).resolves.toEqual({ answer: "Answer", citations: [{ documentId: "doc-a", title: "Runbook" }] }) })
  it("denies source removal or mutation during provider execution", async () => { const docs = [doc()]; await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([docs, []]), provider("Answer", ["doc-a"]))).resolves.toBeNull(); await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([[doc()], [doc({ content: "Changed" })]]), provider("Answer", ["doc-a"]))).resolves.toBeNull() })
  it("fails closed for policy refusal, provider failure, and fabricated citations", async () => { await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([[doc()], [doc()]]), provider("Answer", ["hidden"]))).resolves.toBeNull(); const bad = { ...provider("Answer", ["doc-a"]), policy: { retention: "indefinite", training: "none" } as never }; await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([[doc()]]), bad)).rejects.toThrow(/policy refused/); await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([[doc()], [doc()]]), { ...provider("Answer", ["doc-a"]), answer: async () => { throw new Error("secret backend") } })).resolves.toBeNull() })
  it("rejects malformed or duplicate source IDs before reading", async () => { let called = false; const r = { readAuthorizedSnapshot: async () => { called = true; return { authority: authority(), documents: [doc()] } } }; await expect(createProductionAskCandidate(scope, "Question", ["[[doc-a]]"], r, provider("Answer", ["doc-a"]))).rejects.toThrow(/source IDs refused/); await expect(createProductionAskCandidate(scope, "Question", ["doc-a", "doc-a"], r, provider("Answer", ["doc-a"]))).rejects.toThrow(/duplicate source IDs refused/); expect(called).toBe(false) })

  it("binds both reads to the complete server-derived authority tuple", async () => {
    const docs = [[doc()], [doc()]]
    for (const changed of [{ principalId: "other" }, { sessionId: "other" }, { actorRole: "admin" as const }, { policyEpoch: 2 }, { receiptWitnessHash: "bad" }, { priorReceiptWitnessHash: "c".repeat(64) }]) {
      await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader(docs, [authority(), authority({ receiptWitnessHash: "b".repeat(64), priorReceiptWitnessHash: "a".repeat(64), ...changed })]), provider("Answer", ["doc-a"]))).resolves.toBeNull()
    }
    await expect(createProductionAskCandidate({ ...scope, principalId: "other" }, "Question", ["doc-a"], reader(docs), provider("Answer", ["doc-a"]))).resolves.toBeNull()
  })

  it("refuses aggregate provider context above the hard UTF-16 budget", async () => {
    const ids = Array.from({ length: 64 }, (_, i) => `doc-${i}`)
    const documents = ids.map(id => doc({ id, title: "T".repeat(400), content: "C".repeat(512) }))
    const ask = vi.fn(async () => ({ answer: "Answer", citationIds: [ids[0]] }))
    await expect(createProductionAskCandidate(scope, "Question", ids, reader([documents]), { policy: { retention: "none", training: "none" }, answer: ask })).resolves.toBeNull()
    expect(ask).not.toHaveBeenCalled()
  })

  it("refuses an invalid question before reading authority or content", async () => {
    const readAuthorizedSnapshot = vi.fn()
    await expect(createProductionAskCandidate(scope, " bad\nquestion ", ["doc-a"], { readAuthorizedSnapshot }, provider("Answer", ["doc-a"]))).resolves.toBeNull()
    expect(readAuthorizedSnapshot).not.toHaveBeenCalled()
  })

  it("fails closed for duplicate or off-scope source rows and reader errors", async () => {
    const ask = vi.fn(async () => ({ answer: "Answer", citationIds: ["doc-a"] }))
    const approvedProvider: ReadOnlyAskProvider = { policy: { retention: "none", training: "none" }, answer: ask }
    await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], reader([
      [doc(), doc({ groupId: "allura-other" })],
      [doc({ groupId: "allura-other" })],
    ]), approvedProvider)).resolves.toBeNull()
    await expect(createProductionAskCandidate(scope, "Question", ["doc-a"], {
      readAuthorizedSnapshot: async () => { throw new Error("protected database detail") },
    }, approvedProvider)).resolves.toBeNull()
    expect(JSON.stringify(await createProductionAskCandidate(scope, "Question", ["doc-a"], reader([[]]), approvedProvider)))
      .not.toContain("protected database detail")
  })
})
