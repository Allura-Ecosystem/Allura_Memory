import { NextRequest } from "next/server"
import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createHash, randomUUID } from "node:crypto"
import { GET as graphRouteGet } from "@/app/api/memory/graph/route"
import { withRestrictedWorkspaceReadTransaction } from "@/lib/db/tenant-transaction"
import { getConnectionConfig } from "@/lib/postgres/connection"
import { normalizeSubgraphQuery } from "@/lib/subgraph/contract"
import { FOCUSED_SUBGRAPH_FOCUS_EDGE_SQL, FocusedSubgraphReadRepository } from "@/lib/subgraph/read-repository"

vi.mock("server-only", () => ({}))

import { FOCUSED_SUBGRAPH_STATEMENT_TIMEOUT_MS, FocusedSubgraphReadService } from "@/lib/subgraph/read-service"

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip

/**
 * Catalog/query-plan proof for migration 078. The broader disposable-database
 * migration harness applies this file in filename order; these assertions make
 * the security and plan requirements independently visible in the live lane.
 */
describeLive("focused subgraph live database contract", () => {
  let pool: Pool
  let appPool: Pool
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12)
  const group = `allura-graph-${suffix}`
  const workspace = `graph-${suffix}-a`
  const otherWorkspace = `graph-${suffix}-b`
  const ambiguousWorkspace = `graph-${suffix}-ambiguous`
  const bulkWorkspace = `graph-${suffix}-bulk`
  const integrityWorkspace = `graph-${suffix}-integrity`
  const movedWorkspace = `graph-${suffix}-moved`
  const otherGroup = `allura-graph-other-${suffix}`
  const otherTenantWorkspace = `graph-${suffix}-other-tenant`
  const principal = `viewer-${suffix}`
  const memoryNew = `memory-new-${suffix}`
  const memoryOld = `memory-old-${suffix}`
  const memoryDeleted = `memory-deleted-${suffix}`
  const agent = `agent-${suffix}`
  const project = `project-${suffix}`
  const isolated = `isolated-${suffix}`
  const unknown = `unknown-${suffix}`
  const evidenceReference = `event:focused-subgraph-${suffix}`
  const continuationSecret = Buffer.from(`focused-subgraph-live-${suffix}-secret-material`)

  const readTransaction = <T>(
    scope: { tenantId: string; workspaceId: string; principalId: string },
    callback: (client: PoolClient) => Promise<T>,
  ) => withRestrictedWorkspaceReadTransaction(scope, callback, appPool)

  const service = () => new FocusedSubgraphReadService({
    continuationSecret,
    rolloutValue: () => "true",
    transaction: readTransaction,
    now: () => new Date("2026-10-12T12:00:00.000Z"),
  })

  const authUser = (workspaceId = workspace) => ({
    id: principal,
    groupId: group,
    workspaceId,
    sessionId: `session-${suffix}`,
    role: "viewer" as const,
    email: `${principal}@example.invalid`,
  })

  beforeAll(async () => {
    pool = new Pool(getConnectionConfig({ role: "owner" }))
    appPool = new Pool(getConnectionConfig({ role: "app" }))

    await pool.query(
      `INSERT INTO workspaces(workspace_id,group_id,name) VALUES
         ($1,$5,'Focused graph A'),($2,$5,'Focused graph B'),($3,$5,'Focused graph ambiguous'),
         ($4,$5,'Focused graph bulk'),($6,$5,'Focused graph integrity'),($7,$5,'Focused graph moved')`,
      [workspace, otherWorkspace, ambiguousWorkspace, bulkWorkspace, group, integrityWorkspace, movedWorkspace],
    )
    await pool.query(
      `INSERT INTO workspaces(workspace_id,group_id,name) VALUES($1,$2,'Focused graph other tenant')`,
      [otherTenantWorkspace, otherGroup],
    )
    await pool.query(
      `INSERT INTO memberships(id,group_id,user_id,email,role) VALUES($1,$2,$3,$4,'viewer')`,
      [randomUUID(), group, principal, `${principal}@example.invalid`],
    )
    const approvalId = randomUUID()
    await pool.query(
      `INSERT INTO brain_membership_approvals
         (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at,consumed_at)
       VALUES($1,$2,$3,$4,'live-test-admin','workspace_membership_admin','grant',$5,1,now(),now())`,
      [approvalId, group, workspace, principal, `test:${suffix}`],
    )
    await pool.query(
      `INSERT INTO brain_workspace_memberships
         (group_id,workspace_id,user_id,approved_by,policy_epoch,approval_id)
       VALUES($1,$2,$3,'live-test-admin',1,$4)`,
      [group, workspace, principal, approvalId],
    )
    const bulkApprovalId = randomUUID()
    await pool.query(
      `INSERT INTO brain_membership_approvals
         (approval_id,group_id,workspace_id,subject_user_id,approver_id,approver_role,action,provenance_ref,policy_epoch,verified_at,consumed_at)
       VALUES($1,$2,$3,$4,'live-test-admin','workspace_membership_admin','grant',$5,1,now(),now())`,
      [bulkApprovalId, group, bulkWorkspace, principal, `test:bulk:${suffix}`],
    )
    await pool.query(
      `INSERT INTO brain_workspace_memberships
         (group_id,workspace_id,user_id,approved_by,policy_epoch,approval_id)
       VALUES($1,$2,$3,'live-test-admin',1,$4)`,
      [group, bulkWorkspace, principal, bulkApprovalId],
    )

    await pool.query(
      `INSERT INTO graph_memories
         (id,group_id,workspace_id,workspace_scope_state,user_id,content,score,provenance,version,deprecated,created_at)
       VALUES
         ($1,$3,$4,'workspace_scoped',$5,'New governed memory',0.9,'manual',2,false,'2026-10-12T10:00:00Z'),
         ($2,$3,$4,'workspace_scoped',$5,'Superseded governed memory',0.8,'manual',1,true,'2026-10-11T10:00:00Z'),
         ($6,$3,$4,'workspace_scoped',$5,'Soft deleted memory',0.7,'manual',1,true,'2026-10-10T10:00:00Z')`,
      [memoryNew, memoryOld, group, workspace, principal, memoryDeleted],
    )
    await pool.query("UPDATE graph_memories SET deleted_at=now() WHERE group_id=$1 AND workspace_id=$2 AND id=$3", [group, workspace, memoryDeleted])
    await pool.query(
      `INSERT INTO graph_structural_nodes
         (node_id,label,group_id,workspace_id,workspace_scope_state,props,created_at)
       VALUES
         ($1,'Agent',$7,$8,'workspace_scoped',$9::jsonb,'2026-10-12T09:00:00Z'),
         ($2,'Project',$7,$8,'workspace_scoped',$10::jsonb,'2026-10-12T08:00:00Z'),
         ($3,'Project',$7,$8,'workspace_scoped',$11::jsonb,'2026-10-12T07:00:00Z'),
         ($4,'NovelKind',$7,$8,'workspace_scoped',$12::jsonb,'2026-10-12T06:00:00Z'),
         ($5,'Project',$7,$6,'workspace_scoped','{"name":"Foreign project"}'::jsonb,now())`,
      [agent, project, isolated, unknown, `foreign-${suffix}`, otherWorkspace, group, workspace,
        JSON.stringify({ name: "Woz" }), JSON.stringify({ name: "Allura Memory" }),
        JSON.stringify({ name: "Isolated authorized root" }), JSON.stringify({ name: "Novel ontology" })],
    )
    await pool.query(
      `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
       VALUES($1,'Project',$2,$3,'workspace_scoped','{"name":"Other tenant project"}'::jsonb)`,
      [`other-tenant-${suffix}`, otherGroup, otherTenantWorkspace],
    )
    await pool.query(
      `INSERT INTO graph_structural_edges
         (from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state,from_kind,to_kind,endpoint_state,created_at)
       VALUES
         ($1,$2,'AUTHORED_BY',$5,$6,'workspace_scoped','memory','structural','resolved','2026-10-12T10:01:00Z'),
         ($2,$3,'MEMBER_OF',$5,$6,'workspace_scoped','structural','structural','resolved','2026-10-12T10:02:00Z'),
         ($3,$4,'UNMODELED_LINK',$5,$6,'workspace_scoped','structural','structural','resolved','2026-10-12T10:03:00Z')`,
      [memoryNew, agent, project, unknown, group, workspace],
    )
    await pool.query(
      `INSERT INTO graph_supersedes(newer_id,superseded_id,group_id,workspace_id,workspace_scope_state,created_at)
       VALUES($1,$2,$3,$4,'workspace_scoped','2026-10-12T10:04:00Z')`,
      [memoryNew, memoryOld, group, workspace],
    )

    const sourceEvent = await pool.query<{ id: string }>(
      `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata)
       VALUES($1,$2,'focused_subgraph_evidence',$3,'completed','{}'::jsonb) RETURNING id::text AS id`,
      [group, workspace, principal],
    )
    const proposalId = randomUUID()
    await pool.query(
      `INSERT INTO canonical_proposals
         (id,group_id,workspace_id,content,score,tier,status,trace_ref,approved_memory_id,decided_at,decided_by,rationale)
       VALUES($1,$2,$3,'New governed memory',0.9,'mainstream','approved',$4,$5,now(),'live-test-curator','Live evidence proof')`,
      [proposalId, group, workspace, sourceEvent.rows[0]!.id, memoryNew],
    )
    const refs = JSON.stringify([evidenceReference])
    const evidenceHash = createHash("sha256").update(refs).digest("hex")
    await pool.query(
      `INSERT INTO governance_receipts
         (group_id,workspace_id,proposal_id,proposal_version,evidence_identity_hash,action,actor_id,actor_role,
          rationale,policy_reference,policy_version,memory_id,outbox_state,source_event_id,witness_hash,evidence_references)
       VALUES($1,$2,$3,'1',$4,'approve','live-test-curator','curator','Approved with evidence',
              'policy://allura/focused-subgraph','1',$5,'synced',$6,'live-witness',$7::jsonb)`,
      [group, workspace, proposalId, evidenceHash, memoryNew, sourceEvent.rows[0]!.id, refs],
    )

    await pool.query(
      `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
       VALUES($1,'Project',$2,$3,'workspace_scoped','{"name":"Ambiguous root"}'::jsonb)`,
      [`ambiguous-root-${suffix}`, group, ambiguousWorkspace],
    )
    await pool.query(
      `INSERT INTO graph_structural_edges
         (from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state,from_kind,to_kind,endpoint_state)
       VALUES('legacy-from','legacy-to','RELATES_TO',$1,$2,'workspace_scoped',NULL,NULL,'ambiguous')`,
      [group, ambiguousWorkspace],
    )
    await pool.query(
      `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
       VALUES
         ($1,'Project',$3,$4,'workspace_scoped','{"name":"Bulk source"}'::jsonb),
         ($2,'Project',$3,$4,'workspace_scoped','{"name":"Bulk target"}'::jsonb)`,
      [`bulk-source-${suffix}`, `bulk-target-${suffix}`, group, bulkWorkspace],
    )
    await pool.query(
      `INSERT INTO graph_structural_edges
         (from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state,from_kind,to_kind,endpoint_state,created_at)
       SELECT $1,$2,'REL_'||lpad(series::text,3,'0'),$3,$4,'workspace_scoped',
              'structural','structural','resolved','2026-10-12T11:00:00Z'::timestamptz
       FROM generate_series(0,449) AS series`,
      [`bulk-source-${suffix}`, `bulk-target-${suffix}`, group, bulkWorkspace],
    )
  }, 30_000)

  afterAll(async () => { await Promise.all([appPool.end(), pool.end()]) })

  it("GRAPH-01/02/03/08/09/10/11/27 returns real mixed nodes, labeled edges, evidence, inspection, and lineage", async () => {
    const page = await withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: workspace, principalId: principal },
      (client) => new FocusedSubgraphReadRepository(client).read(
        { tenantId: group, workspaceId: workspace },
        normalizeSubgraphQuery({
          kind: "focus",
          focusNodeKey: `memory:${memoryNew}`,
          direction: "both",
          depth: 2,
          includeLineage: true,
        }),
      ),
      appPool,
    )

    expect(page.nodes.map((node) => node.key)).toContain(`memory:${memoryNew}`)
    expect(page.nodes.map((node) => node.key)).toContain(`structural:${agent}`)
    expect(page.edges.map((edge) => edge.kind.name)).toEqual(expect.arrayContaining(["AUTHORED_BY", "MEMBER_OF", "SUPERSEDES"]))
    expect(page.inspection).toMatchObject({
      nodeKey: `memory:${memoryNew}`,
      content: "New governed memory",
      provenance: { kind: "record", recordType: "graph_memories", recordKey: memoryNew },
      evidence: { state: "available", references: [evidenceReference] },
      lineage: [{
        newerNodeKey: `memory:${memoryNew}`,
        supersededNodeKey: `memory:${memoryOld}`,
        relationshipKey: expect.stringContaining("edge:graph_supersedes:"),
      }],
    })
  })

  it("GRAPH-06/25/26 preserves filters, unknown ontology, canonical order, closure, and isolated roots", async () => {
    const read = () => withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: workspace, principalId: principal },
      (client) => new FocusedSubgraphReadRepository(client).read(
        { tenantId: group, workspaceId: workspace },
        normalizeSubgraphQuery({ kind: "overview" }),
      ),
      appPool,
    )
    const [first, repeated] = await Promise.all([read(), read()])

    expect(repeated).toEqual(first)
    expect(first.nodes.map((node) => node.key)).toContain(`structural:${isolated}`)
    expect(first.nodes.map((node) => node.key)).not.toContain(`memory:${memoryDeleted}`)
    expect(first.nodes.find((node) => node.key === `structural:${unknown}`)?.kind).toEqual({ classification: "unknown", name: "NovelKind" })
    expect(first.edges.find((edge) => edge.kind.name === "UNMODELED_LINK")?.kind.classification).toBe("unknown")
    const nodeKeys = new Set(first.nodes.map((node) => node.key))
    expect(first.edges.every((edge) => nodeKeys.has(edge.sourceNodeKey) && nodeKeys.has(edge.targetNodeKey))).toBe(true)

    const filtered = await withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: workspace, principalId: principal },
      (client) => new FocusedSubgraphReadRepository(client).read(
        { tenantId: group, workspaceId: workspace },
        normalizeSubgraphQuery({ kind: "overview", nodeKinds: ["Memory"] }),
      ),
      appPool,
    )
    expect(filtered.nodes.every((node) => node.kind.name === "Memory")).toBe(true)
    expect(filtered.edges).toEqual([])
  })

  it("GRAPH-12/14 proves restricted-role tenant and workspace isolation against foreign rows", async () => {
    const rows = await withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: workspace, principalId: principal },
      async (client) => ({
        otherWorkspace: (await client.query<{ node_id: string }>(
          "SELECT node_id FROM graph_structural_nodes WHERE group_id=$1 AND workspace_id=$2", [group, otherWorkspace],
        )).rows,
        otherTenant: (await client.query<{ node_id: string }>(
          "SELECT node_id FROM graph_structural_nodes WHERE group_id=$1 AND workspace_id=$2", [otherGroup, otherTenantWorkspace],
        )).rows,
      }),
      appPool,
    )
    expect(rows).toEqual({ otherWorkspace: [], otherTenant: [] })
  })

  it("executes the HTTP route against real membership and RLS state", async () => {
    const previousEnabled = process.env.ALLURA_GRAPH_V2_ENABLED
    const previousSecret = process.env.ALLURA_GRAPH_CONTINUATION_SECRET
    process.env.ALLURA_GRAPH_V2_ENABLED = "true"
    process.env.ALLURA_GRAPH_CONTINUATION_SECRET = continuationSecret.toString("utf8")
    try {
      const response = await graphRouteGet(new NextRequest(
        `http://localhost:3100/api/memory/graph?kind=focus&focusNodeKey=${encodeURIComponent(`memory:${memoryNew}`)}&depth=1`,
        { headers: {
          "x-allura-user-id": principal, "x-allura-role": "viewer", "x-allura-group-id": group,
          "x-allura-workspace-id": workspace, "x-allura-session-id": `session-${suffix}`,
        } },
      ))
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-store")
      const body = await response.json()
      expect(body).toMatchObject({ contractVersion: "2.0", nodes: expect.arrayContaining([expect.objectContaining({ key: `memory:${memoryNew}` })]) })
      expect(JSON.stringify(body)).not.toContain(`foreign-${suffix}`)
    } finally {
      if (previousEnabled === undefined) delete process.env.ALLURA_GRAPH_V2_ENABLED
      else process.env.ALLURA_GRAPH_V2_ENABLED = previousEnabled
      if (previousSecret === undefined) delete process.env.ALLURA_GRAPH_CONTINUATION_SECRET
      else process.env.ALLURA_GRAPH_CONTINUATION_SECRET = previousSecret
    }
  })

  it("uses a repeatable-read, read-only transaction and rejects writes", async () => {
    const settings = await withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: workspace, principalId: principal },
      async (client) => ({
        isolation: (await client.query<{ transaction_isolation: string }>("SHOW transaction_isolation")).rows[0]!.transaction_isolation,
        readOnly: (await client.query<{ transaction_read_only: string }>("SHOW transaction_read_only")).rows[0]!.transaction_read_only,
      }),
      appPool,
    )
    expect(settings).toEqual({ isolation: "repeatable read", readOnly: "on" })
    await expect(withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: workspace, principalId: principal },
      (client) => client.query(
        `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
         VALUES($1,'Project',$2,$3,'workspace_scoped','{}'::jsonb)`,
        [`write-rejected-${suffix}`, group, workspace],
      ),
      appPool,
    )).rejects.toThrow(/read-only/i)
  })

  it("GRAPH-19/25 exhausts 450 edges through bound keysets without exceeding 200/400/2", async () => {
    const readService = service()
    const query = { kind: "overview" as const, nodeLimit: 2, edgeLimit: 400 }
    const first = await readService.read(authUser(bulkWorkspace), query)
    expect(first.state).toBe("partial")
    if (first.state !== "partial") throw new Error("expected partial first page")
    expect(first.nodes).toHaveLength(2)
    expect(first.edges).toHaveLength(400)
    expect(first.budgets.applied).toEqual({ nodeLimit: 2, edgeLimit: 400, depth: 0 })

    const second = await readService.read(authUser(bulkWorkspace), { ...query, continuation: first.continuation })
    expect(second.state).toBe("complete")
    if (second.state !== "complete") throw new Error("expected complete second page")
    expect(second.nodes).toHaveLength(2)
    expect(second.edges).toHaveLength(50)
    expect(new Set([...first.edges, ...second.edges].map((edge) => edge.key)).size).toBe(450)
  })

  it("GRAPH-13/17/18 denies revoked relational authority without graph disclosure", async () => {
    await pool.query(
      "UPDATE brain_workspace_memberships SET revoked_at=now() WHERE group_id=$1 AND workspace_id=$2 AND user_id=$3",
      [group, workspace, principal],
    )
    try {
      const result = await service().read(authUser(), { kind: "overview" })
      expect(result).toEqual({
        contractVersion: "2.0",
        state: "denied",
        reasonCode: "INSUFFICIENT_ROLE",
        action: "request_access",
      })
      expect(JSON.stringify(result)).not.toMatch(/New governed memory|Allura Memory|Woz/)
    } finally {
      await pool.query(
        "UPDATE brain_workspace_memberships SET revoked_at=NULL WHERE group_id=$1 AND workspace_id=$2 AND user_id=$3",
        [group, workspace, principal],
      )
    }
  })

  it("GRAPH-19/21 returns restart semantics when graph revision changes after a continuation", async () => {
    const readService = service()
    const query = { kind: "overview" as const, nodeLimit: 2, edgeLimit: 400 }
    const first = await readService.read(authUser(bulkWorkspace), query)
    if (first.state !== "partial") throw new Error("expected partial first page")
    await pool.query(
      `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
       VALUES($1,'Project',$2,$3,'workspace_scoped','{"name":"Revision change"}'::jsonb)`,
      [`revision-${randomUUID()}`, group, bulkWorkspace],
    )
    const result = await readService.read(authUser(bulkWorkspace), { ...query, continuation: first.continuation })
    expect(result).toEqual({
      contractVersion: "2.0",
      state: "error",
      code: "SNAPSHOT_CONFLICT",
      retryable: false,
      action: "restart",
    })
  })

  it("GRAPH-20/21/28 degrades ambiguous legacy endpoints without guessing or event-shaped graph rows", async () => {
    const page = await withRestrictedWorkspaceReadTransaction(
      { tenantId: group, workspaceId: ambiguousWorkspace, principalId: principal },
      (client) => new FocusedSubgraphReadRepository(client).read(
        { tenantId: group, workspaceId: ambiguousWorkspace },
        normalizeSubgraphQuery({ kind: "overview" }),
      ),
      appPool,
    )
    expect(page).toMatchObject({ ambiguous: true, nodes: [], edges: [] })
    expect(JSON.stringify(page)).not.toContain("event:")
  })

  it("forces RLS on every governed graph table including the revision ledger", async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
       WHERE relname=ANY($1::text[]) ORDER BY relname`,
      [["graph_memories", "graph_structural_nodes", "graph_structural_edges", "graph_supersedes", "graph_scope_revisions"]],
    )
    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true)
  })

  it("has deferred endpoint integrity and revision triggers", async () => {
    const { rows } = await pool.query<{ tgname: string; deferrable: boolean }>(
      `SELECT t.tgname,(t.tgdeferrable AND t.tginitdeferred) AS deferrable
       FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
       WHERE NOT t.tgisinternal AND (t.tgname='graph_structural_edges_endpoint_integrity' OR t.tgname='focused_subgraph_revision_trigger')`,
    )
    expect(rows.some((row) => row.tgname === "graph_structural_edges_endpoint_integrity" && row.deferrable)).toBe(true)
    expect(rows.filter((row) => row.tgname === "focused_subgraph_revision_trigger").length).toBeGreaterThanOrEqual(8)
  })

  it("enforces endpoint integrity, supports deferred creation, orphans stale edges, and bumps old/new scopes", async () => {
    const transact = async (statements: Array<{ sql: string; values: unknown[] }>) => {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        for (const statement of statements) await client.query(statement.sql, statement.values)
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    }
    const structuralInsert = (id: string, targetWorkspace = integrityWorkspace) => ({
      sql: `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
            VALUES($1,'Project',$2,$3,'workspace_scoped','{}'::jsonb)`,
      values: [id, group, targetWorkspace],
    })
    const edgeInsert = (from: string, to: string) => ({
      sql: `INSERT INTO graph_structural_edges
              (from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state,from_kind,to_kind,endpoint_state)
            VALUES($1,$2,'RELATES_TO',$3,$4,'workspace_scoped','structural','structural','resolved')`,
      values: [from, to, group, integrityWorkspace],
    })

    const deferredFrom = `deferred-from-${suffix}`; const deferredTo = `deferred-to-${suffix}`
    await transact([edgeInsert(deferredFrom, deferredTo), structuralInsert(deferredFrom), structuralInsert(deferredTo)])
    await expect(transact([edgeInsert(deferredFrom, `missing-${suffix}`)])).rejects.toThrow(/target is missing/)

    const foreignTarget = `cross-target-${suffix}`
    await pool.query(structuralInsert(foreignTarget, otherWorkspace).sql, structuralInsert(foreignTarget, otherWorkspace).values)
    await expect(transact([edgeInsert(deferredFrom, foreignTarget)])).rejects.toThrow(/target is missing/)

    const deleteFrom = `delete-from-${suffix}`; const deleteTo = `delete-to-${suffix}`
    await transact([structuralInsert(deleteFrom), structuralInsert(deleteTo), edgeInsert(deleteFrom, deleteTo)])
    await pool.query("DELETE FROM graph_structural_nodes WHERE group_id=$1 AND workspace_id=$2 AND node_id=$3", [group, integrityWorkspace, deleteTo])
    const deletedEdge = await pool.query<{ endpoint_state: string; from_kind: string | null; to_kind: string | null }>(
      "SELECT endpoint_state,from_kind,to_kind FROM graph_structural_edges WHERE group_id=$1 AND workspace_id=$2 AND from_id=$3 AND to_id=$4",
      [group, integrityWorkspace, deleteFrom, deleteTo],
    )
    expect(deletedEdge.rows).toEqual([{ endpoint_state: "orphan", from_kind: null, to_kind: null }])

    const moveFrom = `move-from-${suffix}`; const moveTo = `move-to-${suffix}`
    await transact([structuralInsert(moveFrom), structuralInsert(moveTo), edgeInsert(moveFrom, moveTo)])
    const before = await pool.query<{ workspace_id: string; graph_revision: string }>(
      "SELECT workspace_id,graph_revision::text FROM graph_scope_revisions WHERE group_id=$1 AND workspace_id=ANY($2::text[]) ORDER BY workspace_id",
      [group, [integrityWorkspace, movedWorkspace]],
    )
    const revisionsBefore = new Map(before.rows.map((row) => [row.workspace_id, Number(row.graph_revision)]))
    await pool.query(
      "UPDATE graph_structural_nodes SET workspace_id=$1 WHERE group_id=$2 AND workspace_id=$3 AND node_id=$4",
      [movedWorkspace, group, integrityWorkspace, moveTo],
    )
    const movedEdge = await pool.query<{ endpoint_state: string }>(
      "SELECT endpoint_state FROM graph_structural_edges WHERE group_id=$1 AND workspace_id=$2 AND from_id=$3 AND to_id=$4",
      [group, integrityWorkspace, moveFrom, moveTo],
    )
    expect(movedEdge.rows).toEqual([{ endpoint_state: "orphan" }])
    const after = await pool.query<{ workspace_id: string; graph_revision: string }>(
      "SELECT workspace_id,graph_revision::text FROM graph_scope_revisions WHERE group_id=$1 AND workspace_id=ANY($2::text[]) ORDER BY workspace_id",
      [group, [integrityWorkspace, movedWorkspace]],
    )
    const revisionsAfter = new Map(after.rows.map((row) => [row.workspace_id, Number(row.graph_revision)]))
    expect(revisionsAfter.get(integrityWorkspace)).toBeGreaterThan(revisionsBefore.get(integrityWorkspace) ?? 0)
    expect(revisionsAfter.get(movedWorkspace)).toBeGreaterThan(revisionsBefore.get(movedWorkspace) ?? 0)
  })

  it("uses the scope-first traversal indexes in the production frontier SQL", async () => {
    await pool.query(
      `INSERT INTO graph_structural_nodes(node_id,label,group_id,workspace_id,workspace_scope_state,props)
       SELECT 'plan-node-'||$1||'-'||lpad(series::text,4,'0'),'Project',$2,$3,'workspace_scoped','{}'::jsonb
       FROM generate_series(1,1000) AS series`,
      [suffix, group, workspace],
    )
    await pool.query(
      `INSERT INTO graph_structural_edges
         (from_id,to_id,rel_type,group_id,workspace_id,workspace_scope_state,from_kind,to_kind,endpoint_state)
       SELECT $1,$2,'PLAN_'||lpad(series::text,4,'0'),$3,$4,'workspace_scoped','structural','structural','resolved'
       FROM generate_series(1,1000) AS series`,
      [project, unknown, group, workspace],
    )
    await pool.query("ANALYZE graph_structural_edges")
    await pool.query("ANALYZE graph_structural_nodes")
    const indexCatalog = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND indexname=ANY($1::text[]) ORDER BY indexname`,
      [["graph_structural_edges_scope_from_traversal_idx", "graph_structural_edges_scope_to_traversal_idx"]],
    )
    expect(indexCatalog.rows.map((row) => row.indexname)).toEqual([
      "graph_structural_edges_scope_from_traversal_idx",
      "graph_structural_edges_scope_to_traversal_idx",
    ])
    await pool.query("SET enable_seqscan=off")
    await pool.query("SET enable_bitmapscan=off")
    await pool.query("SET enable_sort=off")
    for (const direction of ["outgoing", "incoming"] as const) {
      const { rows } = await pool.query<Record<string, string>>(
        `EXPLAIN (FORMAT TEXT) ${FOCUSED_SUBGRAPH_FOCUS_EDGE_SQL}`,
        [group, workspace, "structural", direction === "outgoing" ? agent : project, direction, false, 2, [], [],
          null, null, null, null, null, null, 401, 401],
      )
      const plan = rows.map((row) => Object.values(row)[0]).join("\n")
      expect(plan).toContain("graph_structural_edges")
      expect(plan).not.toContain("Seq Scan on graph_structural_edges")
      expect(plan).toContain(`group_id = '${group}'::text`)
      expect(plan).toContain(`workspace_id = '${workspace}'::text`)
      expect(plan).toContain(direction === "outgoing" ? "from_id = walk_1.node_id" : "to_id = walk_1.node_id")
    }

    const startedAt = Date.now()
    const bounded = await service().read(authUser(), {
      kind: "focus", focusNodeKey: `structural:${project}`, direction: "outgoing", depth: 2,
      nodeLimit: 2, edgeLimit: 400,
    })
    expect(bounded).toEqual({
      contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry",
    })
    expect(Date.now() - startedAt).toBeLessThan(FOCUSED_SUBGRAPH_STATEMENT_TIMEOUT_MS)
  })
})
