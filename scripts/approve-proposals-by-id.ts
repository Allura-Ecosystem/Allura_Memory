#!/usr/bin/env bun
/**
 * Curator Per-ID Approval — HITL-consented explicit promotion
 *
 * Approves an explicit, human-consented list of pending canonical_proposals
 * (matched by ID prefix), writes SHAKE-256 witness hashes, appends
 * proposal_approved events (append-only), and promotes content to Neo4j via
 * createInsight (SUPERSEDES handled inside). Mirrors the consented approve
 * path in scripts/curator-batch-triage.ts / src/curator/approve-cli.ts.
 *
 * Invariants enforced:
 *   - group_id validated (allura-* pattern)
 *   - witness_hash (SHAKE-256) on every decision
 *   - proposal_approved events appended (append-only)
 *   - idempotent: only status='pending' rows are touched
 *   - REQUIRES --decided-by naming the human approver (HITL provenance)
 *
 * Usage:
 *   bun scripts/approve-proposals-by-id.ts --decided-by=sabir-hitl-2026-06-12 <id-prefix...>           # dry-run
 *   bun scripts/approve-proposals-by-id.ts --decided-by=sabir-hitl-2026-06-12 --execute <id-prefix...> # apply
 *
 * AI-assisted (Brooks orchestration, 2026-06-12). Pattern source reviewed:
 * scripts/curator-batch-triage.ts.
 */

import { createHash, randomUUID } from "crypto"
import { createInsight, InsightConflictError } from "./lib/neo4j-stub"
import { closePool, getPool } from "../src/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "../src/lib/validation/group-id"

interface PendingProposal {
  id: string
  group_id: string
  content: string
  score: string
  reasoning: string | null
  tier: string
  created_at: string
  trace_ref: number | null
}

interface CLIArgs {
  execute: boolean
  groupId: string
  decidedBy: string | null
  idPrefixes: string[]
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  return {
    execute: args.includes("--execute"),
    groupId: args.find((a) => a.startsWith("--group-id="))?.split("=")[1] ?? "allura-system",
    decidedBy: args.find((a) => a.startsWith("--decided-by="))?.split("=")[1] ?? null,
    idPrefixes: args.filter((a) => !a.startsWith("--")),
  }
}

function witnessHash(p: PendingProposal, groupId: string, decision: string, decidedAt: string, curatorId: string): string {
  const payload = `${p.id}|${groupId}|${p.content}|${p.score}|${p.tier}|${decision}|${decidedAt}|${curatorId}`
  return createHash("shake256", { outputLength: 64 }).update(payload).digest("hex")
}

async function main(): Promise<void> {
  const { execute, groupId, decidedBy, idPrefixes } = parseArgs()

  if (!decidedBy) {
    console.error("[ERROR] --decided-by=<human-approver> is required (HITL provenance). Refusing to run.")
    process.exit(1)
  }
  if (idPrefixes.length === 0) {
    console.error("[ERROR] No proposal ID prefixes supplied. Nothing to approve.")
    process.exit(1)
  }

  try {
    validateGroupId(groupId)
  } catch (err) {
    if (err instanceof GroupIdValidationError) {
      console.error(`[ERROR] Invalid group_id: ${err.message}`)
      process.exit(1)
    }
    throw err
  }

  const pool = getPool()
  let approved = 0
  let failed = 0
  let notFound = 0

  try {
    for (const prefix of idPrefixes) {
      const { rows } = await pool.query(
        `SELECT id, group_id, content, score, reasoning, tier, created_at, trace_ref
         FROM canonical_proposals
         WHERE group_id = $1 AND status = 'pending' AND id::text LIKE $2
         ORDER BY created_at ASC`,
        [groupId, `${prefix}%`]
      )
      const matches = rows as PendingProposal[]

      if (matches.length === 0) {
        console.warn(`[WARN] No pending proposal matches prefix '${prefix}' (already decided, or wrong ID)`)
        notFound++
        continue
      }
      if (matches.length > 1) {
        console.error(`[ERROR] Prefix '${prefix}' is ambiguous (${matches.length} matches) — skipping. Use a longer prefix.`)
        failed++
        continue
      }

      const p = matches[0]
      console.log(`[Match] ${p.id} | score=${p.score} | tier=${p.tier} | ${p.content.replace(/\s+/g, " ").slice(0, 100)}`)

      if (!execute) continue

      const decidedAt = new Date().toISOString()
      const rationale = `Per-ID HITL approval by ${decidedBy} — explicit consent in Cowork session`
      const memoryId = randomUUID()

      try {
        await createInsight({
          insight_id: memoryId,
          group_id: groupId,
          content: p.content,
          confidence: parseFloat(p.score),
          topic_key: `curator.${p.tier}`,
          source_type: "promotion",
          created_by: decidedBy,
          metadata: {
            trace_ref: p.trace_ref,
            tier: p.tier,
            rationale,
            proposal_id: p.id,
            batch: "per-id",
          },
        })
      } catch (err) {
        if (!(err instanceof InsightConflictError)) {
          console.error(`[FAIL] promote ${p.id}: ${err instanceof Error ? err.message : String(err)}`)
          failed++
          continue
        }
      }

      const wh = witnessHash(p, groupId, "approve", decidedAt, decidedBy)
      await pool.query(
        `UPDATE canonical_proposals
         SET status='approved', decided_at=$1, decided_by=$2, rationale=$3, witness_hash=$4
         WHERE id=$5 AND group_id=$6 AND status='pending'`,
        [decidedAt, decidedBy, rationale, wh, p.id, groupId]
      )
      await pool.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          groupId,
          "proposal_approved",
          decidedBy,
          "completed",
          JSON.stringify({ proposal_id: p.id, memory_id: memoryId, score: p.score, tier: p.tier, batch: "per-id", rationale }),
          decidedAt,
        ]
      )
      approved++
      console.log(`[OK] approved + promoted ${p.id} → insight ${memoryId}`)
    }

    console.log(`\n[Per-ID] ${execute ? "Executed" : "DRY-RUN"}: ${approved} approved, ${failed} failed, ${notFound} not found`)
    if (!execute) console.log("[Per-ID] Re-run with --execute to apply")
  } finally {
    await closePool()
  }
  process.exit(failed > 0 ? 1 : 0)
}

main()
