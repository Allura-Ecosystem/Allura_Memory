import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const repoRoot = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8")
}

describe("HITL Promotion Lock policy", () => {
  it("memory_add must not contain an auto-promotion graph write path", () => {
    const source = readRepoFile("src/mcp/canonical-tools.ts")
    const memoryAdd = source.slice(
      source.indexOf("export async function memory_add"),
      source.indexOf("/**\n * 2. memory_search")
    )

    expect(memoryAdd).not.toContain('PROMOTION_MODE === "auto"')
    expect(memoryAdd).not.toContain("memory_add:create_memory")
    expect(memoryAdd).not.toMatch(/graphAdapter\.createMemory\s*\(/)
    expect(memoryAdd).not.toContain('event_type, agent_id, status, metadata, created_at)\n        ) VALUES ($1, $2, $3, $4, $5, $6)`')
    expect(memoryAdd).toContain("canonical_proposals")
    expect(memoryAdd).toContain("pending_review: true")
  })

  it("public tool descriptions describe HITL queueing, not autonomous promotion", () => {
    const server = readRepoFile("src/mcp/memory-server-canonical.ts")
    const gateway = readRepoFile("src/mcp/canonical-http-gateway.ts")
    const contracts = readRepoFile("src/lib/memory/canonical-contracts.ts")

    for (const source of [server, gateway, contracts]) {
      expect(source).not.toMatch(/auto(?:nomous)? promotion|auto mode|promotes? immediately/i)
      expect(source).toMatch(/HITL|human review|curator review|approved semantic promotion/i)
    }
  })

  it("batch proposal processing must not expose a PROMOTION_MODE=auto no-HITL path", () => {
    const autoPromote = readRepoFile("src/lib/curator/auto-promote.ts")
    const processor = readRepoFile("src/scripts/process-pending-proposals.ts")

    expect(autoPromote).not.toContain('process.env.PROMOTION_MODE === "auto"')
    expect(autoPromote).not.toMatch(/without requiring HITL|without HITL|promoted immediately/i)
    expect(processor).not.toMatch(/PROMOTION_MODE=auto.*no HITL|auto-approves \(no HITL\)/i)
    expect(processor).toMatch(/awaiting HITL review|HITL/i)
  })

  it("knowledge promotion must require approval audit before Neo4j writes", () => {
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
    const route = readRepoFile("src/app/api/curator/approve/route.ts")
    const batchScript = readRepoFile("scripts/batch-approve-proposals.ts")

    for (const source of [route, batchScript]) {
      const auditIndex = source.indexOf("await logApprovalEvent")
      const graphWriteIndex = source.indexOf("await createInsight")

      expect(auditIndex).toBeGreaterThanOrEqual(0)
      expect(graphWriteIndex).toBeGreaterThanOrEqual(0)
      expect(auditIndex).toBeLessThan(graphWriteIndex)
      expect(source).toContain('decision: "approved"')
      expect(source).toContain("memory_id:")
    }
  })
})
