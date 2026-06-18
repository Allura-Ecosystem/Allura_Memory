/**
 * Seeding + retrieval helpers shared by the retrieval and governance benchmarks.
 *
 * Memories are seeded under a `-loadtest` group so writes are stored directly as
 * episodic (skipping the HITL proposal queue) and are immediately searchable via
 * RuVector / the events fallback.
 */

import type { BrainClient } from "./client"
import type { CorpusDoc } from "./dataset"
import { markerFor } from "./dataset"

/** Subset of the `memory_search` response the harness relies on. */
export interface SearchResult {
  results: Array<{ id: string; content: string; score: number; source?: string }>
  count: number
  latency_ms?: number
}

/** Subset of the `memory_add` response the harness relies on. */
export interface AddResult {
  id: string
  stored: string
  score?: number
  tier?: string
  pending_review?: boolean
}

/** Seed every doc in the corpus, embedding a run-scoped relevance marker. */
export async function seedCorpus(
  client: BrainClient,
  opts: { groupId: string; userId: string; runId: string; docs: CorpusDoc[] },
): Promise<number> {
  let seeded = 0
  for (const doc of opts.docs) {
    const marker = markerFor(opts.runId, doc.key)
    await client.call<AddResult>("memory_add", {
      group_id: opts.groupId,
      user_id: opts.userId,
      content: `${doc.text} ${marker}`,
      metadata: { source: "manual", agent_id: "benchmark" },
    })
    seeded++
  }
  return seeded
}

/**
 * Run a search and return the ordered list of corpus keys it surfaced, judged by
 * the run-scoped marker embedded in each result's content. Non-benchmark hits
 * and duplicates are dropped; order is preserved (first occurrence wins).
 */
export async function searchKeys(
  client: BrainClient,
  opts: { groupId: string; query: string; k: number; runId: string },
): Promise<{ keys: string[]; latencyMs: number; rawCount: number }> {
  const res = await client.tryCall<SearchResult>("memory_search", {
    query: opts.query,
    group_id: opts.groupId,
    limit: opts.k,
    // status:"all" includes episodic stores; the default "approved" returns only
    // canonical Neo4j insights, which freshly-seeded fixtures never are.
    status: "all",
  })
  const results = res.data?.results ?? []
  const prefix = `[[BENCH:${opts.runId}:`
  const seen = new Set<string>()
  const keys: string[] = []
  for (const r of results) {
    const idx = r.content.indexOf(prefix)
    if (idx === -1) continue
    const end = r.content.indexOf("]]", idx)
    if (end === -1) continue
    const key = r.content.slice(idx + prefix.length, end)
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }
  return { keys, latencyMs: res.latencyMs, rawCount: results.length }
}
