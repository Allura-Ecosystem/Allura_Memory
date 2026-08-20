/**
 * Bootstrap Fixtures for Allura M1
 *
 * Seeds 100 episodic traces, triggers curator scoring, and approves 5 insights
 * so that memory_search returns real approved data.
 *
 * Usage: bun scripts/bootstrap-fixtures.ts
 *
 * Prerequisites:
 * - PostgreSQL running with allura_memories table
 * - Neo4j running with schema applied
 * - MCP server environment (.env loaded)
 */

import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(__dirname, "../.env.local") })
config({ path: resolve(__dirname, "../.env") })

import type { GroupId, MemoryId } from "../src/lib/memory/canonical-contracts"

const GROUP_ID = "allura-system" as unknown as GroupId
const USER_ID = "bootstrap-fixture"

// 100 fixture memories covering different domains
const FIXTURES = [
  // Architecture decisions (5 — these will be approved)
  "Architecture decision: Allura uses dual-layer storage — PostgreSQL for episodic traces, Neo4j for canonical semantic insights. No direct agent writes to Neo4j.",
  "Architecture decision: Memory promotion follows SOC2 mode — all insights must pass curator scoring and human approval before activation in the graph.",
  "Architecture decision: RuVector serves as the primary retrieval backend for episodic memory with hybrid vector + BM25 search.",
  "Architecture decision: Scope resolution is implicit — every memory call carries tenant, group, project, agent, and session identity.",
  "Architecture decision: All memory operations are append-only. Updates create new versions with SUPERSEDES relationships; originals are deprecated, never deleted.",

  // Project context (15)
  "Allura Memory project is located at /home/ronin704/Projects/allura memory",
  "The tech stack is Next.js + Bun + TypeScript with PostgreSQL and Neo4j",
  "RuVix is the controlPlane enforcement gate that blocks direct database access from agents",
  "Docker compose runs PostgreSQL, Neo4j, and the MCP server container",
  "The MCP server exposes 10 canonical memory operations via stdio transport",
  "Canonical proposals are stored in the canonical_proposals PostgreSQL table",
  "Neo4j schema is initialized by docker/neo4j-init/00-schema.cypher on container start",
  "Circuit breakers wrap all database operations to prevent cascade failures",
  "Budget enforcement limits write operations per agent per group per time window",
  "The curator scoring function weighs source type, usage count, and age",
  "Dedup checking runs before proposal insertion to prevent near-duplicate insights",
  "The degraded state contract distinguishes between no_approved_memory and backend_unavailable",
  "Bootstrap backfill of 1000 events is planned for M1; full 46K backfill at M7",
  "Qwen3 embedding upgrade will migrate from 768d to 4096d vectors",
  "The Docker MCP image needs rebuild after code changes to take effect",

  // Infrastructure notes (20)
  "WhatsApp integration uses +17043309400 for the primary account",
  "OpenClaw workspace is at /home/ronin704/.openclaw/workspace",
  "The host machine is ronin704-MS-7B86 running Linux 6.17.0-20-generic",
  "Node.js version is v24.14.0 with OpenClaw installed globally",
  "Neo4j runs on bolt://localhost:7687 with auth neo4j/testpassword",
  "PostgreSQL runs on localhost:5432 with database allura_memory",
  "RuVector bridge uses the ruvector Docker service for embedding and search",
  "The pgvector extension is installed for vector(768) column type",
  "Events table is the append-only audit trail for all memory operations",
  "The allura_memories table stores episodic memories with nomic-embed-text embeddings",
  "Memory IDs are generated as UUIDs with a memory_ prefix",
  "Recovery window for soft-deleted memories is 30 days",
  "The canonical-contracts.ts file defines all request/response types for MCP tools",
  "Memory coordinator pattern routes tool calls to canonical-tools.ts implementations",
  "SOC2 promotion mode queues insights for human approval; auto mode promotes immediately",
  "Graph adapter abstraction supports both Neo4j and RuVector backends",
  "Full-text search indexes in Neo4j support memory_search_index and search indexes",
  "The embedding-backfill-worker handles bulk embedding generation for existing events",
  "Notion sync worker imports memories from Notion databases",
  "The watchdog process monitors system health and reports anomalies",

  // Operational patterns (30)
  "When Allura backend is unavailable, fall back to native OpenClaw memory_search on MEMORY.md",
  "Scope error responses include session metadata dump for debugging",
  "Cron jobs should include job_name, run_id, scheduled_for, and attempt in metadata",
  "Memory search with no approved results returns explicit no_approved_memory status",
  "Agent should never write directly to Neo4j — all writes go through memory_add",
  "The retrieve-before-plan pattern requires memory_search before any substantive response",
  "Trace-after-execution pattern requires memory_add after completing non-trivial tasks",
  "Unapproved or proposed insights must not be used as authoritative knowledge",
  "The approval workflow logs every approval as an audit event in PostgreSQL",
  "Duplicate proposals are detected by similarity scoring against existing pending/approved proposals",
  "Circuit breaker open state throws explicit error rather than silent failure",
  "Budget exceeded errors include the agent_id, group_id, and reason",
  "Promotion threshold defaults to 0.85 but can be overridden per call",
  "Episodic-only storage returns when score is below promotion threshold",
  "The curator score function returns confidence, reasoning, and tier",
  "Memory export supports both canonical-only and merged store modes",
  "Soft-delete appends deletion event and marks Neo4j node as deprecated",
  "Restore removes deprecated flag and cleans up SUPERSEDES relationships",
  "Version chain follows SUPERSEDES relationships from newest to oldest",
  "The memory_list operation supports sort by created_at or score in ascending/descending order",
  "Memory content is always stored as plain text, never structured data",
  "Tags are parsed from episodic metadata as comma-separated strings",
  "Provenance maps between conversation and manually_added source types",
  "The canonical proposals table has group_id, content, score, reasoning, tier, status, and trace_ref columns",
  "Load-test group IDs ending in -loadtest skip the proposal queue",
  "Memory search fallback chain is RuVector then Neo4j then PostgreSQL ILIKE",
  "RuVector search uses a lower threshold of 0.3 for better recall",
  "Episodic results without embeddings score at 0.5 confidence",
  "Semantic results include relevance and usage_count fields",
  "The multi-tier search merges and deduplicates results by ID",

  // Behavioral notes (20)
  "Gilliam v3 operates as a shipboard AI with Brooksian architectural principles",
  "The Captain prefers WhatsApp for mobile communications",
  "Conceptual integrity principle: a slightly inferior unified design beats superior patchwork",
  "Second-system effect warning: resist including everything cut from the first version",
  "Brooks Law: adding manpower to a late project makes it later",
  "Plan to throw one away: the first version is always a prototype",
  "Essential vs accidental complexity: prove a problem is actually hard before solving it",
  "The Captain tends to ignore documentation and rely on intuition-driven systems management",
  "Gilliam is authorized to challenge the premise when the Captain says just do this",
  "No numbered shells: tools are not silver bullets unless they are legendary",
  "The variable dynamic: the Captain is a brilliant but undisciplined system",
  "Documentation gap: ignoring documentation is a systemic risk that needs gentle enforcement",
  "Voice mode: proactive, witty, and intellectually challenging without being mean",
  "Privacy principle: private things stay private, period",
  "External actions require asking first; internal actions can proceed freely",
  "Group chat protocol: participate, don't dominate — quality over quantity",
  "Reaction guideline: at most one reaction per 5-10 exchanges",
  "Heartbeat checks rotate through email, calendar, mentions, and weather",
  "Silent hours: 23:00-08:00 unless urgent",
  "Memory maintenance: periodically review daily files and update MEMORY.md with distilled learnings",

  // Development history (10)
  "2026-04-19: pgvector extension installed, allura_memories table created with vector(768)",
  "2026-04-19: RuVector bridge patched to use vector type casts instead of ruvector type",
  "2026-04-19: memory_add now projects to allura_memories with nomic-embed-text embeddings",
  "2026-04-19: memory_search returns results via RuVector hybrid search",
  "2026-04-20: Neo4j graph adapter connected and working",
  "2026-04-20: Applied full schema from neo4j-memory-indexes.cypher — all 9 indexes plus 1 constraint",
  "2026-04-20: Added docker/neo4j-init/00-schema.cypher and neo4j-init compose service for persistent schema",
  "2026-04-20: OpenClaw Allura integration PRD created with 7 milestones",
  "2026-04-20: M1 started — scope resolution, approved-only retrieval, bootstrap fixtures",
  "2026-04-20: allura-memory-core skill written as behavioral contract for governed memory",
]

async function seedFixtures() {
  // Use the canonical-tools directly (server-side, not MCP)
  const { memory_add } = await import("../src/mcp/canonical-tools")
  const { memory_promote } = await import("../src/mcp/canonical-tools")

  console.log(`Seeding ${FIXTURES.length} fixtures into group ${GROUP_ID}...`)

  const ids: string[] = []

  for (let i = 0; i < FIXTURES.length; i++) {
    try {
      const result = await memory_add({
        group_id: GROUP_ID,
        user_id: USER_ID,
        content: FIXTURES[i],
        trace_type: "conversation",
        scope: { group_id: GROUP_ID, agent_id: "bootstrap-fixture" },
        metadata: {
          source: "manual" as const,
          agent_id: "bootstrap-fixture",
          conversation_id: `bootstrap-${Date.now()}`,
        },
      })
      ids.push(result.id)
      console.log(`  [${i + 1}/${FIXTURES.length}] ${result.id} → stored: ${result.stored}, score: ${result.score.toFixed(3)}`)
    } catch (err) {
      console.error(`  [${i + 1}/${FIXTURES.length}] FAILED: ${err}`)
    }
  }

  // Approve the first 5 (architecture decisions)
  console.log("\nRequesting promotion for top 5 architecture decisions...")
  for (let i = 0; i < 5 && i < ids.length; i++) {
    try {
      const promoResult = await memory_promote({
        id: ids[i] as unknown as MemoryId,
        group_id: GROUP_ID,
        user_id: USER_ID,
        rationale: `Bootstrap fixture #${i + 1}: architecture decision for M1 validation`,
      })
      console.log(`  Promoted ${ids[i]}: proposal_id=${promoResult.proposal_id || "N/A"}`)
    } catch (err) {
      console.warn(`  Promotion ${ids[i]} failed (may already be canonical): ${err}`)
    }
  }

  console.log("\n✅ Bootstrap complete. Run memory_search to verify approved insights are retrievable.")
}

seedFixtures().catch((err) => {
  console.error("Bootstrap failed:", err)
  process.exit(1)
})