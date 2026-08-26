/**
 * RuVector Graph Adapter — Live DB E2E Test
 *
 * Tests the RuVectorGraphAdapter against a real PostgreSQL database
 * with GRAPH_BACKEND=ruvector. This is NOT DB-mocked.
 *
 * Gated: skips when RUN_E2E_TESTS !== "true" or POSTGRES_PASSWORD is unset.
 *
 * ADR: AD-029 — Graph Adapter Pattern for Neo4j → RuVector Migration
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createGraphAdapter } from "@/lib/graph-adapter/factory"
import type { IGraphAdapter } from "@/lib/graph-adapter/types"
import { closePool, getPool } from "@/lib/postgres/connection"

// ── Gate: only run against a live stack ──────────────────────────────────────

const runLiveE2E =
  process.env.RUN_E2E_TESTS === "true" && Boolean(process.env.POSTGRES_PASSWORD)

// ── Test-scoped tenant ────────────────────────────────────────────────────────

/** Tenant used exclusively by this test file — never allura-system. */
const E2E_GROUP = "allura-test-e2e"
const E2E_WORKSPACE = "workspace-test-e2e"
const E2E_PRINCIPAL = "adapter-live-e2e"

// ── Describe block ────────────────────────────────────────────────────────────

describe.skipIf(!runLiveE2E)("RuVector Graph Adapter — Live DB E2E", () => {
  let pool: import("pg").Pool
  let adapter: IGraphAdapter
  const testMemoryIds: string[] = []

  beforeAll(async () => {
    // Set GRAPH_BACKEND before creating adapter
    process.env.GRAPH_BACKEND = "ruvector"

    pool = getPool()
    adapter = createGraphAdapter({ pg: pool })
    await pool.query(
      `INSERT INTO workspaces(workspace_id,group_id,name)
       VALUES($1,$2,'Graph adapter live E2E') ON CONFLICT DO NOTHING`,
      [E2E_WORKSPACE, E2E_GROUP],
    )
  })

  afterAll(async () => {
    // Cleanup: delete all test data for this tenant
    try {
      await pool.query(
        `DELETE FROM graph_memories WHERE group_id = $1`,
        [E2E_GROUP]
      )
    } catch {
      // Non-fatal: cleanup best effort
    }

    // Close adapter (doesn't close the shared pool)
    await adapter.close()
    // Close pool (this is shared, but it's okay to close here since we own it)
    await closePool()
  })

  // ── AC-1, AC-3: Create memory ──────────────────────────────────────────────

  it("AC-1/AC-3: createMemory — creates memory node and returns id", async () => {
    const memoryId = `mem-live-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    testMemoryIds.push(memoryId)

    const createdId = await adapter.createMemory({
      id: memoryId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "Live DB test memory content",
      score: 0.8 as unknown as import("@/lib/memory/canonical-contracts").ConfidenceScore,
      provenance: "conversation" as import("@/lib/memory/canonical-contracts").MemoryProvenance,
      created_at: new Date().toISOString(),
    })

    expect(createdId).toBe(memoryId)

    // Verify the row exists in DB
    const result = await pool.query(
      `SELECT id, group_id, content, deprecated FROM graph_memories WHERE id = $1 AND group_id = $2`,
      [memoryId, E2E_GROUP]
    )
    expect(result.rows.length).toBe(1)
    expect(result.rows[0].content).toBe("Live DB test memory content")
    expect(result.rows[0].deprecated).toBe(false)
  })

  // ── AC-3: Read memory ──────────────────────────────────────────────────────

  it("AC-3: getMemory — retrieves created memory", async () => {
    // Use a memory created in previous test
    const testMemoryId = testMemoryIds[0]

    const result = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: testMemoryId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })

    expect(result.node).not.toBeNull()
    expect(result.node?.id).toBe(testMemoryId)
    expect(result.node?.content).toBe("Live DB test memory content")
    expect(result.node?.group_id).toBe(E2E_GROUP)
    expect(result.node?.deprecated).toBe(false)
  })

  // ── AC-3: Search memory ────────────────────────────────────────────────────

  it("AC-3: searchMemories — full-text search finds memory", async () => {
    const results = await adapter.searchMemories({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      query: "test",
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      limit: 10,
    })

    expect(Array.isArray(results)).toBe(true)
    // The memory from the previous test should be found
    const found = results.find((r) => r.id === testMemoryIds[0])
    expect(found).toBeDefined()
    expect(found?.content).toBe("Live DB test memory content")
  })

  // ── AC-3: List memories ────────────────────────────────────────────────────

  it("AC-3: listMemories — returns memories for tenant", async () => {
    const result = await adapter.listMemories({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      user_id: null,
    })

    expect(Array.isArray(result.memories)).toBe(true)
    expect(result.total).toBeGreaterThan(0)
    // Should include the memory created in this test run
    const found = result.memories.find((m) => m.id === testMemoryIds[0])
    expect(found).toBeDefined()
  })

  // ── AC-3: Count memories ───────────────────────────────────────────────────

  it("AC-3: countMemories — retired tenant-only lifecycle fails closed", async () => {
    await expect(adapter.countMemories({ group_id:E2E_GROUP as never, user_id:null }))
      .rejects.toThrow("tenant-only graph lifecycle operation is retired")
    return
    const result = await adapter.countMemories({
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      user_id: null,
    })

    expect(result.total).toBeGreaterThan(0)
  })

  // ── AC-4: SUPERSEDES immutability ──────────────────────────────────────────

  it("AC-4: supersedesMemory — creates new node, marks old deprecated, no mutation", async () => {
    // Create a new memory to test superseding
    const oldId = `mem-supersede-${Date.now()}`
    testMemoryIds.push(oldId)

    await adapter.createMemory({
      id: oldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "Original content",
      score: 0.8 as unknown as import("@/lib/memory/canonical-contracts").ConfidenceScore,
      provenance: "conversation" as import("@/lib/memory/canonical-contracts").MemoryProvenance,
      created_at: new Date().toISOString(),
    })

    // Verify original exists
    const getOld = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: oldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })
    expect(getOld.node?.content).toBe("Original content")

    // Supersede with new version
    const newId = `mem-supersede-${Date.now()}-v2`
    testMemoryIds.push(newId)

    const supersedesResult = await adapter.supersedesMemory({
      prev_id: oldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      new_id: newId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "Updated content",
      version: 2,
      created_at: new Date().toISOString(),
    })

    expect(supersedesResult.success).toBe(true)
    expect(supersedesResult.newId).toBe(newId)
    expect(supersedesResult.newVersion).toBe(2)

    // Old node should now be deprecated
    const getOldAfter = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: oldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })
    expect(getOldAfter.node).toBeNull() // Not returned because deprecated=true

    // Old node in DB should be deprecated
    const oldRow = await pool.query(
      `SELECT deprecated FROM graph_memories WHERE id = $1`,
      [oldId]
    )
    expect(oldRow.rows[0].deprecated).toBe(true)

    // New node should be canonical (non-deprecated, not superseded)
    const getNew = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: newId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })
    expect(getNew.node?.content).toBe("Updated content")
    expect(getNew.node?.version).toBe(2)

    // SUPERSEDES relationship should exist
    const supersedesRow = await pool.query(
      `SELECT newer_id, superseded_id FROM graph_supersedes WHERE newer_id = $1 AND superseded_id = $2`,
      [newId, oldId]
    )
    expect(supersedesRow.rows.length).toBe(1)
  })

  // ── AC-4: Restore memory ───────────────────────────────────────────────────

  it("AC-4: restoreMemory — retired tenant-only lifecycle fails closed", async () => {
    await expect(adapter.restoreMemory({ id:"retired-restore" as never, group_id:E2E_GROUP as never, restored_at:new Date().toISOString() }))
      .rejects.toThrow("tenant-only graph lifecycle operation is retired")
    return
    // First create and supersede another memory
    const restoreOldId = `mem-restore-${Date.now()}`
    const restoreNewId = `mem-restore-${Date.now()}-v2`
    testMemoryIds.push(restoreOldId, restoreNewId)

    await adapter.createMemory({
      id: restoreOldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "Content to restore",
      score: 0.8 as unknown as import("@/lib/memory/canonical-contracts").ConfidenceScore,
      provenance: "conversation" as import("@/lib/memory/canonical-contracts").MemoryProvenance,
      created_at: new Date().toISOString(),
    })

    await adapter.supersedesMemory({
      prev_id: restoreOldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      new_id: restoreNewId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "Superseded content",
      version: 2,
      created_at: new Date().toISOString(),
    })

    // Verify old node is deprecated
    const oldDeprecated = await pool.query(
      `SELECT deprecated FROM graph_memories WHERE id = $1`,
      [restoreOldId]
    )
    expect(oldDeprecated.rows[0].deprecated).toBe(true)

    // Restore the old node
    const restoreResult = await adapter.restoreMemory({
      id: restoreOldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      restored_at: new Date().toISOString(),
    })
    expect(restoreResult.restored).toBe(true)

    // Old node should no longer be deprecated
    const oldRestored = await pool.query(
      `SELECT deprecated, restored_at IS NOT NULL as has_restored_at FROM graph_memories WHERE id = $1`,
      [restoreOldId]
    )
    expect(oldRestored.rows[0].deprecated).toBe(false)
    expect(oldRestored.rows[0].has_restored_at).toBe(true)

    // SUPERSEDES relationship should be removed
    const supersedesRemoved = await pool.query(
      `SELECT COUNT(*) as cnt FROM graph_supersedes WHERE superseded_id = $1`,
      [restoreOldId]
    )
    expect(Number(supersedesRemoved.rows[0].cnt)).toBe(0)

    // Old node should now be retrievable (canonical)
    const restoredNode = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: restoreOldId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })
    expect(restoredNode.node?.content).toBe("Content to restore")
  })

  // ── AC-5: Group ID scoping ──────────────────────────────────────────────────

  it("AC-5: group_id scoping — own tenant returns data, foreign tenant returns empty", async () => {
    // We already wrote to allura-test-e2e in previous tests
    // Now try to read from a foreign tenant (should be empty)
    const foreignTenant = "allura--other"

    // Create a memory in our tenant
    const ourMemoryId = `mem-our-${Date.now()}`
    testMemoryIds.push(ourMemoryId)

    await adapter.createMemory({
      id: ourMemoryId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "Memory in our tenant",
      score: 0.8 as unknown as import("@/lib/memory/canonical-contracts").ConfidenceScore,
      provenance: "conversation" as import("@/lib/memory/canonical-contracts").MemoryProvenance,
      created_at: new Date().toISOString(),
    })

    // Read from our tenant (should find it)
    const ourResult = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: ourMemoryId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })
    expect(ourResult.node).not.toBeNull()
    expect(ourResult.node?.content).toBe("Memory in our tenant")

    // Try to read from foreign tenant (should be null)
    const foreignResult = await adapter.getMemory({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      id: ourMemoryId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: foreignTenant as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })
    expect(foreignResult.node).toBeNull()

    // List from foreign tenant (should be empty)
    const foreignList = await adapter.listMemories({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      group_id: foreignTenant as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      user_id: null,
    })
    expect(foreignList.total).toBe(0)
    expect(foreignList.memories.length).toBe(0)

    // Search in foreign tenant (should be empty)
    const foreignSearch = await adapter.searchMemories({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      query: "tenant",
      group_id: foreignTenant as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      limit: 10,
    })
    expect(foreignSearch.length).toBe(0)
  })

  // ── AC-6: Full-text search via tsvector ─────────────────────────────────────

  it("AC-6: searchMemories with tsvector — full-text search works", async () => {
    // Create memories with distinct keywords
    const keywordMemoryId = `mem-keyword-${Date.now()}`
    testMemoryIds.push(keywordMemoryId)

    await adapter.createMemory({
      id: keywordMemoryId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      workspace_id: E2E_WORKSPACE,
      principal_id: E2E_PRINCIPAL,
      user_id: null,
      content: "This memory contains the keyword search test",
      score: 0.8 as unknown as import("@/lib/memory/canonical-contracts").ConfidenceScore,
      provenance: "conversation" as import("@/lib/memory/canonical-contracts").MemoryProvenance,
      created_at: new Date().toISOString(),
    })

    // Search for "keyword" — should find the memory
    const results = await adapter.searchMemories({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      query: "keyword",
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      limit: 10,
    })

    const foundByKeyword = results.find((r) => r.id === keywordMemoryId)
    expect(foundByKeyword).toBeDefined()
    expect(foundByKeyword?.content).toContain("keyword")

    // Search for "search" — should also find it
    const searchResults = await adapter.searchMemories({ workspace_id: E2E_WORKSPACE, principal_id: E2E_PRINCIPAL,
      query: "search",
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      limit: 10,
    })
    const foundBySearch = searchResults.find((r) => r.id === keywordMemoryId)
    expect(foundBySearch).toBeDefined()

    // Both searches should have relevance scores
    expect(foundByKeyword?.relevance).toBeGreaterThan(0)
    expect(foundBySearch?.relevance).toBeGreaterThan(0)
  })

  // ── AC-8: Health check ─────────────────────────────────────────────────────

  it("AC-8: isHealthy — returns true when PG is reachable", async () => {
    const healthy = await adapter.isHealthy()
    expect(healthy).toBe(true)
  })

  // ── Additional: Get version ────────────────────────────────────────────────

  it("Extra: getVersion — retired tenant-only lifecycle fails closed", async () => {
    await expect(adapter.getVersion({ id:"retired-version" as never, group_id:E2E_GROUP as never }))
      .rejects.toThrow("tenant-only graph lifecycle operation is retired")
    return
    // Use a memory we know has version=1
    const testId = testMemoryIds[0]

    const result = await adapter.getVersion({
      id: testId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })

    expect(result.exists).toBe(true)
    expect(result.version).toBe(1) // Created with default version
  })

  // ── Additional: Check canonical ─────────────────────────────────────────────

  it("Extra: checkCanonical — retired tenant-only lifecycle fails closed", async () => {
    await expect(adapter.checkCanonical({ id:"retired-canonical" as never, group_id:E2E_GROUP as never }))
      .rejects.toThrow("tenant-only graph lifecycle operation is retired")
    return
    // Use a memory we created (should be canonical)
    const testId = testMemoryIds[0]

    const result = await adapter.checkCanonical({
      id: testId as unknown as import("@/lib/memory/canonical-contracts").MemoryId,
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
    })

    expect(result.isCanonical).toBe(true)
  })

  // ── Additional: Export memories ────────────────────────────────────────────

  it("Extra: exportMemories — retired tenant-only lifecycle fails closed", async () => {
    await expect(adapter.exportMemories({ group_id:E2E_GROUP as never, user_id:null, offset:0, limit:10 }))
      .rejects.toThrow("tenant-only graph lifecycle operation is retired")
    return
    const result = await adapter.exportMemories({
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      user_id: null,
      offset: 0,
      limit: 10,
    })

    expect(Array.isArray(result.memories)).toBe(true)
    expect(result.memories.length).toBeGreaterThan(0)
    // All memories should have required fields
    for (const m of result.memories) {
      expect(m.id).toBeDefined()
      expect(m.group_id).toBe(E2E_GROUP)
      expect(m.content).toBeDefined()
    }
  })

  // ── Additional: Export with offset/limit pagination ────────────────────────

  it("Extra: exportMemories pagination — retired tenant-only lifecycle fails closed", async () => {
    await expect(adapter.exportMemories({ group_id:E2E_GROUP as never, user_id:null, offset:1, limit:1 }))
      .rejects.toThrow("tenant-only graph lifecycle operation is retired")
    return
    // Get first page
    const page1 = await adapter.exportMemories({
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      user_id: null,
      offset: 0,
      limit: 1,
    })

    // Get second page
    const page2 = await adapter.exportMemories({
      group_id: E2E_GROUP as unknown as import("@/lib/memory/canonical-contracts").GroupId,
      user_id: null,
      offset: 1,
      limit: 1,
    })

    // Both pages should have exactly 1 memory
    expect(page1.memories.length).toBe(1)
    expect(page2.memories.length).toBe(1)

    // They should be different memories (if total > 1)
    if (page1.memories.length > 0 && page2.memories.length > 0) {
      expect(page1.memories[0].id).not.toBe(page2.memories[0].id)
    }
  })
})
