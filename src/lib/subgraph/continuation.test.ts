import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  assertSubgraphContinuationBindings,
  createSubgraphContinuation,
  decodeSubgraphContinuation,
  hashSubgraphBinding,
  SubgraphContinuationError,
} from "./continuation"
import type { SubgraphContinuationClaims } from "./contract"

const secret = Buffer.alloc(32, 17)
const claims: SubgraphContinuationClaims = {
  contractVersion: "2.0",
  tenantId: "allura-system",
  workspaceId: "workspace-a",
  principalId: "viewer-a",
  sessionHash: hashSubgraphBinding("session-a"),
  role: "viewer",
  policyEpoch: 3,
  routePolicyVersion: "focused-subgraph-read-v1",
  normalizedQueryHash: hashSubgraphBinding("query-a"),
  effectiveBudgets: { nodeLimit: 20, edgeLimit: 40, depth: 2 },
  graphRevision: 9,
  boundary: { node: { distance: 1, kindRank: 0, freshnessAt: "2026-10-12T00:00:00.000Z", nodeKey: "memory:a" }, edge: null },
  issuedAt: "2026-10-12T00:00:00.000Z",
  expiresAt: "2026-10-12T00:15:00.000Z",
  keyVersion: 1,
}

describe("focused subgraph continuation", () => {
  it("encrypts and authenticates graph-domain claims", () => {
    const token = createSubgraphContinuation(claims, secret)
    expect(token).not.toContain("allura-system")
    expect(decodeSubgraphContinuation(token, secret, { now: new Date("2026-10-12T00:05:00Z") })).toEqual(claims)
  })

  it("fails closed for tamper, the wrong key, expiry, and unknown key versions", () => {
    const token = createSubgraphContinuation(claims, secret)
    for (const run of [
      () => decodeSubgraphContinuation(`${token.slice(0, -1)}x`, secret),
      () => decodeSubgraphContinuation(token, Buffer.alloc(32, 18)),
      () => decodeSubgraphContinuation(token, secret, { now: new Date("2026-10-12T00:16:00Z") }),
      () => decodeSubgraphContinuation(token, secret, { acceptedKeyVersions: [2] }),
    ]) expect(run).toThrow(SubgraphContinuationError)
  })

  it("binds authority, query, policy, budgets, and revision", () => {
    const expected = {
      tenantId: claims.tenantId, workspaceId: claims.workspaceId, principalId: claims.principalId,
      sessionHash: claims.sessionHash, role: claims.role, policyEpoch: claims.policyEpoch,
      routePolicyVersion: claims.routePolicyVersion, normalizedQueryHash: claims.normalizedQueryHash,
      effectiveBudgets: claims.effectiveBudgets, graphRevision: claims.graphRevision,
    }
    expect(() => assertSubgraphContinuationBindings(claims, expected)).not.toThrow()
    expect(() => assertSubgraphContinuationBindings(claims, { ...expected, workspaceId: "workspace-b" })).toThrow(/authority/i)
    expect(() => assertSubgraphContinuationBindings(claims, { ...expected, graphRevision: 10 })).toThrow(/snapshot/i)
    expect(() => assertSubgraphContinuationBindings(claims, { ...expected, policyEpoch: 4 })).toThrow(/policy/i)
  })
})
