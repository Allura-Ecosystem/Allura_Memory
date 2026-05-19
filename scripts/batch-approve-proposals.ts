#!/usr/bin/env bun
/**
 * Batch Approve Pending Proposals
 *
 * One-shot script to approve all pending canonical_proposals.
 * Equivalent to calling POST /api/curator/approve for each proposal.
 *
 * Usage: bun scripts/batch-approve-proposals.ts [--dry-run] [--limit N]
 */

import { Pool } from "pg";
import { createHash, randomUUID } from "crypto";
import { Neo4jConnectionError, Neo4jPromotionError } from "@/lib/errors/neo4j-errors";
import { logApprovalEvent } from "@/lib/memory/approval-audit";
import { createInsight } from "@/lib/neo4j/queries/insert-insight";

const isDryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1] ?? "999") : 999;

const CURATOR_ID = "batch-approve-script";
const RATIONALE = "Phase 6 backlog clearance — E2E pipeline validation";

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "memory",
  user: process.env.POSTGRES_USER || "ronin4life",
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  console.log(`[batch-approve] mode=${isDryRun ? "DRY-RUN" : "LIVE"} limit=${limit}`);

  const { rows: proposals } = await pool.query(
    `SELECT id, group_id, content, score, reasoning, tier, trace_ref
     FROM canonical_proposals
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  console.log(`[batch-approve] Found ${proposals.length} pending proposals`);

  let approved = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of proposals) {
    if (isDryRun) {
      console.log(`[DRY-RUN] Would approve proposal ${p.id} score=${p.score} tier=${p.tier}`);
      approved++;
      continue;
    }

    const decidedAt = new Date().toISOString();
    const memoryId = randomUUID();
    const witnessPayload = `${p.id}|${p.group_id}|${p.content}|${p.score}|${p.tier}|approve|${decidedAt}|${CURATOR_ID}`;
    const witness_hash = createHash("sha256").update(witnessPayload).digest("hex");

    await logApprovalEvent(
      {
        proposal_id: p.id,
        group_id: p.group_id,
        memory_id: memoryId,
        curator_id: CURATOR_ID,
        decision: "approved",
        rationale: RATIONALE,
        score: parseFloat(p.score),
        tier: p.tier,
        approved_at: decidedAt,
      },
      pool
    );

    try {
      await createInsight({
        insight_id: memoryId,
        group_id: p.group_id,
        content: p.content,
        confidence: parseFloat(p.score),
        topic_key: `curator.${p.tier}`,
        source_type: "promotion",
        created_by: CURATOR_ID,
        metadata: {
          trace_ref: p.trace_ref,
          tier: p.tier,
          rationale: RATIONALE,
          proposal_id: p.id,
        },
      });
    } catch (err) {
      if (err instanceof Neo4jConnectionError || err instanceof Neo4jPromotionError) {
        console.error(`[batch-approve] Neo4j unavailable for proposal ${p.id} — skipping`);
        skipped++;
        continue;
      }
      console.error(`[batch-approve] Unexpected error for proposal ${p.id}:`, err);
      failed++;
      continue;
    }

    await pool.query(
      `UPDATE canonical_proposals
       SET status = 'approved',
           decided_at = $1,
           decided_by = $2,
           rationale = $3,
           witness_hash = $4
       WHERE id = $5`,
      [decidedAt, CURATOR_ID, RATIONALE, witness_hash, p.id]
    );

    await pool.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, 'proposal_approved', $2, 'completed', $3, $4)`,
      [
        p.group_id,
        CURATOR_ID,
        JSON.stringify({ proposal_id: p.id, memory_id: memoryId, score: p.score, tier: p.tier, rationale: RATIONALE }),
        decidedAt,
      ]
    );

    console.log(`[batch-approve] ✓ approved proposal ${p.id} → insight ${memoryId} (${p.tier} ${parseFloat(p.score).toFixed(2)})`);
    approved++;
  }

  await pool.end();

  console.log(`\n[batch-approve] Done: approved=${approved} skipped=${skipped} failed=${failed}`);
  if (skipped > 0) console.log(`[batch-approve] ${skipped} skipped due to Neo4j unavailability`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[batch-approve] Fatal:", err);
  process.exit(1);
});
