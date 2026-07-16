const { Pool } = require('pg');
const { createHash, randomUUID } = require('crypto');

// Content category detection keywords
const CATEGORIES = {
  BUSINESS_DECISION: ['pricing', 'contract', 'agreement', 'terms', 'approved', 'rejected', 'deal', 'order', 'supplier', 'co-packer', 'invoice', 'payment', 'margin'],
  STAKEHOLDER_COMM: ['email', 'call', 'meeting', 'said', 'confirmed', 'replied', 'reached out', 'follow-up', 'thread', 'contacted'],
  COMPLIANCE_CLAIM: ['halal', 'usda', 'haccp', 'certification', 'label', 'ingredient', 'claim', 'healthier', 'organic', 'natural'],
  GRANT_DEADLINE: ['grant', 'deadline', 'rfp', 'submission', 'application', 'proposal', 'funding', '501c3', 'nonprofit'],
  TASK_STATUS: ['task', 'status', 'updated', 'moved', 'done', 'completed', 'created', 'assigned', 'sprint'],
  PERSONAL_CAREER: ['resume', 'interview', 'job', 'application', 'skill', 'experience', 'career', 'hiring', 'offer'],
  SESSION_LOG: ['SESSION START', 'SESSION END', 'trace', 'debug', 'auto-curator', 'cron'],
};

// Vague markers that block BUSINESS_DECISION auto-promotion
const VAGUE_MARKERS = ['maybe', 'might', 'could', 'possibly', 'tentative', 'unclear', 'tbd', 'not sure'];

function classifyContent(content) {
  const lower = content.toLowerCase();
  const scores = {};
  
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) count++;
    }
    scores[category] = count;
  }
  
  // Find best category
  let bestCat = 'GENERAL';
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  
  // Require at least 1 keyword match for non-general
  if (bestScore === 0) return 'GENERAL';
  return bestCat;
}

function hasVagueMarkers(content) {
  const lower = content.toLowerCase();
  return VAGUE_MARKERS.some(m => lower.includes(m));
}

// Auto-promotion rules per category
function shouldAutoPromote(category, score, content, groupId) {
  // NEVER auto-promote these
  if (category === 'COMPLIANCE_CLAIM') return false;
  if (category === 'SESSION_LOG') return false;
  
  // Check for governance policy changes in allura-system
  if (groupId === 'allura-system') {
    const lower = content.toLowerCase();
    if (lower.includes('governance') && (lower.includes('policy') || lower.includes('invariant') || lower.includes('override'))) {
      return false;
    }
  }
  
  switch (category) {
    case 'BUSINESS_DECISION':
      return score >= 0.85 && !hasVagueMarkers(content);
    case 'STAKEHOLDER_COMM':
      return score >= 0.85;
    case 'GRANT_DEADLINE':
      return score >= 0.80;
    case 'TASK_STATUS':
      return score >= 0.85;
    case 'PERSONAL_CAREER':
      return score >= 0.75;
    case 'GENERAL':
      return score >= 0.85;
    default:
      return false;
  }
}

// Per-group rules
function getGroupThreshold(groupId, category) {
  const groupRules = {
    'allura-faith-meats': {
      BUSINESS_DECISION: 0.85,
      STAKEHOLDER_COMM: 0.85,
      TASK_STATUS: 0.85,
      COMPLIANCE_CLAIM: null, // ALWAYS HITL
    },
    'allura-difference-driven': {
      GRANT_DEADLINE: 0.80,
      STAKEHOLDER_COMM: 0.85,
      GENERAL: 0.85,
    },
    'allura-personal': {
      PERSONAL_CAREER: 0.75,
      GENERAL: 0.85,
    },
    'allura-system': {
      GENERAL: 0.85,
      TASK_STATUS: 0.85,
      BUSINESS_DECISION: 0.85,
    },
    'allura-team-durham': {
      GENERAL: 0.85,
      TASK_STATUS: 0.85,
    },
  };
  
  if (groupRules[groupId] && groupRules[groupId][category] !== undefined) {
    return groupRules[groupId][category];
  }
  // Default rules
  return shouldAutoPromote(category, 0, '', groupId) ? 0.85 : null;
}

async function main() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'memory',
    user: process.env.POSTGRES_USER || 'ronin4life',
    password: process.env.POSTGRES_PASSWORD,
  });

  // Get all pending proposals (excluding test groups)
  const { rows: proposals } = await pool.query(
    `SELECT id, group_id, content, score, tier, created_at
     FROM canonical_proposals
     WHERE status = 'pending'
     AND group_id NOT LIKE 'allura-test-%'
     ORDER BY group_id, created_at ASC`
  );

  console.log(`[auto-curator] Found ${proposals.length} pending proposals across all groups`);

  // Classify each proposal
  const results = {
    promoted: [],
    held: [],
    byCategory: {},
    byGroup: {},
  };

  for (const p of proposals) {
    const category = classifyContent(p.content);
    const score = parseFloat(p.score);
    const eligible = shouldAutoPromote(category, score, p.content, p.group_id);
    
    if (!results.byCategory[category]) results.byCategory[category] = { promoted: 0, held: 0 };
    if (!results.byGroup[p.group_id]) results.byGroup[p.group_id] = { promoted: 0, held: 0 };
    
    if (eligible) {
      results.promoted.push({ ...p, category, score });
      results.byCategory[category].promoted++;
      results.byGroup[p.group_id].promoted++;
    } else {
      results.held.push({ ...p, category, score, reason: getHoldReason(category, p.content, p.group_id) });
      results.byCategory[category].held++;
      results.byGroup[p.group_id].held++;
    }
  }

  // Print summary
  console.log('\n=== CONTENT-AWARE AUTO-CURATOR REPORT ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`\nTotal pending: ${proposals.length}`);
  console.log(`Eligible for auto-promotion: ${results.promoted.length}`);
  console.log(`Held for HITL review: ${results.held.length}`);
  
  console.log('\n--- By Category ---');
  for (const [cat, counts] of Object.entries(results.byCategory).sort()) {
    console.log(`  ${cat}: promoted=${counts.promoted}, held=${counts.held}`);
  }
  
  console.log('\n--- By Group ---');
  for (const [group, counts] of Object.entries(results.byGroup).sort()) {
    console.log(`  ${group}: promoted=${counts.promoted}, held=${counts.held}`);
  }
  
  // List what would be promoted (dry run first)
  console.log('\n--- Proposals to PROMOTE (sample) ---');
  for (const p of results.promoted.slice(0, 20)) {
    console.log(`  [${p.group_id}] ${p.category} score=${p.score} id=${p.id} preview="${p.content.substring(0, 80)}..."`);
  }
  if (results.promoted.length > 20) {
    console.log(`  ... and ${results.promoted.length - 20} more`);
  }
  
  console.log('\n--- Proposals HELD for HITL (sample) ---');
  for (const p of results.held.slice(0, 20)) {
    console.log(`  [${p.group_id}] ${p.category} score=${p.score} reason=${p.reason} id=${p.id} preview="${p.content.substring(0, 80)}..."`);
  }
  if (results.held.length > 20) {
    console.log(`  ... and ${results.held.length - 20} more`);
  }

  // Output machine-readable summary
  console.log('\n=== JSON SUMMARY ===');
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    total_pending: proposals.length,
    total_promoted: results.promoted.length,
    total_held: results.held.length,
    by_category: results.byCategory,
    by_group: results.byGroup,
    promoted_ids: results.promoted.map(p => ({ id: p.id, group_id: p.group_id, category: p.category, score: p.score })),
    held_sample: results.held.slice(0, 50).map(p => ({ id: p.id, group_id: p.group_id, category: p.category, score: p.score, reason: p.reason })),
  }));

  await pool.end();
}

function getHoldReason(category, content, groupId) {
  if (category === 'COMPLIANCE_CLAIM') return 'COMPLIANCE_CLAIM always requires HITL (legal liability)';
  if (category === 'SESSION_LOG') return 'SESSION_LOG never auto-promoted';
  if (groupId === 'allura-system') {
    const lower = content.toLowerCase();
    if (lower.includes('governance') && (lower.includes('policy') || lower.includes('invariant') || lower.includes('override'))) {
      return 'Governance policy changes always require HITL';
    }
  }
  return 'Below threshold or vague markers';
}

main().catch(err => { console.error(err); process.exit(1); });
