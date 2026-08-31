import { randomUUID } from "node:crypto"

import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  branchSnapshotHash,
  createPromotionProposal,
  type BranchDiff,
} from "@/lib/branch/promotion-adapter"

const GROUP = "allura-lane-review-boundary"
const WORKSPACE = "ws-lane-review-boundary"
const LANE = "agent-lane-woz"
const BRANCH = "ram/agent/woz"
const BASE = "review-boundary-base"
const REVIEWER = "pike"
const WRITER = "woz"
const DIFF: BranchDiff = {
  added: [{ id: "review-boundary-memory", content: "locked evidence", score: 0.9, provenance: "manual", tags: [] }],
  overridden: [],
  deleted: [],
}
const EVIDENCE = ["review-boundary:e2e"]

function makePool(user: string, password: string, applicationName?: string): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user,
    password,
    max: 4,
    application_name: applicationName,
  })
}

async function beginScope(client: PoolClient, principal: string, group = GROUP, workspace = WORKSPACE): Promise<void> {
  await client.query("BEGIN")
  await client.query("SELECT set_config('app.current_group_id',$1,true)", [group])
  await client.query("SELECT set_config('app.current_workspace_id',$1,true)", [workspace])
  await client.query("SELECT set_config('app.current_principal',$1,true)", [principal])
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined)
  client.release()
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_APP_PASSWORD
  ? describe
  : describe.skip

describeLive("migration 57 governed lane review boundary", () => {
  const owner = makePool(process.env.POSTGRES_USER ?? "allura", process.env.POSTGRES_PASSWORD ?? "")
  const app = makePool(process.env.POSTGRES_APP_USER ?? "allura_app", process.env.POSTGRES_APP_PASSWORD ?? "")
  let snapshotId = ""

  beforeAll(async () => {
    await owner.query(
      "INSERT INTO workspaces(workspace_id,group_id,name) VALUES ($1,$2,'Lane review boundary') ON CONFLICT DO NOTHING",
      [WORKSPACE, GROUP],
    )
    const writer = await app.connect()
    try {
      await beginScope(writer, WRITER)
      await writer.query("SELECT * FROM app.open_governed_lane($1,$2,$3,$4)", [GROUP, WORKSPACE, LANE, BASE])
      const hash = branchSnapshotHash({
        group_id: GROUP,
        workspace_id: WORKSPACE,
        branch_id: BRANCH,
        base_revision: BASE,
        diff: DIFF,
        evidence_refs: EVIDENCE,
        writer_id: WRITER,
      })
      const snapshot = await writer.query<{ id: string }>(
        "SELECT id FROM app.persist_governed_lane_snapshot($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)",
        [GROUP, WORKSPACE, LANE, BASE, JSON.stringify(DIFF), JSON.stringify(EVIDENCE), hash],
      )
      snapshotId = snapshot.rows[0]!.id
      await writer.query("COMMIT")
    } finally {
      writer.release()
    }
  })

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()])
  })

  async function load(client: PoolClient, overrides: {
    group?: string
    workspace?: string
    lane?: string
    branch?: string
    snapshot?: string
  } = {}) {
    return client.query(
      "SELECT * FROM app.load_governed_lane_snapshot_for_review($1,$2,$3,$4,$5)",
      [overrides.group ?? GROUP, overrides.workspace ?? WORKSPACE, overrides.lane ?? LANE,
        overrides.branch ?? BRANCH, overrides.snapshot ?? snapshotId],
    )
  }

  it("grants only app execution and returns branch/writer-bound authority to an authorized reviewer", async () => {
    const grants = await owner.query<{ app_execute: boolean; public_execute: boolean }>(
      `SELECT
         has_function_privilege('allura_app','app.load_governed_lane_snapshot_for_review(text,text,text,text,uuid)','EXECUTE') AS app_execute,
         has_function_privilege('public','app.load_governed_lane_snapshot_for_review(text,text,text,text,uuid)','EXECUTE') AS public_execute`,
    )
    expect(grants.rows).toEqual([{ app_execute: true, public_execute: false }])

    const client = await app.connect()
    try {
      await beginScope(client, REVIEWER)
      const result = await load(client)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toMatchObject({ agent_id: WRITER, writer_id: WRITER, snapshot_id: snapshotId })
    } finally {
      await rollback(client)
    }
  })

  it.each([
    ["scope mismatch", { principal: REVIEWER, group: "allura-other", workspace: WORKSPACE }, { group: GROUP }],
    ["wrong branch", { principal: REVIEWER, group: GROUP, workspace: WORKSPACE }, { branch: "ram/agent/brooks" }],
    ["writer exclusion", { principal: WRITER, group: GROUP, workspace: WORKSPACE }, {}],
    ["reviewer authorization", { principal: "jobs", group: GROUP, workspace: WORKSPACE }, {}],
    ["missing snapshot", { principal: REVIEWER, group: GROUP, workspace: WORKSPACE }, { snapshot: randomUUID() }],
  ])("rejects %s", async (_label, scope, loader) => {
    const client = await app.connect()
    try {
      await beginScope(client, scope.principal, scope.group, scope.workspace)
      await expect(load(client, loader)).rejects.toThrow(/scope mismatch|missing|unauthorized/i)
    } finally {
      await rollback(client)
    }
  })

  it("excludes a snapshot whose writer no longer matches repository authority", async () => {
    await owner.query("ALTER TABLE branch_snapshots DISABLE TRIGGER ALL")
    await owner.query("UPDATE branch_snapshots SET writer_id='brooks' WHERE id=$1", [snapshotId])
    const client = await app.connect()
    try {
      await beginScope(client, REVIEWER)
      await expect(load(client)).rejects.toThrow(/missing|unauthorized/i)
    } finally {
      await rollback(client)
      await owner.query("UPDATE branch_snapshots SET writer_id=$1 WHERE id=$2", [WRITER, snapshotId])
      await owner.query("ALTER TABLE branch_snapshots ENABLE TRIGGER ALL")
    }
  })

  it("serializes review loading with lifecycle transition and blocks a proposal after transition wins", async () => {
    const reviewer = await app.connect()
    const lifecycle = await app.connect()
    try {
      await beginScope(reviewer, REVIEWER)
      await load(reviewer)

      await beginScope(lifecycle, REVIEWER)
      const lifecyclePid = (await lifecycle.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid
      const transition = lifecycle.query(
        "SELECT * FROM app.transition_governed_lane($1,$2,$3,'quarantined',$4,$5::jsonb,NOW()+INTERVAL '1 day')",
        [GROUP, WORKSPACE, LANE, "concurrency proof", JSON.stringify({ snapshot_id: snapshotId, diff: DIFF })],
      )

      const deadline = Date.now() + 5_000
      let waiting = false
      while (!waiting && Date.now() < deadline) {
        const locks = await owner.query<{ waiting: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_stat_activity
             WHERE pid=$1 AND wait_event_type='Lock'
           ) AS waiting`,
          [lifecyclePid],
        )
        waiting = locks.rows[0]?.waiting === true
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20))
      }
      expect(waiting).toBe(true)

      await reviewer.query("COMMIT")
      await expect(transition).resolves.toMatchObject({ rows: [{ branch_id: BRANCH, status: "quarantined" }] })
      await lifecycle.query("COMMIT")

      await beginScope(reviewer, REVIEWER)
      await expect(createPromotionProposal({
        group_id: GROUP,
        workspace_id: WORKSPACE,
        lane_id: LANE,
        branch_id: BRANCH,
        base_revision: BASE,
        snapshot_id: snapshotId,
        diff: DIFF,
        evidence_refs: EVIDENCE,
        actor_id: REVIEWER,
      }, reviewer as never)).rejects.toThrow(/quarantined|gate/i)
    } finally {
      await rollback(reviewer)
      await rollback(lifecycle)
    }
  })
})
