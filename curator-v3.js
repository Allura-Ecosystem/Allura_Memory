const { Pool } = require('pg');
const { createHash, randomUUID } = require('crypto');

const CURATOR_ID = "auto-curator-content-aware";
const CATEGORIES = {
  BUSINESS_DECISION: ["pricing","contract","agreement","terms","approved","rejected","deal","order","supplier","co-packer","invoice","payment","margin"],
  STAKEHOLDER_COMM: ["email","call","meeting","said","confirmed","replied","reached out","follow-up","thread","contacted"],
  COMPLIANCE_CLAIM: ["halal","usda","haccp","certification","label","ingredient","claim","healthier","organic","natural"],
  GRANT_DEADLINE: ["grant","deadline","rfp","submission","application","proposal","funding","501c3","nonprofit"],
  TASK_STATUS: ["task","status","updated","moved","done","completed","created","assigned","sprint"],
  PERSONAL_CAREER: ["resume","interview","job","application","skill","experience","career","hiring","offer"],
  SESSION_LOG: ["session start","session end","trace","debug","auto-curator","cron"],
};
const VAGUE = ["maybe","might","could","possibly","tentative","unclear","tbd","not sure"];

function classify(c) {
  const l = c.toLowerCase();
  let best = "GENERAL", bestN = 0;
  for (const [cat, kws] of Object.entries(CATEGORIES)) {
    let n = kws.filter(k => l.includes(k.toLowerCase())).length;
    if (n > bestN) { bestN = n; best = cat; }
  }
  return bestN === 0 ? "GENERAL" : best;
}
function vague(c) { const l = c.toLowerCase(); return VAGUE.some(m => l.includes(m)); }
function shouldPromote(cat, score, content, gid) {
  if (cat === "COMPLIANCE_CLAIM") return false;
  if (cat === "SESSION_LOG") return false;
  if (gid === "allura-system") {
    const l = content.toLowerCase();
    if (l.includes("governance") && (l.includes("policy") || l.includes("invariant") || l.includes("override"))) return false;
  }
  switch(cat) {
    case "BUSINESS_DECISION": return score >= 0.85 && !vague(content);
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

  const { rows } = await pool.query(
    `SELECT id, group_id, content, score, tier FROM canonical_proposals WHERE status='pending' AND group_id NOT LIKE 'allura-test-%' ORDER BY group_id, created_at ASC`
  );
  console.log(`Found ${rows.length} pending proposals`);

  let promoted = 0, held = 0, failed = 0;
  const stats = {};

  for (const p of rows) {
    const cat = classify(p.content);
    const score = parseFloat(p.score);
    const eligible = shouldPromote(cat, score, p.content, p.group_id);
    
    if (!stats[cat]) stats[cat] = { p: 0, h: 0 };
    if (!stats[p.group_id]) stats[p.group_id] = { p: 0, h: 0 };

    if (!eligible) {
      held++; stats[cat].h++; stats[p.group_id].h++;
      continue;
    }

    const decidedAt = new Date().toISOString();
    const memId = randomUUID();
    const witness = createHash("sha256").update(`${p.id}|${p.group_id}|${p.score}|${p.tier}|approve|${decidedAt}|${CURATOR_ID}`).digest("hex");

    try {
      // Insert audit event into events table
      await pool.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, 'proposal_approved', $2, 'completed', $3, $4)`,
        [
          p.group_id,
          CURATOR_ID,
          JSON.stringify({
            proposal_id: p.id, group_id: p.group_id, memory_id: memId,
            curator_id: CURATOR_ID, decision: "approved",
            rationale: `Content-aware auto-promotion (category=${cat}, score=${score})`,
            score, tier: p.tier, approved_at: decidedAt, witness_hash: witness,
          }),
          decidedAt,
        ]
      );

      // Mark proposal as approved
      const result = await pool.query(
        `UPDATE canonical_proposals SET status='approved', decided_at=$1, decided_by=$2, rationale=$3, witness_hash=$4 WHERE id=$5 AND status='pending'`,
        [decidedAt, CURATOR_ID, 'Content-aware auto-promotion ('+cat+', score='+score+')', witness, p.id]
      );

      if (result.rowCount > 0) {
        promoted++; stats[cat].p++; stats[p.group_id].p++;
      } else {
        // Already processed by another worker
        held++; stats[cat].h++; stats[p.group_id].h++;
      }
    } catch (err) {
      console.error(`ERROR proposal ${p.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Promoted: ${promoted}, Held: ${held}, Failed: ${failed}`);
  console.log(`\nBy Category:`);
  for (const [c, s] of Object.entries(stats).sort()) console.log(`  ${c}: promoted=${s.p}, held=${s.h}`);
  
  // Group stats
  console.log(`\nBy Group:`);
  const groupStats = {};
  for (const p of rows) {
    if (!groupStats[p.group_id]) groupStats[p.group_id] = { p: 0, h: 0 };
  }
  for (const [g, s] of Object.entries(stats).filter(([k]) => k.startsWith("allura-"))) {
    if (groupStats[g]) { groupStats[g].p = s.p; groupStats[g].h = s.h; }
  }
  for (const [g, s] of Object.entries(groupStats).sort()) console.log(`  ${g}: promoted=${s.p}, held=${s.h}`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
