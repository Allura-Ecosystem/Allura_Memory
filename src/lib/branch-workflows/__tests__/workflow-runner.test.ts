/**
 * Team RAM / Durham branch workflow runner contract tests.
 *
 * Pins the workflow guarantees: sole-writer lane ownership, complete Durham
 * concept manifests, the Munari/Rand review gate (only an approved diff
 * becomes a curator proposal through the promotion adapter), no duplicate
 * status ledger, and explicit lifecycle states in real lanes.
 */

import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { BranchDiff } from "../../branch/promotion-adapter"
import { assertDurhamManifestsComplete, DURHAM_CONCEPTS, type DurhamManifestSet, TEAM_RAM_LANES } from "../lane-config"
import { openLane, reviewLaneEvidence, runLaneWork, SoleWriterViolation, updateLaneStatus } from "../workflow-runner"

const GROUP = "allura-system"
const WORKSPACE = "workspace-a"
const BASE_REVISION = "base-5000-d128-cosine"

const DIFF: BranchDiff = {
  added: [{ id: "8000", content: "branch value", score: 0.9, provenance: "manual", tags: [] }],
  overridden: [
    { id: "42-next", content: "override value", score: 0.9, provenance: "manual", tags: [], supersedes_id: "42" },
  ],
  deleted: ["7"],
}
const EVIDENCE = ["event:41", "evidence-request:00000000-0000-4000-8000-000000000001"]

const ROSTER = [
  "brooks",
  "woz",
  "knuth",
  "pike",
  "fowler",
  "bellard",
  "hightower",
  "jobs",
  "carmack",
  "scout",
  "bahari",
]

interface RegistryRow {
  group_id: string
  workspace_id: string
  branch_id: string
  status: string
  agent_id: string | null
  task_id: string | null
  retention_expires_at: string | null
  diff_snapshot: string | null
  reviewer_ids: string[]
  lane_id: string
}

interface SnapshotRow {
  id: string
  group_id: string
  workspace_id: string
  branch_id: string
  base_revision: string
  diff: BranchDiff
  evidence_refs: string[]
  writer_id: string
  snapshot_hash: string
}

/** In-memory queryable that answers the runner's and adapter's exact SQL shapes. */
function memoryDb() {
  const registry = new Map<string, RegistryRow>()
  const proposals: string[] = []
  const transitions: string[] = []
  const snapshots = new Map<string, SnapshotRow>()
  const sqlLog: string[] = []
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    sqlLog.push(String(sql))
    const text = String(sql)
    if (text.includes("app.open_governed_lane")) {
      const lane = [...TEAM_RAM_LANES, ...DURHAM_CONCEPTS].find((candidate) => candidate.id === String(params[2]))
      if (!lane) return { rows: [] }
      const existing = registry.get(lane.branchId)
      if (!existing) {
        registry.set(lane.branchId, {
          group_id: String(params[0]), workspace_id: String(params[1]), branch_id: lane.branchId,
          status: "active", agent_id: lane.writer, task_id: "taskId" in lane ? (lane.taskId ?? null) : null,
          retention_expires_at: null, diff_snapshot: null, reviewer_ids: [...lane.reviewers], lane_id: lane.id,
        })
      }
      const row = registry.get(lane.branchId)!
      return { rows: [{ lane_id: lane.id, branch_id: lane.branchId, writer_id: row.agent_id,
        reviewer_ids: row.reviewer_ids, status: row.status }] }
    }
    if (text.includes("app.persist_governed_lane_snapshot")) {
      const lane = [...TEAM_RAM_LANES, ...DURHAM_CONCEPTS].find((candidate) => candidate.id === String(params[2]))
      const row = lane ? registry.get(lane.branchId) : undefined
      if (!lane || !row || row.status !== "active") return { rows: [] }
      const snapshot: SnapshotRow = {
        id: `snapshot-${snapshots.size + 1}`,
        group_id: String(params[0]),
        workspace_id: String(params[1]),
        branch_id: lane.branchId,
        base_revision: String(params[3]),
        diff: JSON.parse(String(params[4])) as BranchDiff,
        evidence_refs: JSON.parse(String(params[5])) as string[],
        writer_id: row.agent_id ?? lane.writer,
        snapshot_hash: String(params[6]),
      }
      snapshots.set(snapshot.id, snapshot)
      row.diff_snapshot = JSON.stringify({
        snapshot_id: snapshot.id,
        base_revision: snapshot.base_revision,
        diff: snapshot.diff,
        evidence_refs: snapshot.evidence_refs,
      })
      return {
        rows: [
          { snapshot_id: snapshot.id, snapshot_hash: snapshot.snapshot_hash, base_revision: snapshot.base_revision },
        ],
      }
    }
    if (text.includes("app.transition_governed_lane")) {
      const lane = [...TEAM_RAM_LANES, ...DURHAM_CONCEPTS].find((candidate) => candidate.id === String(params[2]))
      const row = lane ? registry.get(lane.branchId) : undefined
      if (!row) return { rows: [] }
      row.status = String(params[3])
      return { rows: [{ branch_id: row.branch_id, status: row.status }] }
    }
    if (text.includes("app.load_governed_lane_snapshot_for_review") ||
        (text.includes("JOIN governed_lane_authority") && text.includes("snapshot.id=$5"))) {
      const snapshotIndex = text.includes("app.load_governed_lane_snapshot_for_review") ? 3 : 4
      const snapshot = snapshots.get(String(params[snapshotIndex])) ?? snapshots.values().next().value
      const row = snapshot ? registry.get(snapshot.branch_id) : undefined
      return {
        rows:
          snapshot && row
            ? [
                {
                  group_id: snapshot.group_id,
                  workspace_id: snapshot.workspace_id,
                  status: row.status,
                  retention_expires_at: row.retention_expires_at,
                  diff_snapshot: row.diff_snapshot,
                  agent_id: row.agent_id,
                  reviewer_ids: row.reviewer_ids,
                  lane_id: row.lane_id,
                  snapshot_id: snapshot.id,
                  base_revision: snapshot.base_revision,
                  snapshot_diff: snapshot.diff,
                  snapshot_evidence_refs: snapshot.evidence_refs,
                  writer_id: snapshot.writer_id,
                  snapshot_hash: snapshot.snapshot_hash,
                },
              ]
            : [],
      }
    }
    if (text.includes("SELECT") && text.includes("FROM branch_registry")) {
      const snapshot = snapshots.values().next().value as SnapshotRow | undefined
      const snapshotRow = snapshot ? registry.get(snapshot.branch_id) : undefined
      if (text.includes("governed_lane_authority") && snapshot && snapshotRow) {
        return {
          rows: [
            {
              group_id: snapshot.group_id,
              workspace_id: snapshot.workspace_id,
              status: snapshotRow.status,
              retention_expires_at: snapshotRow.retention_expires_at,
              diff_snapshot: snapshotRow.diff_snapshot,
              agent_id: snapshotRow.agent_id,
              reviewer_ids: snapshotRow.reviewer_ids,
              lane_id: snapshotRow.lane_id,
              snapshot_id: snapshot.id,
              base_revision: snapshot.base_revision,
              snapshot_diff: snapshot.diff,
              snapshot_evidence_refs: snapshot.evidence_refs,
              writer_id: snapshot.writer_id,
              snapshot_hash: snapshot.snapshot_hash,
            },
          ],
        }
      }
      const row = registry.get(String(params[2]))
      if (!row) return { rows: [] }
      return {
        rows: [
          {
            group_id: row.group_id,
            workspace_id: row.workspace_id,
            branch_id: row.branch_id,
            status: row.status,
            retention_expires_at: row.retention_expires_at,
            reviewer_ids: row.reviewer_ids,
            lane_id: row.lane_id,
            diff_snapshot: row.diff_snapshot,
          },
        ],
      }
    }
    if (text.includes("INSERT INTO branch_registry") && text.includes("ON CONFLICT")) {
      const branchId = String(params[2])
      const status = String(params[3])
      registry.set(branchId, {
        group_id: String(params[0]),
        workspace_id: String(params[1]),
        branch_id: branchId,
        status,
        agent_id: null,
        task_id: null,
        retention_expires_at: String(params[6]),
        diff_snapshot: String(params[5]),
        reviewer_ids: [],
        lane_id: "",
      })
      return { rows: [{ branch_id: branchId, status }] }
    }
    if (text.includes("INSERT INTO branch_registry")) {
      const branchId = String(params[2])
      const taskId = String(params[3])
      const agentId = String(params[4])
      const lane = [...TEAM_RAM_LANES, ...DURHAM_CONCEPTS].find((candidate) => candidate.branchId === branchId)
      registry.set(branchId, {
        group_id: String(params[0]),
        workspace_id: String(params[1]),
        branch_id: branchId,
        status: "active",
        agent_id: agentId,
        task_id: taskId,
        retention_expires_at: null,
        diff_snapshot: null,
        reviewer_ids: lane ? [...lane.reviewers] : [],
        lane_id: lane?.id ?? "",
      })
      return { rows: [{ branch_id: branchId, status: "active" }] }
    }
    if (text.includes("INSERT INTO promotion_proposals")) {
      proposals.push(String(params[2]))
      return {
        rows: [
          {
            id: `proposal-${proposals.length}`,
            group_id: GROUP,
            entity_id: String(params[2]),
            status: "pending",
            proposed_by: String(params[7]),
          },
        ],
      }
    }
    if (text.includes("INSERT INTO events")) return { rows: [{ id: "event-1" }] }
    if (text.includes("INSERT INTO canonical_proposals"))
      return { rows: [{ id: "canonical-proposal-1", status: "pending" }] }
    if (text.includes("INSERT INTO approval_transitions")) {
      transitions.push(String(params[2]))
      return { rows: [{ id: `transition-${transitions.length}` }] }
    }
    return { rows: [] }
  })
  return { query, registry, proposals, transitions, snapshots, sqlLog }
}

describe("Team RAM lane config — sole-writer ownership", () => {
  it("defines one branch per story, agent, and review lane", () => {
    const kinds = new Set(TEAM_RAM_LANES.map((lane) => lane.kind))
    expect(kinds).toEqual(new Set(["story", "agent", "review"]))
    expect(TEAM_RAM_LANES.filter((lane) => lane.kind === "story").length).toBeGreaterThanOrEqual(1)
    expect(TEAM_RAM_LANES.filter((lane) => lane.kind === "agent").length).toBeGreaterThanOrEqual(ROSTER.length)
    expect(TEAM_RAM_LANES.filter((lane) => lane.kind === "review").length).toBeGreaterThanOrEqual(3)
  })

  it("gives every lane exactly one writer and covers the full roster", () => {
    for (const lane of TEAM_RAM_LANES) {
      expect(typeof lane.writer).toBe("string")
      expect(lane.writer.trim().length).toBeGreaterThan(0)
    }
    const writers = new Set(TEAM_RAM_LANES.map((lane) => lane.writer))
    for (const agent of ROSTER) {
      expect(writers.has(agent)).toBe(true)
    }
    for (const reviewer of ["pike", "fowler", "munari-rand"]) {
      expect(writers.has(reviewer)).toBe(true)
    }
  })

  it("records sole-writer ownership when a lane is opened", async () => {
    const db = memoryDb()
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    const session = await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    expect(session.writer_id).toBe("woz")
    expect(db.registry.get(lane.branchId)?.agent_id).toBe("woz")
    expect(db.registry.get(lane.branchId)?.status).toBe("active")
  })

  it("rejects a second writer on the same lane", async () => {
    const db = memoryDb()
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    await expect(
      openLane(
        lane,
        { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "bellard" },
        db as never
      )
    ).rejects.toThrow(SoleWriterViolation)
  })

  it("rejects lane work from anyone but the sole writer", async () => {
    const db = memoryDb()
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    const session = await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    await expect(runLaneWork(session, { diff: DIFF, evidence_refs: EVIDENCE }, "bellard")).rejects.toThrow(
      /sole writer/i
    )
  })
})

describe("Durham concept lanes — complete manifests", () => {
  it("defines conservative, expressive, and crop-resilient concept branches", () => {
    const concepts = DURHAM_CONCEPTS.map((concept) => concept.concept).sort()
    expect(concepts).toEqual(["conservative", "crop-resilient", "expressive"])
  })

  it("carries reference, prompt, token, asset, accessibility, and provenance manifests per concept", () => {
    const keys = ["reference", "prompt", "token", "asset", "accessibility", "provenance"] as const
    for (const concept of DURHAM_CONCEPTS) {
      for (const key of keys) {
        expect(concept.manifests[key]).toBeTruthy()
        expect(concept.manifests[key].trim().length).toBeGreaterThan(0)
      }
    }
  })

  it("fails closed when a manifest is missing or empty", () => {
    const broken: DurhamManifestSet = {
      reference: "",
      prompt: "p",
      token: "t",
      asset: "a",
      accessibility: "a",
      provenance: "p",
    }
    expect(() => assertDurhamManifestsComplete(broken)).toThrow(/reference/i)
    const missing = { prompt: "p", token: "t", asset: "a", accessibility: "a", provenance: "p" } as DurhamManifestSet
    expect(() => assertDurhamManifestsComplete(missing)).toThrow(/manifest/i)
  })

  it("opens a Durham concept lane only when its manifests are complete", async () => {
    const db = memoryDb()
    const concept = DURHAM_CONCEPTS[0]
    const session = await openLane(
      concept,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "munari-rand" },
      db as never
    )
    expect(session.branch_id).toBe(concept.branchId)
  })

  it("attaches the concept manifests to the lane's branch evidence", async () => {
    const db = memoryDb()
    const concept = DURHAM_CONCEPTS[0]
    const session = await openLane(
      concept,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "munari-rand" },
      db as never
    )
    const worked = await runLaneWork(session, { diff: DIFF, evidence_refs: EVIDENCE }, "munari-rand")
    expect(worked.evidence[0].manifest).toEqual(concept.manifests)
  })
})

describe("Munari/Rand review gate — only an approved diff becomes a proposal", () => {
  async function reviewedSession(db: ReturnType<typeof memoryDb>) {
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    const session = await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    return runLaneWork(session, { diff: DIFF, evidence_refs: EVIDENCE }, "woz", db as never)
  }

  it("routes an approved diff through the promotion adapter into a curator proposal", async () => {
    const db = memoryDb()
    const session = await reviewedSession(db)
    const result = await reviewLaneEvidence(
      session,
      { verdict: "approved", reviewer: "pike", reason: "concept evidence complete" },
      db as never
    )
    expect(result.approved).toBe(true)
    expect(result.proposal).toBeTruthy()
    expect(result.proposal?.status).toBe("pending")
    expect(db.proposals).toHaveLength(1)
    expect(db.registry.get(session.branch_id)?.status).toBe("active")
  })

  it("never creates a proposal for an unapproved diff", async () => {
    const db = memoryDb()
    const session = await reviewedSession(db)
    const result = await reviewLaneEvidence(
      session,
      { verdict: "rejected", reviewer: "munari-rand", reason: "reference drift" },
      db as never
    )
    expect(result.approved).toBe(false)
    expect(result.proposal).toBeUndefined()
    expect(db.proposals).toHaveLength(0)
    expect(db.registry.get(session.branch_id)?.status).toBe("rejected")
  })

  it("quarantines a lane whose evidence fails review", async () => {
    const db = memoryDb()
    const session = await reviewedSession(db)
    const result = await reviewLaneEvidence(
      session,
      { verdict: "quarantined", reviewer: "pike", reason: "poisoned evidence" },
      db as never
    )
    expect(result.approved).toBe(false)
    expect(db.proposals).toHaveLength(0)
    expect(db.registry.get(session.branch_id)?.status).toBe("quarantined")
  })

  it("fails closed when review runs on a lane with no evidence", async () => {
    const db = memoryDb()
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    const session = await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    await expect(
      reviewLaneEvidence(session, { verdict: "approved", reviewer: "munari-rand", reason: "x" }, db as never)
    ).rejects.toThrow(/evidence/i)
  })

  it("routes promotion through the promotion adapter import", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/branch-workflows/workflow-runner.ts"), "utf8")
    expect(source).toContain("createPromotionProposal")
    expect(source).toContain("../branch/promotion-adapter")
  })
})

describe("no duplicate workflow-status ledger", () => {
  it("creates no new table from the runner or lane config", () => {
    for (const file of ["src/lib/branch-workflows/workflow-runner.ts", "src/lib/branch-workflows/lane-config.ts"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
      expect(source).not.toContain("CREATE TABLE")
      expect(source).not.toContain("workflow_status")
      expect(source).not.toContain("lane_status")
    }
  })

  it("uses the governed snapshot writer and canonical proposal ledgers", async () => {
    const db = memoryDb()
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    const session = await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    const worked = await runLaneWork(session, { diff: DIFF, evidence_refs: EVIDENCE }, "woz", db as never)
    await reviewLaneEvidence(worked, { verdict: "approved", reviewer: "pike", reason: "ok" }, db as never)
    const tables = new Set(
      db.sqlLog
        .map((sql) => {
          const match = sql.match(/INSERT INTO (\w+)/)
          return match ? match[1] : null
        })
        .filter((name): name is string => name !== null)
    )
    expect([...tables].sort()).toEqual(["approval_transitions", "canonical_proposals", "events", "promotion_proposals"])
    expect(db.sqlLog.some((sql) => sql.includes("app.open_governed_lane"))).toBe(true)
    expect(db.sqlLog.some((sql) => sql.includes("app.persist_governed_lane_snapshot"))).toBe(true)
  })

  it("reuses the branch registry status vocabulary from the promotion adapter", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/branch-workflows/workflow-runner.ts"), "utf8")
    expect(source).toContain("BranchRegistryStatus")
    expect(source).toContain("branch_registry")
  })
})

describe("explicit lifecycle states in real lanes", () => {
  it("marks a lane degraded, expired, rejected, quarantined, or rolled back and reflects it in the registry", async () => {
    for (const status of ["degraded", "expired", "rejected", "quarantined", "rolled_back"] as const) {
      const db = memoryDb()
      const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
      if (!lane) throw new Error("agent-lane-woz missing from lane config")
      const session = await openLane(
        lane,
        { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
        db as never
      )
      const worked = await runLaneWork(session, { diff: DIFF, evidence_refs: EVIDENCE }, "woz", db as never)
      await updateLaneStatus(
        worked,
        status,
        { reason: `lane ${status}`, retention_expires_at: "2027-01-01T00:00:00.000Z", actor_id: "brooks" },
        db as never
      )
      expect(db.registry.get(lane.branchId)?.status).toBe(status)
    }
  })

  it("keeps a quarantined lane quarantined and refuses to reopen it", async () => {
    const db = memoryDb()
    const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === "agent-lane-woz")
    if (!lane) throw new Error("agent-lane-woz missing from lane config")
    const session = await openLane(
      lane,
      { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
      db as never
    )
    const worked = await runLaneWork(session, { diff: DIFF, evidence_refs: EVIDENCE }, "woz", db as never)
    await reviewLaneEvidence(worked, { verdict: "quarantined", reviewer: "pike", reason: "poisoned" }, db as never)
    expect(db.registry.get(lane.branchId)?.status).toBe("quarantined")
    await expect(
      openLane(
        lane,
        { group_id: GROUP, workspace_id: WORKSPACE, base_revision: BASE_REVISION, actor_id: "woz" },
        db as never
      )
    ).rejects.toThrow(/quarantined/i)
  })
})
