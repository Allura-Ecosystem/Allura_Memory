#!/usr/bin/env bun
/**
 * Curator Per-ID Rejection — HITL-consented explicit reject
 *
 * Rejects an explicit, human-consented list of pending canonical_proposals
 * (matched by ID prefix), writes SHAKE-256 witness hashes, and marks rows
 * status='rejected'. The DB trigger on canonical_proposals UPDATE fires
 * proposal_rejected events (append-only) — no manual INSERT needed.
 *
 * Episodic rows remain in PostgreSQL, fully searchable. Rejection only
 * prevents promotion to Neo4j semantic layer.
 *
 * Invariants enforced:
 *   - group_id validated (allura-* pattern)
 *   - witness_hash (SHAKE-256) on every decision
 *   - proposal_rejected events fired by DB trigger (append-only)
 *   - idempotent: only status='pending' rows are touched
 *   - REQUIRES --decided-by naming the human approver (HITL provenance)
 *
 * Usage:
 *   bun scripts/reject-proposals-by-id.ts --decided-by=sabir-hitl-2026-07-12 <id-prefix...>           # dry-run
 *   bun scripts/reject-proposals-by-id.ts --decided-by=sabir-hitl-2026-07-12 --execute <id-prefix...> # apply
 */

import { createHash } from "crypto"
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
  rationale: string | null
  idPrefixes: string[]
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2)
  return {
    execute: args.includes("--execute"),
    groupId: args.find((a) => a.startsWith("--group-id="))?.split("=")[1] ?? "allura-system",
    decidedBy: args.find((a) => a.startsWith("--decided-by="))?.split("=")[1] ?? null,
    rationale: args.find((a) => a.startsWith("--rationale="))?.split("=").slice(1).join("=") ?? null,
    idPrefixes: args.filter((a) => !a.startsWith("--")),
  }
}

function witnessHash(p: PendingProposal, groupId: string, decision: string, decidedAt: string, curatorId: string): string {
  const payload = `${p.id}|${groupId}|${p.content}|${p.score}|${p.tier}|${decision}|${decidedAt}|${curatorId}`
  return createHash("shake256", { outputLength: 64 }).update(payload).digest("hex")
}

async function main(): Promise<void> {
  const { execute, groupId, decidedBy, rationale, idPrefixes } = parseArgs()

  if (!decidedBy) {
    console.error("[ERROR] --decided-by=<human-approver> is required (HITL provenance). Refusing to run.")
    process.exit(1)
  }
  if (idPrefixes.length === 0) {
    console.error("[ERROR] No proposal ID prefixes supplied. Nothing to reject.")
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
  let rejected = 0
  let failed = 0
  let notFound = 0
  const DEFAULT_RATIONALE = `Ephemeral operational trace — not canonical knowledge. Episodic row preserved. HITL batch 2026-07-12 — owner-approved triage (Sabir via Bahari)`

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
      const rejectRationale = rationale ?? DEFAULT_RATIONALE
      const wh = witnessHash(p, groupId, "reject", decidedAt, decidedBy)

      await pool.query(
        `UPDATE canonical_proposals
         SET status='rejected', decided_at=$1, decided_by=$2, rationale=$3, witness_hash=$4
         WHERE id=$5 AND group_id=$6 AND status='pending'`,
        [decidedAt, decidedBy, rejectRationale, wh, p.id, groupId]
      )
      // DB trigger on canonical_proposals fires proposal_rejected event — no manual INSERT needed
      rejected++
      console.log(`[OK] rejected ${p.id} (episodic row preserved)`)
    }

    console.log(`\n[Per-ID-Reject] ${execute ? "Executed" : "DRY-RUN"}: ${rejected} rejected, ${failed} failed, ${notFound} not found`)
    if (!execute) console.log("[Per-ID-Reject] Re-run with --execute to apply")
  } finally {
    await closePool()
  }
  process.exit(failed > 0 ? 1 : 0)
}

main()