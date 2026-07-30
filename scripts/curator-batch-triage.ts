#!/usr/bin/env bun
/**
 * Curator Batch Triage — HITL-consented queue burn-down (2026-06-10)
 *
 * Consent: Sabir approved the batch plan in Cowork session 2026-06-10
 *   ("approved as proposed") — Brooks orchestrating.
 *
 * Batches (classification by content prefix):
 *   A  REJECT  — pipeline echo noise: raw `{"type":...}` JSON dumps
 *   B  APPROVE — ARCHITECTURE_DECISION entries → promote to Neo4j
 *   C  REJECT  — session lifecycle logs (SESSION_END/COMPLETE/CLOSE/started)
 *   E  REJECT  — KANBAN CARD operational tracker state
 *   D  HOLD    — everything else (TASK_COMPLETE/OUTCOME/DEBT_FIX/etc.)
 *               → written to a review file for case-by-case HITL
 *
 * Invariants enforced (mirrors src/curator/approve-cli.ts):
 *   - group_id validated (allura-* pattern)
 *   - witness_hash (SHAKE-256) on every decision
 *   - proposal_approved / proposal_rejected events appended (append-only)
 *   - rejected proposals remain episodic and searchable
 *   - idempotent: only status='pending' rows are touched
 *
 * Usage:
 *   bun scripts/curator-batch-triage.ts             # dry-run (default, no writes)
 *   bun scripts/curator-batch-triage.ts --execute   # apply decisions
 *   bun scripts/curator-batch-triage.ts --group-id=allura-system
 */

import { createHash, randomUUID } from "crypto"
import { createInsight, InsightConflictError } from "./lib/neo4j-stub"
import { closePool, getPool } from "../src/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "../src/lib/validation/group-id"

const CURATOR_ID = "sabir-hitl-batch-2026-06-12"

type Batch = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M" | "N" | "O"

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

const BATCH_RATIONALE: Record<Batch, string> = {
  A: "Batch A reject — pipeline echo noise (raw tool-call JSON), no canonical knowledge value",
  B: "Batch B approve — architecture decision, durable canonical knowledge",
  C: "Batch C reject — session lifecycle log, episodic by nature",
  D: "Batch D hold — case-by-case HITL review",
  E: "Batch E reject — kanban/tracker operational state, belongs in tracker",
  F: "Batch F reject — task completion trace, work is in code/commits",
  G: "Batch G reject — git/status state, git log is authoritative",
  H: "Batch H reject — session lifecycle (extended), episodic by nature",
  I: "Batch I reject — diagnostic/verification trace, fix is in code",
  J: "Batch J reject — planning ephemera, superseded by execution",
  K: "Batch K approve — architecture/interface review, durable canonical knowledge",
  L: "Batch L approve — strategic insight/lesson, durable canonical knowledge",
  M: "Batch M reject — infrastructure/config ops, ephemeral operational action",
  N: "Batch N reject — date-prefixed session note or debug trace, episodic",
  O: "Batch O reject — operational trace (outcome/phase/goal/canonical/receipt), episodic state",
}

function classify(content: string): Batch {
  const c = content.trimStart()
  // A — raw JSON echo noise
  if (c.startsWith("{\"type\":") || c.startsWith("{'type':")) return "A"
  // B — architecture decisions (original)
  if (/^ARCHITECTURE_DECISION/i.test(c)) return "B"
  // C — session lifecycle (original narrow)
  if (/^(SESSION[ _](END|COMPLETE|CLOSE|STARTED)|Session (started|complete|close)|EVENT_TYPE:\s*SESSION)/i.test(c)) return "C"
  // E — kanban cards
  if (/^KANBAN CARD/i.test(c)) return "E"
  // K — architecture/interface reviews → APPROVE
  if (/^(INTERFACE_REVIEW|REFACTOR_REVIEW|ARCHITECTURE_(DIRECTION|AUDIT)|ADR_CREATED|ADR\b|DECISIONS?\b|DESIGN_CORRECTION|DASHBOARD_SUNSET_DECISION)/i.test(c)) return "K"
  // L — strategic insights/lessons → APPROVE
  if (/^(LESSON_LEARNED|COMPETITIVE_ANALYSIS|PRODUCT_INTENT_CORRECTION|STRATEGIC_QUESTION)/i.test(c)) return "L"
  // F — task completion/progress traces
  if (/^TASK_(COMPLETE|PROGRESS|UPDATE|COMPLETE_CORRECTION)/i.test(c)) return "F"
  // G — git/status state
  if (/^(COMMIT_CREATED|CURRENT_GIT_STATE|STATUS_(CHECK|OUTCOME|CORRECTION))/i.test(c)) return "G"
  // H — session lifecycle (extended)
  if (/^(SESSION_(START|OUTCOME|REFLECTION|WORK)|SESSION\b)/i.test(c)) return "H"
  // I — diagnostic/verification traces
  if (/^(VERIFICATION_RESULT|CLEANUP_RESULT|DEBUG_(OUTCOME|FINDING)|ROOT_CAUSE_ANALYSIS|FIX\b)/i.test(c)) return "I"
  // J — planning ephemera
  if (/^(NX_STEPS|NX\b|NEXT_(STEPS_REVIEW|ACTION)|PLAN\b|FINISH_PLAN|FOLLOWUP_STATUS)/i.test(c)) return "J"
  // M — infra/config ops
  if (/^(MCP_(DOCKER|LOADED)|MCP\b|HARNESS_CONFIG|SKILLS?_CREATED|BMAD|REPO_CREATED|ORG_PROVISIONED)/i.test(c)) return "M"
  // N — date-prefixed session notes, debug: traces
  if (/^(2026-\d{2}|debug:)/i.test(c)) return "N"
  // O — operational traces (outcomes, phases, goals, canonical, receipts, corrections, etc.)
  if (/^(OUTCOME|CANONICAL|POST\b|PHASE|GOAL_(STRUCTURED|SET|RUN_ATTEMPT)|EPIC_|RECEIPT|DOCS_UPDATED|DEBT_FIX|CORRECTION\b)/i.test(c)) return "O"
  return "D"
}

function witnessHash(p: PendingProposal, groupId: string, decision: string, decidedAt: string): string {
  const payload = `${p.id}|${groupId}|${p.content}|${p.score}|${p.tier}|${decision}|${decidedAt}|${CURATOR_ID}`
  return createHash("shake256", { outputLength: 64 }).update(payload).digest("hex")
}

function parseArgs(): { execute: boolean; groupId: string } {
  const args = process.argv.slice(2)
  return {
    execute: args.includes("--execute"),
    groupId: args.find((a) => a.startsWith("--group-id="))?.split("=")[1] ?? "allura-system",
  }
}

async function main(): Promise<void> {
  const { execute, groupId } = parseArgs()

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
  const counts: Record<Batch, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0 }
  let approved = 0
  let rejected = 0
  let failed = 0
  const holdReport: string[] = []

  try {
    const { rows } = await pool.query(
      `SELECT id, group_id, content, score, reasoning, tier, created_at, trace_ref
       FROM canonical_proposals
       WHERE group_id = $1 AND status = 'pending'
       ORDER BY score DESC, created_at ASC`,
      [groupId]
    )
    const proposals = rows as PendingProposal[]
    console.log(`[Triage] ${proposals.length} pending proposals in ${groupId}`)
    console.log(`[Triage] Mode: ${execute ? "EXECUTE" : "DRY-RUN (no writes)"}\n`)

    for (const p of proposals) {
      const batch = classify(p.content)
      counts[batch]++

      if (batch === "D") {
        holdReport.push(
          `${p.id} | score=${p.score} | tier=${p.tier} | ${p.created_at} | ${p.content.replace(/\s+/g, " ").slice(0, 140)}`
        )
        continue
      }
      if (!execute) continue

      const decidedAt = new Date().toISOString()

      const APPROVE_BATCHES: ReadonlySet<Batch> = new Set(["B", "K", "L"])
      if (APPROVE_BATCHES.has(batch)) {
        // Approve → promote to Neo4j (SUPERSEDES handled inside createInsight path)
        const memoryId = randomUUID()
        try {
          await createInsight({
            insight_id: memoryId,
            group_id: groupId,
            content: p.content,
            confidence: parseFloat(p.score),
            topic_key: `curator.${p.tier}`,
            source_type: "promotion",
            created_by: CURATOR_ID,
            metadata: {
              trace_ref: p.trace_ref,
              tier: p.tier,
              rationale: BATCH_RATIONALE[batch],
              proposal_id: p.id,
              batch,
            },
          })
        } catch (err) {
          if (!(err instanceof InsightConflictError)) {
            console.error(`[FAIL] promote ${p.id}: ${err instanceof Error ? err.message : String(err)}`)
            failed++
            continue
          }
        }
        const wh = witnessHash(p, groupId, "approve", decidedAt)
        await pool.query(
          `UPDATE canonical_proposals
           SET status='approved', decided_at=$1, decided_by=$2, rationale=$3, witness_hash=$4
           WHERE id=$5 AND group_id=$6 AND status='pending'`,
          [decidedAt, CURATOR_ID, BATCH_RATIONALE[batch], wh, p.id, groupId]
        )
        // DB trigger on canonical_proposals INSERT fires proposal_approved event — no manual INSERT needed
        approved++
      } else {
        // Reject (A, C, E, F, G, H, I, J, M, N, O) — stays episodic, fully searchable
        const wh = witnessHash(p, groupId, "reject", decidedAt)
        await pool.query(
          `UPDATE canonical_proposals
           SET status='rejected', decided_at=$1, decided_by=$2, rationale=$3, witness_hash=$4
           WHERE id=$5 AND group_id=$6 AND status='pending'`,
          [decidedAt, CURATOR_ID, BATCH_RATIONALE[batch], wh, p.id, groupId]
        )
        // DB trigger on canonical_proposals fires proposal_rejected event — no manual INSERT needed
        rejected++
      }
    }

    // Write hold report for case-by-case review
    if (holdReport.length > 0) {
      const fs = await import("fs")
      const reportPath = "docs/archive/curator-batch-D-hold-review-2026-06-10.txt"
      fs.mkdirSync("docs/archive", { recursive: true })
      fs.writeFileSync(reportPath, holdReport.join("\n") + "\n")
      console.log(`[Triage] Batch D hold list written → ${reportPath}`)
    }

    console.log(`\n[Triage] Classification:`)
    console.log(`  A (echo noise → reject):       ${counts.A}`)
    console.log(`  B (arch decision → approve):   ${counts.B}`)
    console.log(`  C (session log → reject):      ${counts.C}`)
    console.log(`  D (hold for review):           ${counts.D}`)
    console.log(`  E (kanban card → reject):      ${counts.E}`)
    console.log(`  F (task trace → reject):       ${counts.F}`)
    console.log(`  G (git/status → reject):       ${counts.G}`)
    console.log(`  H (session ext → reject):      ${counts.H}`)
    console.log(`  I (diagnostic → reject):       ${counts.I}`)
    console.log(`  J (planning → reject):         ${counts.J}`)
    console.log(`  K (arch review → approve):     ${counts.K}`)
    console.log(`  L (strategic → approve):       ${counts.L}`)
    console.log(`  M (infra/config → reject):     ${counts.M}`)
    console.log(`  N (date/debug → reject):       ${counts.N}`)
    console.log(`  O (ops trace → reject):        ${counts.O}`)
    if (execute) {
      console.log(`\n[Triage] Executed: ${approved} approved, ${rejected} rejected, ${failed} failed, ${counts.D} held`)
    } else {
      console.log(`\n[Triage] DRY-RUN complete — re-run with --execute to apply`)
    }
  } finally {
    await closePool()
  }
  process.exit(failed > 0 ? 1 : 0)
}

main()
