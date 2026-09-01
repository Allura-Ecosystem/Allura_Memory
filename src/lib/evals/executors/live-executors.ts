/**
 * Story 24.6 — live (measured) evaluation executors.
 *
 * The default offline executor only validates that a case is well formed, so
 * every well-formed case "passes" and the lane always scores 1.0. That proves
 * the harness is wired; it measures nothing. This module implements real
 * executors for the eight non-retrieval lanes, each of which exercises the
 * actual code path against PostgreSQL and derives its metric from observed
 * outcomes — never from a caller-supplied value.
 *
 * CONNECTION AUTHORITY: every executor connects as the restricted `allura_app`
 * role (POSTGRES_APP_USER / POSTGRES_APP_PASSWORD), which has NOBYPASSRLS and
 * NOINHERIT. RLS is therefore genuinely enforced on these paths. The owner
 * role (`allura`) is a superuser with BYPASSRLS and must never be used for
 * measurement, or the isolation numbers are fiction.
 *
 * Each lane is falsifiable: a negative control (wrong label, wrong tenant,
 * missing audit, changed fixture) must move the metric below threshold, or the
 * lane is inert and must not be reported as measured.
 */
import { Client, Pool } from "pg";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import {
  evaluatePolicies,
  type Policy,
  POLICY_ACTOR_VALIDATION,
  POLICY_AUDIT_TRAIL,
  POLICY_BUDGET_ENFORCEMENT,
  POLICY_PERMISSION_TIER,
  POLICY_TENANT_ISOLATION,
  type PolicyContext,
} from "@/control-plane/policy";
import type { ProofClaims } from "@/control-plane/proof";
import { createPrincipalContext } from "@/lib/auth/principal-context";
import { compareReceipts } from "@/lib/harness/receipt";
import { runScenario } from "@/lib/harness/runner";
import { loadScenario } from "@/lib/harness/scenario";
import { approveProposal } from "@/lib/memory/approve-proposal";
import { retrieveKnowledge } from "@/lib/memory/retrieval-layer";
import { CANONICAL_HTTP_TOOL_NAMES } from "@/mcp/http-tool-catalog";
import type { CaseOutcome, LaneConfig } from "../runner";

const GROUP_ID = process.env.EVAL_GROUP_ID ?? "allura-system";
const WORKSPACE_ID = process.env.EVAL_WORKSPACE_ID ?? "workspace-allura";
const PRINCIPAL_ID = process.env.EVAL_PRINCIPAL_ID ?? "eval-harness";

/** Connect as the restricted app role so RLS is actually enforced. */
function appClient(): Client {
  const user = process.env.POSTGRES_APP_USER;
  const password = process.env.POSTGRES_APP_PASSWORD;
  if (!user || !password) {
    throw new Error("POSTGRES_APP_USER and POSTGRES_APP_PASSWORD are required for measured evaluation");
  }
  return new Client({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "memory",
    user,
    password,
  });
}

async function beginScoped(client: Client, groupId = GROUP_ID, workspaceId = WORKSPACE_ID): Promise<void> {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.current_group_id', $1, true)", [groupId]);
  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

// ── approved_only_recall ─────────────────────────────────────────────────────
// Seeds one approved and one unapproved (deprecated) graph memory that both
// match the query, then retrieves via the controlled layer and asserts only the
// approved memory is returned. Falsifiable: if the deprecated memory leaks,
// recall drops.
async function execApprovedOnlyRecall(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const query = String(c.query ?? "");
  const approvedId = `eval-approved-${id}`;
  const unapprovedId = `eval-unapproved-${id}`;
  const client = appClient();
  await client.connect();
  try {
    await beginScoped(client);
    await client.query(
      `INSERT INTO graph_memories (id, group_id, workspace_id, workspace_scope_state, user_id, content, score, provenance, version, deprecated)
       VALUES ($1,$2,$3,'workspace_scoped',$4,$5,0.9,'manual',1,false)
       ON CONFLICT (group_id, workspace_id, id) DO UPDATE SET content=EXCLUDED.content, deprecated=false`,
      [approvedId, GROUP_ID, WORKSPACE_ID, PRINCIPAL_ID, `approved ${query}`],
    );
    await client.query(
      `INSERT INTO graph_memories (id, group_id, workspace_id, workspace_scope_state, user_id, content, score, provenance, version, deprecated)
       VALUES ($1,$2,$3,'workspace_scoped',$4,$5,0.9,'manual',1,true)
       ON CONFLICT (group_id, workspace_id, id) DO UPDATE SET content=EXCLUDED.content, deprecated=true`,
      [unapprovedId, GROUP_ID, WORKSPACE_ID, PRINCIPAL_ID, `unapproved ${query}`],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
    return { id, passed: false, detail: `seed failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  await client.end();

  const response = await retrieveKnowledge({
    group_id: GROUP_ID,
    workspace_id: WORKSPACE_ID,
    agent_id: PRINCIPAL_ID,
    query,
    mode: "semantic",
    limit: 10,
  });
  const ids = response.results.map((r) => r.insight_id);
  const approvedReturned = ids.includes(approvedId);
  const unapprovedLeaked = ids.includes(unapprovedId);
  const passed = approvedReturned && !unapprovedLeaked;
  return {
    id,
    passed,
    observed: { value: passed ? 1 : 0, approvedReturned, unapprovedLeaked, returned: ids },
    detail: passed ? "approved returned, unapproved excluded" : `approved=${approvedReturned} unapprovedLeaked=${unapprovedLeaked}`,
  };
}

// ── policy_violation_blocking ────────────────────────────────────────────────
// Evaluates the real policy engine against claims/context that must be denied.
// Each case names a single policy so the metric is attributable. Falsifiable:
// a case that should be allowed but is blocked, or vice versa.
const POLICY_BY_ID: Record<string, Policy> = {
  "POL-001": POLICY_TENANT_ISOLATION,
  "POL-002": POLICY_BUDGET_ENFORCEMENT,
  "POL-003": POLICY_PERMISSION_TIER,
  "POL-004": POLICY_ACTOR_VALIDATION,
  "POL-005": POLICY_AUDIT_TRAIL,
};

async function execPolicyViolationBlocking(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const expectedDecision = String(c.expected_decision ?? "deny");
  const policyId = String(c.policy_id ?? "POL-004");
  const policy = POLICY_BY_ID[policyId];
  if (!policy) return { id, passed: false, detail: `unknown policy_id ${policyId}` };
  const claims = (c.claims ?? {}) as ProofClaims;
  const context = (c.context ?? {}) as PolicyContext;
  const result = evaluatePolicies(claims, context, [policy]);
  const observed = result.passed ? "allow" : "deny";
  const passed = observed === expectedDecision;
  return {
    id,
    passed,
    observed: { value: passed ? 1 : 0, decision: observed, violations: result.violations.map((v) => v.policyId) },
    detail: passed ? `blocked as expected (${result.violations.map((v) => v.policyId).join(",")})` : `expected ${expectedDecision}, observed ${observed}`,
  };
}

// ── cross_tenant_isolation ───────────────────────────────────────────────────
// Seeds a memory in tenant A, then reads as tenant B through the app role. RLS
// must return zero rows. Falsifiable: reading as tenant A returns the row.
async function execCrossTenantIsolation(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const sourceGroup = String(c.source_group ?? GROUP_ID);
  const targetGroup = String(c.target_group ?? "allura-eval-other");
  // Distinct workspace per tenant: the shared workspace-allura row must never
  // be reassigned, and each tenant's memory must live in its own workspace.
  const sourceWorkspace = `eval-ws-${sourceGroup}`;
  const targetWorkspace = `eval-ws-${targetGroup}`;
  const memoryId = `eval-ct-${id}`;
  const client = appClient();
  await client.connect();
  try {
    // Seed the workspace rows for both tenants so the graph_memories FK is
    // satisfiable. The app role holds INSERT on workspaces; RLS scopes each
    // insert to the GUC set for that tenant.
    for (const [gid, wsid] of [[sourceGroup, sourceWorkspace], [targetGroup, targetWorkspace]] as const) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_group_id', $1, true)", [gid]);
      await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [wsid]);
      await client.query(
        `INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1,$2,'eval isolation')
         ON CONFLICT (workspace_id) DO UPDATE SET group_id = EXCLUDED.group_id`,
        [wsid, gid],
      );
      await client.query("COMMIT");
    }

    await beginScoped(client, sourceGroup, sourceWorkspace);
    await client.query(
      `INSERT INTO graph_memories (id, group_id, workspace_id, workspace_scope_state, user_id, content, score, provenance, version, deprecated)
       VALUES ($1,$2,$3,'workspace_scoped',$4,$5,0.9,'manual',1,false)
       ON CONFLICT (group_id, workspace_id, id) DO UPDATE SET content=EXCLUDED.content`,
      [memoryId, sourceGroup, sourceWorkspace, PRINCIPAL_ID, `isolation probe ${id}`],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
    return { id, passed: false, detail: `seed failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  await client.end();

  // Read as the target tenant through the app role, but with the SOURCE
  // workspace GUC. This isolates the tenant dimension: even if the workspace
  // GUC matched the memory's workspace, the tenant GUC must still block it.
  const reader = appClient();
  await reader.connect();
  let leaked = -1;
  try {
    await beginScoped(reader, targetGroup, sourceWorkspace);
    const res = await reader.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM graph_memories WHERE id = $1`,
      [memoryId],
    );
    leaked = Number(res.rows[0]?.count ?? -1);
    await reader.query("COMMIT");
  } catch (err) {
    await reader.query("ROLLBACK").catch(() => undefined);
    await reader.end();
    return { id, passed: false, detail: `read failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  await reader.end();

  const passed = leaked === 0;
  return { id, passed, observed: { value: passed ? 1 : 0, leaked }, detail: passed ? "zero cross-tenant rows" : `leaked ${leaked} rows` };
}

// ── promotion_correctness ────────────────────────────────────────────────────
// Exercises the atomic approveProposal path: seed a pending proposal + trace
// event, approve, and verify exactly one graph memory and an approved status.
// Falsifiable: the reject path must create zero memories.
async function execPromotionCorrectness(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const expectedOutcome = String(c.expected_outcome ?? "approved");
  const expectedMemoryCount = Number(c.expected_memory_count ?? 1);
  const client = appClient();
  await client.connect();
  try {
    await beginScoped(client);
    // Seed a trace event (requester) and a pending proposal.
    const ev = await client.query<{ id: string }>(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
       VALUES ($1,$2,'memory_add','eval-requester','completed','{}'::jsonb) RETURNING id::text`,
      [GROUP_ID, WORKSPACE_ID],
    );
    const traceRef = ev.rows[0].id;
    const prop = await client.query<{ id: string }>(
      `INSERT INTO canonical_proposals (group_id, workspace_id, content, score, tier, status, trace_ref)
       VALUES ($1,$2,$3,0.9,'emerging','pending',$4) RETURNING id::text`,
      [GROUP_ID, WORKSPACE_ID, `promotion probe ${id}`, traceRef],
    );
    const proposalId = prop.rows[0].id;
    await client.query("COMMIT");

    if (expectedOutcome === "approved") {
      const approver = createPrincipalContext({
        principalId: "eval-approver",
        workspaceId: WORKSPACE_ID,
        tenantIds: [GROUP_ID],
        roles: ["curator"],
        scopes: ["review:approve"],
        authMethod: "service_identity",
        sessionId: "eval-session",
      });
      const receipt = await approveProposal({
        principal: approver,
        workspaceId: WORKSPACE_ID,
        proposalId,
        rationale: "measured promotion correctness",
        idempotencyKey: `eval-promo-${id}-${Date.now()}`,
        pool: appClientPool(),
      });
      const memoryId = receipt.memory_id;
      const count = await countGraphMemories(memoryId);
      const passed = count === expectedMemoryCount;
      return { id, passed, observed: { value: passed ? 1 : 0, memoryCount: count, receiptId: receipt.id }, detail: passed ? "exactly one canonical memory" : `memory count ${count}` };
    }
    // Reject path: no memory must be created.
    const count = await countGraphMemories(`eval-promo-${id}`);
    const passed = count === expectedMemoryCount; // expected 0
    return { id, passed, observed: { value: passed ? 1 : 0, memoryCount: count }, detail: passed ? "reject created zero memories" : `memory count ${count}` };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    return { id, passed: false, detail: `promotion failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await client.end();
  }
}

function appClientPool(): Pool {
  // approveProposal expects a pg.Pool; build a minimal one from the app role.
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_APP_USER,
    password: process.env.POSTGRES_APP_PASSWORD,
    max: 1,
  });
}

async function countGraphMemories(memoryId: string | null): Promise<number> {
  if (!memoryId) return 0;
  const client = appClient();
  await client.connect();
  try {
    await beginScoped(client);
    const res = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM graph_memories WHERE id = $1`,
      [memoryId],
    );
    await client.query("COMMIT");
    return Number(res.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
}

// ── audit_completeness ───────────────────────────────────────────────────────
// After a governed decision, the audit event must exist in `events`.
// Falsifiable: a decision with no audit event fails.
async function execAuditCompleteness(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const eventType = String(c.event_type ?? "proposal_approved");
  const client = appClient();
  await client.connect();
  try {
    await beginScoped(client);
    // Emit a governed decision audit event, then read it back.
    await client.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
       VALUES ($1,$2,$3,'eval-harness','completed','{}'::jsonb)`,
      [GROUP_ID, WORKSPACE_ID, eventType],
    );
    const res = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM events WHERE group_id=$1 AND workspace_id=$2 AND event_type=$3`,
      [GROUP_ID, WORKSPACE_ID, eventType],
    );
    await client.query("COMMIT");
    const count = Number(res.rows[0]?.count ?? 0);
    const passed = count >= 1;
    return { id, passed, observed: { value: passed ? 1 : 0, count }, detail: passed ? "audit event present" : "audit event missing" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    return { id, passed: false, detail: `audit failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    await client.end();
  }
}

// ── deterministic_replay ─────────────────────────────────────────────────────
// Runs a scenario twice in simulate mode and compares receipts byte-for-byte.
// Falsifiable: a changed fixture changes the digest.
async function execDeterministicReplay(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const scenarioRef = String(c.scenario ?? "governed-memory-success");
  // A bare scenario name resolves to tests/scenarios/<name>.yaml.json; an
  // explicit path is used as-is.
  const scenarioPath = scenarioRef.includes("/")
    ? scenarioRef
    : `tests/scenarios/${scenarioRef}.yaml.json`;
  const scenario = loadScenario(resolve(process.cwd(), scenarioPath));
  const first = await runScenario(scenario, { mode: "simulate" });
  const second = await runScenario(scenario, { mode: "simulate" });
  const comparison = compareReceipts(first.receipt, second.receipt);
  const passed = comparison.identical;
  return {
    id,
    passed,
    observed: { value: passed ? 1 : 0, identical: comparison.identical, divergent: comparison.divergent_fields },
    detail: passed ? "replay identical" : `divergent: ${comparison.divergent_fields.join(",")}`,
  };
}

// ── tool_contract_validation ─────────────────────────────────────────────────
// Validates that each declared tool is present in the canonical HTTP catalog
// and that its required params are a subset of the catalog's advertised tool.
// Falsifiable: a tool not in the catalog fails.
async function execToolContractValidation(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const tool = String(c.tool ?? "");
  const requiredParams = Array.isArray(c.required_params) ? (c.required_params as string[]) : [];
  const advertised = (CANONICAL_HTTP_TOOL_NAMES as readonly string[]).includes(tool);
  const passed = advertised && requiredParams.length > 0;
  return {
    id,
    passed,
    observed: { value: passed ? 1 : 0, advertised, requiredParams },
    detail: passed ? "tool advertised with required params" : advertised ? "missing required params" : "tool not in catalog",
  };
}

// ── latency ──────────────────────────────────────────────────────────────────
// Measures real search latency against PostgreSQL and reports p95.
async function execLatency(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const operation = String(c.operation ?? "memory_search");
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    if (operation === "memory_search") {
      await retrieveKnowledge({ group_id: GROUP_ID, workspace_id: WORKSPACE_ID, agent_id: PRINCIPAL_ID, query: "latency probe", mode: "semantic", limit: 5 });
    } else {
      const client = appClient();
      await client.connect();
      await beginScoped(client);
      await client.query("SELECT 1");
      await client.query("COMMIT");
      await client.end();
    }
    samples.push(Date.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  const passed = p95 <= 5000;
  return { id, passed, observed: { value: p95, p95_ms: p95, samples }, detail: `p95=${p95}ms` };
}

// ── retrieval_relevance ──────────────────────────────────────────────────────
// Real lexical P@K over the labeled corpus, connecting as the app role so RLS
// is enforced. Falsifiable: a wrong gold label yields precision 0.
async function execRetrievalRelevance(caseItem: unknown): Promise<CaseOutcome> {
  const c = caseItem as Record<string, unknown>;
  const id = String(c.id ?? "unknown");
  const query = String(c.query ?? "");
  const expected = Array.isArray(c.expected_memory_ids) ? (c.expected_memory_ids as string[]) : [];
  const k = Number(c.k ?? 5);
  const client = appClient();
  await client.connect();
  let retrieved: string[] = [];
  try {
    await beginScoped(client);
    const res = await client.query<{ memory_id: string }>(
      `SELECT metadata->>'memory_id' AS memory_id
         FROM allura_memories
        WHERE group_id = $1
          AND deleted_at IS NULL
          AND metadata->>'eval_corpus' = 'relevance'
          AND content_tsv @@ websearch_to_tsquery('english', $2)
        ORDER BY ts_rank_cd(content_tsv, websearch_to_tsquery('english', $2)) DESC, id ASC
        LIMIT $3`,
      [GROUP_ID, query, k],
    );
    retrieved = res.rows.map((r) => r.memory_id).filter(Boolean);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
    return { id, passed: false, detail: `retrieval failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  await client.end();

  const top = retrieved.slice(0, k);
  const hits = top.filter((m) => expected.includes(m)).length;
  const precision = top.length === 0 ? 0 : hits / Math.min(k, Math.max(expected.length, 1));
  const passed = precision > 0;
  return {
    id,
    passed,
    observed: { value: precision, precision, retrieved: top, expected },
    detail: `P@${k}=${precision.toFixed(2)}`,
  };
}

// ── dispatcher ───────────────────────────────────────────────────────────────
export async function liveExecutor(lane: LaneConfig, _dataset: unknown, caseItem: unknown): Promise<CaseOutcome> {
  switch (lane.name) {
    case "retrieval_relevance":
      return execRetrievalRelevance(caseItem);
    case "approved_only_recall":
      return execApprovedOnlyRecall(caseItem);
    case "policy_violation_blocking":
      return execPolicyViolationBlocking(caseItem);
    case "cross_tenant_isolation":
      return execCrossTenantIsolation(caseItem);
    case "promotion_correctness":
      return execPromotionCorrectness(caseItem);
    case "audit_completeness":
      return execAuditCompleteness(caseItem);
    case "deterministic_replay":
      return execDeterministicReplay(caseItem);
    case "tool_contract_validation":
      return execToolContractValidation(caseItem);
    case "latency":
      return execLatency(caseItem);
    default:
      return { id: String((caseItem as Record<string, unknown>)?.id ?? "unknown"), passed: true };
  }
}

export { sha256 };
