/** Real PostgreSQL approval paths on a runner-owned disposable fixture.
 * Direct handler calls start after trusted middleware; they do not prove HTTP authentication.
 * Approved second-revision semantics remain an explicit failing requirement below.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { autoPromoteProposal, isAutoPromoteEnabled } from "../lib/curator/auto-promote";
import { curatorScore } from "../lib/curator/score";
import { authenticateServiceTransport } from "../lib/auth/mcp-authenticator";
import { createPrincipalContext } from "../lib/auth/principal-context";
import { closePool, getAppPool, getPool } from "../lib/postgres/connection";
import { approveProposal, type GovernanceReceipt } from "../lib/memory/approve-proposal";
import { freshFixtureScope, requireDisposableFixture } from "../../tests/fixtures/disposable-postgres";

const E2E_TIMEOUT = 30_000;
const changedEnvironment = ["PROMOTION_MODE", "AUTO_APPROVAL_THRESHOLD", "ALLURA_MCP_SERVICE_PRINCIPAL_ID", "ALLURA_MCP_SERVICE_WORKSPACE_ID", "ALLURA_MCP_SERVICE_TENANTS", "ALLURA_MCP_SERVICE_SCOPES"] as const;
const originalEnvironment = Object.fromEntries(changedEnvironment.map(key => [key, process.env[key]]));
let guard: Promise<() => void> | undefined;
async function prepareCase() {
  guard ??= requireDisposableFixture("src/__tests__/curator-pipeline.e2e.test.ts");
  const assertEnvironment = await guard;
  assertEnvironment();
  const scope = freshFixtureScope();
  const owner = getPool();
  await owner.query("INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,'Curator fixture')", [scope.workspaceId, scope.groupId]);
  return { ...scope, owner, assertEnvironment };
}
type Case = Awaited<ReturnType<typeof prepareCase>>;

async function seedProposal(test: Case) {
  test.assertEnvironment();
  const id = randomUUID();
  const source = await test.owner.query(
    "INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata) VALUES($1,$2,'proposal_source',$3,'completed','{}') RETURNING id",
    [test.groupId, test.workspaceId, test.principalId],
  );
  await test.owner.query(
    "INSERT INTO canonical_proposals(id,group_id,workspace_id,content,score,reasoning,tier,status,trace_ref) VALUES($1,$2,$3,'Original fixture insight',0.95,'fixture','mainstream','pending',$4)",
    [id, test.groupId, test.workspaceId, source.rows[0].id],
  );
  return id;
}

async function captureProposal(test: Case) {
  process.env.PROMOTION_MODE = "soc2";
  process.env.ALLURA_MCP_SERVICE_PRINCIPAL_ID = test.principalId;
  process.env.ALLURA_MCP_SERVICE_WORKSPACE_ID = test.workspaceId;
  process.env.ALLURA_MCP_SERVICE_TENANTS = test.groupId;
  process.env.ALLURA_MCP_SERVICE_SCOPES = "memory:write";
  // Canonical connection imports fill undefined dotenv values. Guard first, then recheck.
  const { memory_add } = await import("../mcp/canonical-tools");
  test.assertEnvironment();
  const principal = authenticateServiceTransport(test.sessionId);
  const request = principal.prepareMemoryAdd({ group_id: test.groupId, user_id: test.principalId,
    content: `I always prefer explicit return types and strict null checks in TypeScript [pipeline:${test.sessionId}]`,
    metadata: { source: "conversation" }, threshold: 0.5 }).request;
  const response = await memory_add(request);
  expect(response.stored).toBe("episodic");
  expect(response.pending_review).toBe(true);
  const proposals = await test.owner.query(
    `SELECT p.* FROM canonical_proposals p JOIN events e ON e.id=p.trace_ref
     AND e.group_id=p.group_id AND e.workspace_id=p.workspace_id
     WHERE p.group_id=$1 AND p.workspace_id=$2 AND e.event_type='memory_add' AND e.metadata->>'memory_id'=$3`,
    [test.groupId, test.workspaceId, response.id],
  );
  expect(proposals.rows).toHaveLength(1);
  expect(proposals.rows[0].status).toBe("pending");
  expect(Number(proposals.rows[0].score)).toBeGreaterThan(0);
  return proposals.rows[0].id as string;
}

async function approve(test: Case, proposalId: string) {
  test.assertEnvironment();
  return approveProposal({
    principal: createPrincipalContext({ principalId: `reviewer-${test.sessionId}`, tenantIds: [test.groupId], roles: ["curator"],
      scopes: ["review:approve"], authMethod: "service_identity", sessionId: `review-${test.sessionId}` }),
    groupId: test.groupId, workspaceId: test.workspaceId, proposalId, rationale: "Reviewed fixture evidence",
    idempotencyKey: `fixture-${proposalId}`, pool: getAppPool(),
  });
}

async function verifyApproval(test: Case, receipt: GovernanceReceipt) {
  const canonical = await test.owner.query("SELECT id,content,group_id,workspace_id,version,deprecated FROM graph_memories WHERE id=$1 AND group_id=$2 AND workspace_id=$3", [receipt.memory_id, test.groupId, test.workspaceId]);
  expect(canonical.rows).toHaveLength(1);
  expect(canonical.rows[0]).toMatchObject({ id: receipt.memory_id, group_id: test.groupId, workspace_id: test.workspaceId, version: 1, deprecated: false });
  expect(canonical.rows[0].content).toBeTruthy();
  const proposal = await test.owner.query("SELECT status,approved_memory_id,decided_by FROM canonical_proposals WHERE id=$1 AND group_id=$2 AND workspace_id=$3", [receipt.proposal_id, test.groupId, test.workspaceId]);
  expect(proposal.rows).toEqual([expect.objectContaining({ status: "approved", approved_memory_id: receipt.memory_id, decided_by: receipt.actor_id })]);
  const durable = await test.owner.query("SELECT id,action,memory_id FROM governance_receipts WHERE id=$1 AND group_id=$2 AND workspace_id=$3", [receipt.id, test.groupId, test.workspaceId]);
  expect(durable.rows).toEqual([{ id: receipt.id, action: "approve", memory_id: receipt.memory_id }]);
  const outbox = await test.owner.query("SELECT memory_id FROM promotion_outbox WHERE proposal_id=$1 AND group_id=$2 AND workspace_id=$3", [receipt.proposal_id, test.groupId, test.workspaceId]);
  expect(outbox.rows).toEqual([{ memory_id: receipt.memory_id }]);
}

describe("Curator Pipeline E2E", () => {
  afterEach(() => { for (const key of changedEnvironment) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  } });
  afterAll(async () => { await closePool(); });

  // Restored from the historical skip: verified issuer request and numeric PG score conversion.
  it("memory_add (SOC2 mode) queues proposal in canonical_proposals", async () => {
    await captureProposal(await prepareCase());
  }, E2E_TIMEOUT);

  it("curatorScore scores content correctly", async () => {
    const score = await curatorScore({ content: "I always use TypeScript with strict mode", source: "conversation", usageCount: 3, daysSinceCreated: 1 });
    expect(score.confidence).toBeGreaterThanOrEqual(0.6);
    expect(["emerging", "adoption", "mainstream"]).toContain(score.tier);
    expect(typeof score.reasoning).toBe("string");
    expect(score.reasoning.length).toBeGreaterThan(0);
  }, E2E_TIMEOUT);

  it("approveProposal writes the initial canonical record and durable evidence (Postgres-only)", async () => {
    const test = await prepareCase();
    await verifyApproval(test, await approve(test, await seedProposal(test)));
  }, E2E_TIMEOUT);

  it("createInsight second call SUPERSEDES first version", async () => {
    await prepareCase();
    throw new Error("OPEN BETA REQUIREMENT: approved second-revision semantics need content/predecessor-bound approval; approveProposal currently supports initial promotion only. Existing storage-lineage coverage is not equivalent.");
  }, E2E_TIMEOUT);

  it("full pipeline — memory_add → proposal → approveProposal → PostgreSQL", async () => {
    const test = await prepareCase();
    await verifyApproval(test, await approve(test, await captureProposal(test)));
  }, E2E_TIMEOUT);

  it("autoPromoteProposal — does not bypass HITL approval", async () => {
    const test = await prepareCase();
    process.env.PROMOTION_MODE = "auto";
    process.env.AUTO_APPROVAL_THRESHOLD = "0.5";
    expect(isAutoPromoteEnabled()).toBe(false);
    const proposalId = await seedProposal(test);
    expect(await autoPromoteProposal(proposalId, test.groupId)).toBeNull();
    const result = await test.owner.query("SELECT status,decided_by FROM canonical_proposals WHERE id=$1 AND group_id=$2 AND workspace_id=$3", [proposalId, test.groupId, test.workspaceId]);
    expect(result.rows).toEqual([{ status: "pending", decided_by: null }]);
  }, E2E_TIMEOUT);

  it("reject path — sets status=rejected in PG", async () => {
    const test = await prepareCase();
    const proposalId = await seedProposal(test);
    const { POST } = await import("../app/api/curator/approve/route");
    test.assertEnvironment();
    // Trusted post-middleware fixture headers; actual handler enforces role, scope and self-review.
    const request = (actor?: string) => new NextRequest("http://fixture.invalid/api/curator/approve", { method: "POST",
      headers: { "content-type": "application/json", "x-allura-role": "curator", ...(actor ? {
        "x-allura-user-id": actor, "x-allura-session-id": test.sessionId,
        "x-allura-group-id": test.groupId, "x-allura-workspace-id": test.workspaceId } : {}) },
      body: JSON.stringify({ proposal_id: proposalId, group_id: test.groupId, decision: "reject", rationale: "Too vague" }) });
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request(test.principalId))).status).toBe(403);
    const stillPending = await test.owner.query("SELECT status FROM canonical_proposals WHERE id=$1", [proposalId]);
    expect(stillPending.rows).toEqual([{ status: "pending" }]);
    const rejected = await POST(request(`reviewer-${test.sessionId}`));
    expect(rejected.status).toBe(200);
    const receipt = await rejected.json();
    expect(receipt.action).toBe("reject");
    const result = await test.owner.query("SELECT status,rationale FROM canonical_proposals WHERE id=$1 AND group_id=$2 AND workspace_id=$3", [proposalId, test.groupId, test.workspaceId]);
    expect(result.rows).toEqual([{ status: "rejected", rationale: "Too vague" }]);
    const durable = await test.owner.query("SELECT action FROM governance_receipts WHERE id=$1 AND group_id=$2 AND workspace_id=$3", [receipt.id, test.groupId, test.workspaceId]);
    expect(durable.rows).toEqual([{ action: "reject" }]);
  }, E2E_TIMEOUT);
});
