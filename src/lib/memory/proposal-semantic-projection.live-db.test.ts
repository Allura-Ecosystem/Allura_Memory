import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { runProposalSemanticProjectionJob } from "./proposal-semantic-projection";

// Env-var discipline: this file must skip cleanly with RUN_E2E_TESTS unset
// (the default for every non-live lane) and must not throw during test
// collection even when POSTGRES_HOST/PORT/DB/USER are unset -- a prior
// story's suite used a bare `process.env.X` (no `??` fallback) at the
// `new Pool()` call site and threw inside beforeAll on a missing env var,
// which vitest can surface as "skipped" rather than "failed" -- a thrown
// setup masquerading as a healthy skip. All Pool construction here happens
// with `??` fallbacks, and no Pool is created outside beforeAll/afterAll/it.
const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_PASSWORD ? describe : describe.skip;

describeLive("proposal semantic projection — persisted source-driven rebuild", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST ?? "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT ?? "5432"),
      database: process.env.POSTGRES_DB ?? "memory",
      user: process.env.POSTGRES_USER ?? "allura",
      password: process.env.POSTGRES_PASSWORD ?? "",
    });
    client = await pool.connect();
    await client.query("BEGIN");
  });
  afterAll(async () => { if (client) { await client.query("ROLLBACK"); client.release(); } if (pool) await pool.end(); });

  it("persists a truthful pending projection, then only marks ready with an actual embedding result", async () => {
    const suffix = Date.now().toString(36);
    const tenantId = `allura-projection-${suffix}`;
    const workspaceId = `workspace-${suffix}`;
    const principalId = `curator-${suffix}`;
    const proposalId = "252a0000-0000-4000-8000-000000000001";
    await client.query("INSERT INTO workspaces (group_id, workspace_id, name) VALUES ($1,$2,$3)", [tenantId, workspaceId, "Projection test"]);
    const event = await client.query(
      "INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata) VALUES ($1,$2,'memory_add','agent-source','completed','{}') RETURNING id",
      [tenantId, workspaceId],
    );
    await client.query(
      "INSERT INTO canonical_proposals (id, group_id, workspace_id, content, score, tier, status, trace_ref) VALUES ($1,$2,$3,$4,0.91,'mainstream','pending',$5)",
      [proposalId, tenantId, workspaceId, "Contact sabir@example.com with Bearer abc.def.ghi", event.rows[0].id],
    );
    await client.query(
      "INSERT INTO evidence_requests (group_id,workspace_id,proposal_id,requested_by,state,reason) VALUES ($1,$2,$3,$4,'requested','source proof')",
      [tenantId, workspaceId, proposalId, principalId],
    );
    const scope = { tenantId, workspaceId, principalId };
    const runner = async <T>(_scope: typeof scope, action: (db: PoolClient) => Promise<T>) => action(client);

    const first = await runProposalSemanticProjectionJob(scope, proposalId, runner as never);
    const second = await runProposalSemanticProjectionJob(scope, proposalId, runner as never);
    expect(second).toEqual(first);
    expect(first.sourceRefs).toContainEqual(expect.objectContaining({ table: "events", id: String(event.rows[0].id) }));
    expect(first.markdown).toContain("[REDACTED:EMAIL]");
    expect(first.markdown).not.toContain("sabir@example.com");

    const pending = await client.query(
      "SELECT markdown, embedding IS NULL AS embedding_missing, embedding_model, embedding_model_version, build_state, count(*) OVER ()::int AS copies FROM semantic_projections WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3",
      [tenantId, workspaceId, proposalId],
    );
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0]).toMatchObject({ copies: 1, embedding_missing: true, embedding_model: null, embedding_model_version: null, build_state: "pending_embedding" });
    expect(pending.rows[0].markdown).not.toContain("sabir@example.com");

    const embedded = await runProposalSemanticProjectionJob(scope, proposalId, runner as never, {
      vector: [0.125, -0.5, 0.25], model: "test-embedding-model", version: "fixture-v1",
    });
    expect(embedded).toMatchObject({ buildState: "ready", embeddingModel: "test-embedding-model", embeddingModelVersion: "fixture-v1" });
    const ready = await client.query(
      "SELECT embedding::text AS embedding, embedding_model, embedding_model_version, build_state, count(*) OVER ()::int AS copies FROM semantic_projections WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3",
      [tenantId, workspaceId, proposalId],
    );
    expect(ready.rows).toHaveLength(1);
    expect(ready.rows[0]).toMatchObject({ copies: 1, embedding: "[0.125,-0.5,0.25]", embedding_model: "test-embedding-model", embedding_model_version: "fixture-v1", build_state: "ready" });
  });
});
