#!/usr/bin/env bun
/**
 * auto-curate-pending.ts — Governed Auto-Promotion Batch Runner
 *
 * Restores Sabir's promotion rule (2026-09-29): pending proposals scoring
 * >= threshold are promoted by the auto-curator service principal through the
 * atomic governed approval transaction (approve-proposal.ts). Every promotion
 * gets a governance_receipts row, witness hash, outbox entry, and idempotency
 * key. Agents still never self-promote: the engine is a distinct principal and
 * segregation of duties is enforced in-transaction.
 *
 * Held for HITL regardless of score: COMPLIANCE_CLAIM, SESSION_LOG, and
 * governance-policy content. Test tenants are skipped.
 *
 * Usage: bun src/scripts/auto-curate-pending.ts [--dry-run] [--limit N] [--group allura-faithmeats] [--threshold 0.75]
 */

import { config } from "dotenv"

config()

import { getPool } from "@/lib/postgres/connection"
import { createPrincipalContext } from "@/lib/auth/principal-context"
import { approveProposal } from "@/lib/memory/approve-proposal"
import {
  AUTO_CURATOR_PRINCIPAL_ID,
  getEffectiveThreshold,
  requiresHITL,
} from "@/lib/curator/auto-promote"
import { validateGroupId } from "@/lib/validation/group-id"

const isDryRun = process.argv.includes("--dry-run")
const limitArg = process.argv.indexOf("--limit")
const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1] ?? "200") : 200
const groupArg = process.argv.indexOf("--group")
const thresholdArg = process.argv.indexOf("--threshold")

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const SKIP_GROUP_PATTERNS = [
  /-loadtest$/,
  /^allura-test-/,
  /^allura-promote-test-/,
  /-e2e$/,
  /^allura-atomic-promotion-/,
  /^allura-eval-/,
]

async function run() {
  const threshold = getEffectiveThreshold(
    thresholdArg >= 0 ? parseFloat(process.argv[thresholdArg + 1] ?? "") : undefined
  )
  const mode = process.env.PROMOTION_MODE ?? "soc2"
  console.log(
    `[auto-curate] mode=${mode} threshold=${threshold} limit=${limit} dry-run=${isDryRun}`
  )

  const pg = getPool()

  if (mode !== "auto" && !isDryRun && !process.argv.includes("--force")) {
    console.log(
      "[auto-curate] PROMOTION_MODE != auto — listing only. Set PROMOTION_MODE=auto (or --force) to promote."
    )
    const { rows: pending } = await pg.query(
      `SELECT id, group_id, score FROM canonical_proposals WHERE status='pending' LIMIT $1`,
      [limit]
    )
    for (const p of pending) console.log(`  pending id=${p.id} group=${p.group_id} score=${p.score}`)
    await pg.end()
    return
  }

  // ── Backfill legacy NULL workspace_id on pending proposals from their trace events ──
  const backfill = await pg.query(
    `UPDATE canonical_proposals p
     SET workspace_id = e.workspace_id
     FROM events e
     WHERE e.id = p.trace_ref
       AND p.status = 'pending'
       AND p.workspace_id IS NULL
       AND e.workspace_id IS NOT NULL
     RETURNING p.id`
  )
  if (backfill.rows.length > 0) {
    console.log(`[auto-curate] Backfilled workspace_id on ${backfill.rows.length} legacy proposals`)
  }

  const groupFilter = groupArg >= 0 ? validateGroupId(process.argv[groupArg + 1] ?? "") : null

  const { rows: proposals } = await pg.query(
    `SELECT p.id, p.group_id, p.workspace_id, p.content, p.score, p.tier
     FROM canonical_proposals p
     WHERE p.status = 'pending'
       AND ($1::text IS NULL OR p.group_id = $1)
     ORDER BY p.group_id, p.created_at ASC
     LIMIT $2`,
    [groupFilter, limit]
  )

  if (proposals.length === 0) {
    console.log("[auto-curate] No pending proposals.")
    await pg.end()
    return
  }

  const principal = createPrincipalContext({
    principalId: AUTO_CURATOR_PRINCIPAL_ID,
    sessionId: `auto-curate-${Date.now()}`,
    authMethod: "service_identity",
    tenantIds: ["*"],
    roles: ["curator"],
    scopes: ["review:approve", "memory:read", "memory:write"],
  })

  const stats = { promoted: 0, held_hitl: 0, held_below: 0, skipped_group: 0, failed: 0, errors: [] as any[] }

  for (const p of proposals) {
    const score = Number(p.score)
    const content = String(p.content ?? "")

    if (SKIP_GROUP_PATTERNS.some((re) => re.test(p.group_id))) {
      stats.skipped_group++
      continue
    }

    const holdReason = requiresHITL(content)
    if (holdReason) {
      stats.held_hitl++
      if (isDryRun) console.log(`[DRY-RUN] HOLD  ${p.id} score=${score} — ${holdReason}`)
      continue
    }

    if (score < threshold) {
      stats.held_below++
      continue
    }

    if (!p.workspace_id) {
      stats.held_hitl++
      if (isDryRun) console.log(`[DRY-RUN] HOLD  ${p.id} — no workspace_id (cannot govern-approve)`)
      continue
    }

    if (isDryRun) {
      console.log(`[DRY-RUN] WOULD PROMOTE ${p.id} group=${p.group_id} score=${score} tier=${p.tier}`)
      stats.promoted++
      continue
    }

    try {
      const receipt = await approveProposal({
        principal,
        workspaceId: p.workspace_id,
        groupId: p.group_id,
        proposalId: p.id,
        rationale: `Auto-promotion: score ${score} >= threshold ${threshold} (governed engine, PROMOTION_MODE=auto)`,
        idempotencyKey: `auto-curate:${p.id}`,
        pool: pg,
      })
      stats.promoted++
      console.log(
        `[auto-curate] PROMOTED ${p.id} group=${p.group_id} score=${score} memory_id=${receipt.memory_id}`
      )
    } catch (err: any) {
      // Already-decided rows are fine (idempotent re-runs)
      if (err?.code === "ALREADY_DECIDED" || err?.code === "IDEMPOTENCY_CONFLICT") {
        stats.skipped_group++
        continue
      }
      stats.failed++
      stats.errors.push({ proposal_id: p.id, reason: err?.message ?? String(err) })
      console.error(`[auto-curate] FAILED ${p.id}: ${err?.message ?? err}`)
    }
  }

  console.log(
    `[auto-curate] Done. promoted=${stats.promoted} held_hitl=${stats.held_hitl} ` +
      `held_below_threshold=${stats.held_below} skipped=${stats.skipped_group} failed=${stats.failed}`
  )
  await pg.end()
}

run().catch((err) => {
  console.error("[auto-curate] Fatal:", err)
  process.exit(1)
})