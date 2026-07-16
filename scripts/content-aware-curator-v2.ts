/**
 * Content-Aware Auto-Curator v2
 * Marks eligible proposals as approved in PostgreSQL.
 * The MCP gateway handles Neo4j promotion separately.
 */

import { Pool } from "pg";
import { createHash, randomUUID } from "crypto";

const CURATOR_ID = "auto-curator-content-aware";
const RATIONALE = "Content-aware auto-promotion: category classification passed threshold check";

const CATEGORIES: Record<string, string[]> = {
  BUSINESS_DECISION: ["pricing", "contract", "agreement", "terms", "approved", "rejected", "deal", "order", "supplier", "co-packer", "invoice", "payment", "margin"],
  STAKEHOLDER_COMM: ["email", "call", "meeting", "said", "confirmed", "replied", "reached out", "follow-up", "thread", "contacted"],
  COMPLIANCE_CLAIM: ["halal", "usda", "haccp", "certification", "label", "ingredient", "claim", "healthier", "organic", "natural"],
  GRANT_DEADLINE: ["grant", "deadline", "rfp", "submission", "application", "proposal", "funding", "501c3", "nonprofit"],
  TASK_STATUS: ["task", "status", "updated", "moved", "done", "completed", "created", "assigned", "sprint"],
  PERSONAL_CAREER: ["resume", "interview", "job", "application", "skill", "experience", "career", "hiring", "offer"],
  SESSION_LOG: ["session start", "session end", "trace", "debug", "auto-curator", "cron"],
};

const VAGUE_MARKERS = ["maybe", "might", "could", "possibly", "tentative", "unclear", "tbd", "not sure"];

function classifyContent(content: string): string {
  const lower = content.toLowerCase();
  let bestCat = "GENERAL";
  let bestScore = 0;
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) count++;
    }
    if (count > bestScore) { bestScore = count; bestCat = category; }
  }
  return bestScore === 0 ? "GENERAL" : bestCat;
}

function hasVagueMarkers(content: string): boolean {
  const lower = content.toLowerCase();
  return VAGUE_MARKERS.some(m => lower.includes(m));
}

function shouldAutoPromote(category: string, score: number, content: string, groupId: string): boolean {
  if (category === "COMPLIANCE_CLAIM") return false;
  if (category === "SESSION_LOG") return false;
  if (groupId === "allura-system") {
    const lower = content.toLowerCase();
    if (lower.includes("governance") && (lower.includes("policy") || lower.includes("invariant") || lower.includes("override"))) return false;
  }
  switch (category) {
    case "BUSINESS_DECISION": return score >= 0.85 && !hasVagueMarkers(content);
    case "STAKEHOLDER_COMM": return score >= 0.85;
    case "GRANT_DEADLINE": return score >= 0.80;
    case "TASK_STATUS": return score >= 0.85;
    case "PERSONAL_CAREER": return score >= 0.75;
    case "GENERAL": return score >= 0.85;
    default: return false;
  }
}

async function main() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    database: process.env.POSTGRES_DB || "memory",
    user: process.env.POSTGRES_USER || "ronin4life",
    password: process.env.POSTGRES_PASSWORD,
  });

  const { rows: proposals } = await pool.query(
    `SELECT id, group_id, content, score, tier, created_at
     FROM canonical_proposals
     WHERE status = 'pending'
     AND group_id NOT LIKE 'allura-test-%'
     ORDER BY group_id, created_at ASC`
  );

  console.log(`[content-aware-curator-v2] Found ${proposals.length} pending proposals`);

  const stats = { promoted: 0, held: 0, failed: 0,
    byCategory: {} as Record<string, { promoted: number; held: number }>,
    byGroup: {} as Record<string, { promoted: number; held: number }>,
  };

  const promotedIds: string[] = [];

  for (const p of proposals) {
    const category = classifyContent(p.content);
    const score = parseFloat(p.score);
    const eligible = shouldAutoPromote(category, score, p.content, p.group_id);

    if (!stats.byCategory[category]) stats.byCategory[category] = { promoted: 0, held: 0 };
    if (!stats.byGroup[p.group_id]) stats.byGroup[p.group_id] = { promoted: 0, held: 0 };

    if (!eligible) {
      stats.held++;
      stats.byCategory[category].held++;
      stats.byGroup[p.group_id].held++;
      continue;
    }

    const decidedAt = new Date().toISOString();
    const memoryId = randomUUID();
    const witnessPayload = `${p.id}|${p.group_id}|${p.content}|${p.score}|${p.tier}|approve|${decidedAt}|${CURATOR_ID}`;
    const witness_hash = createHash("sha256").update(witnessPayload).digest("hex");

    try {
      // Insert audit event
      await pool.query(
        `INSERT INTO memory_events (group_id, user_id, event_type, content, metadata, created_at)
         VALUES ($1, $2, 'proposal_approved', $3, $4, $5)`,
        [
          p.group_id,
          CURATOR_ID,
          `Approved proposal ${p.id} (${category}, score=${score})`,
          JSON.stringify({
            proposal_id: p.id,
            group_id: p.group_id,
            memory_id: memoryId,
            curator_id: CURATOR_ID,
            decision: "approved",
            rationale: `${RATIONALE} (category=${category}, score=${score})`,
            score: score,
            tier: p.tier,
            approved_at: decidedAt,
            witness_hash: witness_hash,
          }),
          decidedAt,
        ]
      );

      // Mark proposal as approved
      await pool.query(
        `UPDATE canonical_proposals 
         SET status = 'approved', decided_at = $1, decision = 'approved', 
             curator_id = $2, memory_id = $3, witness_hash = $4 
         WHERE id = $5 AND status = 'pending'`,
        [decidedAt, CURATOR_ID, memoryId, witness_hash, p.id]
      );

      promotedIds.push(p.id);
      stats.promoted++;
      stats.byCategory[category].promoted++;
      stats.byGroup[p.group_id].promoted++;
    } catch (err: any) {
      console.error(`[ERROR] Failed to approve proposal ${p.id}: ${err.message}`);
      stats.failed++;
    }
  }

  console.log(`\n=== CONTENT-AWARE AUTO-CURATOR V2 RESULTS ===`);
  console.log(`Promoted: ${stats.promoted}`);
  console.log(`Held for HITL: ${stats.held}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`\nBy Category:`);
  for (const [cat, counts] of Object.entries(stats.byCategory).sort()) {
    console.log(`  ${cat}: promoted=${counts.promoted}, held=${counts.held}`);
  }
  console.log(`\nBy Group:`);
  for (const [group, counts] of Object.entries(stats.byGroup).sort()) {
    console.log(`  ${group}: promoted=${counts.promoted}, held=${counts.held}`);
  }
  console.log(`\nPromoted IDs (first 20): ${promotedIds.slice(0, 20).join(', ')}`);
  if (promotedIds.length > 20) console.log(`... and ${promotedIds.length - 20} more`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
