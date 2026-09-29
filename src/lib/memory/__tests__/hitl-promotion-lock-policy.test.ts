import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8")
}

describe("Governed Auto-Promotion policy (Sabir's rule, restored 2026-09-29)", () => {
  it("memory_add auto mode must promote through the governed atomic transaction, never raw graph writes", () => {
    const source = readRepoFile("src/mcp/canonical-tools.ts")
    const memoryAdd = source.slice(
      source.indexOf("export async function memory_add"),
      source.indexOf("/**\n * 2. memory_search")
    )

    // Auto promotion exists and routes through the governed approval path
    expect(memoryAdd).toContain("isAutoPromoteEnabled()")
    expect(memoryAdd).toContain("approveProposal")
    expect(memoryAdd).toContain("AUTO_CURATOR_PRINCIPAL_ID")

    // Raw graph writes are still forbidden in memory_add
    expect(memoryAdd).not.toContain("memory_add:create_memory")
    expect(memoryAdd).not.toMatch(/graphAdapter\.createMemory\s*\(/)

    // The engine can never approve its own request (segregation of duties)
    expect(memoryAdd).toContain("agentId !== AUTO_CURATOR_PRINCIPAL_ID")

    // HITL-held content categories are respected even in auto mode
    expect(memoryAdd).toContain("requiresHITL")

    // soc2 queueing path is preserved
    expect(memoryAdd).toContain("canonical_proposals")
    expect(memoryAdd).toContain("pending_review: true")
  })

  it("public tool descriptions describe governed promotion, not bypass", () => {
    const autoPromote = readRepoFile("src/lib/curator/auto-promote.ts")

    // The engine module documents both modes
    expect(autoPromote).toMatch(/soc2/)
    expect(autoPromote).toMatch(/auto/)
    // And documents the no-self-promotion invariant
    expect(autoPromote).toMatch(/requester/i)
  })

  it("auto-promote engine module must not bypass the governed transaction", () => {
    const autoPromote = readRepoFile("src/lib/curator/auto-promote.ts")
    const batchRunner = readRepoFile("src/scripts/auto-curate-pending.ts")

    // Neither the engine nor the batch runner may write to the graph directly
    expect(autoPromote).not.toMatch(/graphAdapter|INSERT INTO graph_memories/)
    expect(batchRunner).not.toMatch(/graphAdapter|INSERT INTO graph_memories/)
    // Both must route through the governed approval
    expect(batchRunner).toContain("approveProposal")
    // Both must hold compliance/session-log/governance content for HITL
    expect(autoPromote).toContain("requiresHITL")
    expect(batchRunner).toContain("requiresHITL")
  })

  it("governance policy pol-004 reflects the restored auto mode", () => {
    const policies = readRepoFile("src/lib/governance/policies.ts")
    expect(policies).toContain("Governed Promotion (No Agent Self-Promotion)")
    expect(policies).not.toMatch(/always HITL-gated/)
  })

  it("knowledge promotion must require approval audit before graph writes", () => {
    const source = readRepoFile("src/lib/memory/knowledge-promotion.ts")
    const batchPromotion = source.slice(
      source.indexOf("export async function processApprovedInsights"),
      source.indexOf("export async function promoteSingleInsight")
    )
    const singlePromotion = source.slice(
      source.indexOf("export async function promoteSingleInsight")
    )

    expect(source).toContain("import { requireApprovalBeforePromotion }")

    for (const promotionPath of [batchPromotion, singlePromotion]) {
      const guardIndex = promotionPath.indexOf("requireApprovalBeforePromotion")
      const neo4jIndex = promotionPath.indexOf("promoteToNeo4j")

      expect(guardIndex).toBeGreaterThanOrEqual(0)
      expect(neo4jIndex).toBeGreaterThanOrEqual(0)
      expect(guardIndex).toBeLessThan(neo4jIndex)
    }
  })

  it("curator approval entrypoints must log approval audit before graph writes", () => {
    const batchScript = readRepoFile("scripts/batch-approve-proposals.ts")

    const auditIndex = batchScript.indexOf("await logApprovalEvent")
    const graphWriteIndex = batchScript.indexOf("await createInsight")

    expect(auditIndex).toBeGreaterThanOrEqual(0)
    expect(graphWriteIndex).toBeGreaterThanOrEqual(0)
    expect(auditIndex).toBeLessThan(graphWriteIndex)
    expect(batchScript).toContain('decision: "approved"')
    expect(batchScript).toContain("memory_id:")

    // The web route uses the atomic governed transaction (approveProposal) —
    // receipts are written inside that transaction, so no manual ordering
    // between logApprovalEvent and enqueuePromotionSync is applicable.
    const route = readRepoFile("src/app/api/curator/approve/route.ts")
    expect(route).toContain("approveProposal")
    expect(route).not.toContain("await createInsight")
  })
})