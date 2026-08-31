/**
 * Governed promotion adapter contract tests.
 *
 * The adapter converts a selected branch diff into an Allura curator proposal
 * (promotion_proposals + approval_transitions) and never touches canonical
 * memory. These tests pin the structural guarantees: field preservation,
 * no-direct-mutation, no self-approval, immutable server-issued receipts,
 * quarantine, reproducible rollback, and the epic gate enforcement (AC-4):
 * every promotion runs evaluateGate before any write, and a failing gate
 * blocks the proposal.
 */

import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type BranchDiff,
  branchSnapshotHash,
  buildRollbackPlan,
  createPromotionProposal,
  issuePromotionReceipt,
  type PromotionProposalInput,
  quarantineBranch,
} from "../promotion-adapter"
const GROUP = "allura-system"
const WORKSPACE = "workspace-a"
const BRANCH = "branch-b1"
const BASE_REVISION = "base-5000-d128-cosine"
const ACTOR = "agent-b1"

const DIFF: BranchDiff = {
  added: [
    { id: "8000", content: "branch value", score: 0.9, provenance: "manual", tags: [] },
    { id: "8001", content: "branch value", score: 0.9, provenance: "manual", tags: [] },
    { id: "8002", content: "branch value", score: 0.9, provenance: "manual", tags: [] },
  ],
  overridden: [
    { id: "42-next", content: "override value", score: 0.9, provenance: "manual", tags: [], supersedes_id: "42" },
  ],
  deleted: ["7"],
}

const EVIDENCE = ["event:41", "evidence-request:00000000-0000-4000-8000-000000000001"]

function input(overrides: Partial<PromotionProposalInput> = {}): PromotionProposalInput {
  return {
    group_id: GROUP,
    workspace_id: WORKSPACE,
    lane_id: "agent-lane-brooks",
    branch_id: BRANCH,
    base_revision: BASE_REVISION,
    snapshot_id: "snapshot-b1",
    diff: DIFF,
    evidence_refs: EVIDENCE,
    actor_id: ACTOR,
    ...overrides,
  }
}

/** A registry row that satisfies every gate check (active, same scope, full recorded snapshot). */
function passingRegistryRow(): Record<string, unknown> {
  const snapshotHash = branchSnapshotHash({
    group_id: GROUP,
    workspace_id: WORKSPACE,
    branch_id: BRANCH,
    base_revision: BASE_REVISION,
    diff: DIFF,
    evidence_refs: EVIDENCE,
    writer_id: "writer-b1",
  })
  return {
    group_id: GROUP,
    workspace_id: WORKSPACE,
    status: "active",
    agent_id: "writer-b1",
    reviewer_ids: [ACTOR],
    retention_expires_at: null,
    lane_id: "agent-lane-brooks",
    snapshot_id: "snapshot-b1",
    base_revision: BASE_REVISION,
    snapshot_diff: DIFF,
    snapshot_evidence_refs: EVIDENCE,
    writer_id: "writer-b1",
    snapshot_hash: snapshotHash,
    diff_snapshot: JSON.stringify({
      snapshot_id: "snapshot-b1",
      base_revision: BASE_REVISION,
      diff: DIFF,
      evidence_refs: EVIDENCE,
    }),
  }
}

interface DbOptions {
  registryRow?: Record<string, unknown> | null
  receipts?: boolean
  branchCount?: number
  failOnTransition?: boolean
}

/** In-memory queryable that answers the adapter's exact SQL shapes. */
function db(options: DbOptions = {}) {
  const tx: string[] = []
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql)
    const trimmed = text.trim()
    if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
      tx.push(trimmed)
      return { rows: [] }
    }
    if (text.includes("count(*)") && text.includes("FROM branch_registry")) {
      return { rows: [{ count: options.branchCount ?? 0 }] }
    }
    if (text.includes("FROM promotion_receipts")) {
      if (text.includes("WHERE id=")) {
        return {
          rows: [
            {
              id: "receipt-1",
              group_id: GROUP,
              workspace_id: WORKSPACE,
              proposal_id: "proposal-1",
              branch_id: BRANCH,
              base_revision: BASE_REVISION,
              diff: DIFF,
              evidence_refs: EVIDENCE,
              actor_id: ACTOR,
              trace_id: "promo-proposal-1",
              issued_at: "2026-08-29T00:00:00.000Z",
            },
          ],
        }
      }
      return { rows: options.receipts ? [{ found: 1 }] : [] }
    }
    if (text.includes("app.issue_governed_promotion_receipt")) {
      return { rows: [{ id: "receipt-1" }] }
    }
    if (text.includes("app.transition_governed_lane")) {
      return { rows: [{ branch_id: BRANCH, status: String(_params?.[3] ?? "quarantined") }] }
    }
    if (text.includes("INSERT INTO events")) return { rows: [{ id: "event-1" }] }
    if (text.includes("INSERT INTO canonical_proposals"))
      return { rows: [{ id: "canonical-proposal-1", status: "pending" }] }
    if (text.includes("FROM branch_registry")) {
      const row = options.registryRow === undefined ? passingRegistryRow() : options.registryRow
      return { rows: row ? [row] : [] }
    }
    if (text.includes("INSERT INTO promotion_proposals")) {
      return {
        rows: [
          {
            id: "proposal-1",
            group_id: GROUP,
            entity_id: BRANCH,
            status: "pending",
            proposed_by: ACTOR,
          },
        ],
      }
    }
    if (text.includes("INSERT INTO approval_transitions")) {
      if (options.failOnTransition) throw new Error("transition insert failed")
      return { rows: [{ id: "transition-1" }] }
    }
    if (text.includes("INSERT INTO promotion_receipts")) {
      return {
        rows: [
          {
            id: "receipt-1",
            group_id: GROUP,
            workspace_id: WORKSPACE,
            proposal_id: "proposal-1",
            branch_id: BRANCH,
            base_revision: BASE_REVISION,
            diff: DIFF,
            evidence_refs: EVIDENCE,
            actor_id: ACTOR,
            trace_id: "promo-proposal-1",
            issued_at: "2026-08-29T00:00:00.000Z",
          },
        ],
      }
    }
    if (text.includes("INSERT INTO branch_registry")) {
      const params = _params as unknown[]
      return { rows: [{ branch_id: String(params[2]), status: String(params[3]) }] }
    }
    return { rows: [] }
  })
  const begin = vi.fn(async () => {
    tx.push("BEGIN")
  })
  const commit = vi.fn(async () => {
    tx.push("COMMIT")
  })
  const rollback = vi.fn(async () => {
    tx.push("ROLLBACK")
  })
  return { query, begin, commit, rollback, tx }
}

function insertCall(database: ReturnType<typeof db>, marker: string): [string, unknown[]] {
  const call = database.query.mock.calls.find(([sql]) => String(sql).includes(marker))
  if (!call) throw new Error(`no query matched ${marker}`)
  return call as [string, unknown[]]
}

function proposalInserted(database: ReturnType<typeof db>): boolean {
  return database.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO promotion_proposals"))
}

describe("promotion adapter — proposal conversion", () => {
  it("converts a branch diff into a pending curator proposal preserving every field", async () => {
    const database = db()
    const result = await createPromotionProposal(input(), database as never)

    expect(result).toMatchObject({
      group_id: GROUP,
      workspace_id: WORKSPACE,
      branch_id: BRANCH,
      base_revision: BASE_REVISION,
      diff: DIFF,
      evidence_refs: EVIDENCE,
      actor_id: ACTOR,
      status: "pending",
    })
    expect(result.proposal_id).toBe("proposal-1")
    expect(result.trace_id).toMatch(/^promo-/)

    const [proposalSql, proposalParams] = insertCall(database, "INSERT INTO promotion_proposals")
    expect(proposalSql).toContain("entity_type")
    expect(proposalSql).toContain("status")
    expect(proposalParams).toContain("knowledge")
    expect(proposalParams).toContain(BRANCH)
    expect(proposalParams).toContain("pending")
    expect(proposalParams).toContain(ACTOR)
    const metadata = JSON.parse(
      String(proposalParams.find((p) => typeof p === "string" && p.includes("base_revision")))
    )
    expect(metadata).toMatchObject({
      branch_id: BRANCH,
      base_revision: BASE_REVISION,
      diff: DIFF,
      actor_id: ACTOR,
    })
    expect(metadata.trace_id).toMatch(/^promo-/)
    const evidence = JSON.parse(String(proposalParams.find((p) => typeof p === "string" && p.includes("event:41"))))
    expect(evidence).toEqual(EVIDENCE)

    const [transitionSql, transitionParams] = insertCall(database, "INSERT INTO approval_transitions")
    expect(transitionSql).toContain("from_state")
    expect(transitionSql).toContain("to_state")
    expect(transitionParams).toContain("draft")
    expect(transitionParams).toContain("pending")
    expect(transitionParams).toContain(ACTOR)
    expect(transitionParams).toContain("agent")
  })

  it("fails closed on invalid or incomplete input", async () => {
    const database = db()
    await expect(createPromotionProposal(input({ group_id: "legacy-system" }), database as never)).rejects.toThrow(
      /group_id/i
    )
    await expect(createPromotionProposal(input({ workspace_id: "" }), database as never)).rejects.toThrow(/workspace/i)
    await expect(createPromotionProposal(input({ branch_id: "" }), database as never)).rejects.toThrow(/branch/i)
    await expect(createPromotionProposal(input({ base_revision: "" }), database as never)).rejects.toThrow(
      /base revision/i
    )
    await expect(
      createPromotionProposal(
        input({ diff: { added: [], overridden: [], deleted: [] } as BranchDiff }),
        database as never
      )
    ).rejects.toThrow(/diff/i)
    await expect(
      createPromotionProposal(input({ evidence_refs: "not-an-array" as never }), database as never)
    ).rejects.toThrow(/evidence/i)
    await expect(createPromotionProposal(input({ actor_id: "" }), database as never)).rejects.toThrow(/actor/i)
  })
})

describe("promotion adapter — epic gate enforcement (AC-4)", () => {
  it("blocks a proposal for a quarantined branch before any INSERT", async () => {
    const database = db({ registryRow: { ...passingRegistryRow(), status: "quarantined" } })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|quarantined|poisoning/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("blocks a proposal for a rejected branch before any INSERT", async () => {
    const database = db({ registryRow: { ...passingRegistryRow(), status: "rejected" } })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|rejected|poisoning/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("blocks a proposal whose base owner is a different tenant", async () => {
    const database = db({ registryRow: { ...passingRegistryRow(), group_id: "allura-other" } })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|isolation|tenant/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("blocks a replayed diff (existing promotion receipt) before any INSERT", async () => {
    const database = db({ receipts: true })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|replay/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("blocks an expired branch before any INSERT", async () => {
    const database = db({ registryRow: { ...passingRegistryRow(), status: "expired" } })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|expir/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("fails closed on an unparseable retention_expires_at", async () => {
    const database = db({ registryRow: { ...passingRegistryRow(), retention_expires_at: "not-a-date" } })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|expir/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("fails closed when the branch is not registered at all", async () => {
    const database = db({ registryRow: null })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/gate|not registered|registry/i)
    expect(proposalInserted(database)).toBe(false)
  })

  it("passes a valid active branch and inserts the proposal atomically", async () => {
    const database = db()
    const result = await createPromotionProposal(input(), database as never)
    expect(result.proposal_id).toBe("proposal-1")
    expect(database.tx).toEqual(["BEGIN", "COMMIT"])
    expect(proposalInserted(database)).toBe(true)
  })

  it("rolls back the transaction when the transition insert fails", async () => {
    const database = db({ failOnTransition: true })
    await expect(createPromotionProposal(input(), database as never)).rejects.toThrow(/transition/i)
    expect(database.tx).toEqual(["BEGIN", "ROLLBACK"])
    expect(database.tx).not.toContain("COMMIT")
  })
})

describe("promotion adapter — no direct canonical mutation", () => {
  it("imports no memory-write module and never references canonical memory tables", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/branch/promotion-adapter.ts"), "utf8")

    const forbiddenImports = [
      "@/lib/memory/",
      "@/mcp/canonical-tools",
      "@/lib/graph-adapter",
      "@/control-plane/syscalls",
      "@/lib/neo4j",
    ]
    for (const prefix of forbiddenImports) {
      expect(source).not.toContain(prefix)
    }

    // Canonical semantic stores are the sole authority; the promotion path
    // must never name them, let alone write them.
    expect(source).not.toContain("allura_memories")
    expect(source).not.toContain("graph_memories")
  })

  it("writes only proposal, transition, receipt, and registry rows", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/branch/promotion-adapter.ts"), "utf8")
    for (const table of ["promotion_proposals", "approval_transitions", "promotion_receipts", "branch_registry"]) {
      expect(source).toContain(table)
    }
  })
})

describe("promotion adapter — no self-approval", () => {
  it("starts pending and contains no approval path of its own", async () => {
    const database = db()
    const result = await createPromotionProposal(input(), database as never)
    expect(result.status).toBe("pending")

    const source = readFileSync(join(process.cwd(), "src/lib/branch/promotion-adapter.ts"), "utf8")
    // The adapter is a mechanism, not a gate: the literal approved status is
    // reserved for the curator flow and must never appear here.
    expect(source).not.toContain("'approved'")
    expect(source).not.toContain("'rejected'")
  })
})

describe("promotion adapter — immutable server-issued receipt", () => {
  it("issues a receipt with a trace id on accepted promotion, preserving the diff", async () => {
    const database = db()
    const receipt = await issuePromotionReceipt(
      {
        group_id: GROUP,
        workspace_id: WORKSPACE,
        proposal_id: "proposal-1",
        branch_id: BRANCH,
        base_revision: BASE_REVISION,
        diff: DIFF,
        evidence_refs: EVIDENCE,
        actor_id: ACTOR,
        trace_id: "promo-proposal-1",
      },
      database as never
    )

    expect(receipt).toMatchObject({
      id: "receipt-1",
      group_id: GROUP,
      workspace_id: WORKSPACE,
      proposal_id: "proposal-1",
      branch_id: BRANCH,
      base_revision: BASE_REVISION,
      diff: DIFF,
      evidence_refs: EVIDENCE,
      actor_id: ACTOR,
      trace_id: "promo-proposal-1",
    })
    expect(receipt.issued_at).toBeTruthy()

    const [sql, params] = insertCall(database, "app.issue_governed_promotion_receipt")
    expect(sql).toContain("app.issue_governed_promotion_receipt")
    expect(params).toContain("proposal-1")
    expect(params).toContain(ACTOR)
    expect(database.query.mock.calls.some(([query]) => String(query).includes("INSERT INTO promotion_receipts"))).toBe(
      false
    )
  })

  it("fails closed when the receipt trace id is missing", async () => {
    const database = db()
    await expect(
      issuePromotionReceipt(
        {
          group_id: GROUP,
          workspace_id: WORKSPACE,
          proposal_id: "proposal-1",
          branch_id: BRANCH,
          base_revision: BASE_REVISION,
          diff: DIFF,
          evidence_refs: EVIDENCE,
          actor_id: ACTOR,
          trace_id: "",
        },
        database as never
      )
    ).rejects.toThrow(/trace/i)
  })
})

describe("promotion adapter — quarantine and reproducible rollback", () => {
  it("quarantines a rejected or poisoned branch and preserves the diff for replay", async () => {
    const database = db()
    const result = await quarantineBranch(
      {
        group_id: GROUP,
        workspace_id: WORKSPACE,
        lane_id: "agent-lane-brooks",
        branch_id: BRANCH,
        base_revision: BASE_REVISION,
        diff: DIFF,
        status: "quarantined",
        reason: "poisoned after review",
        actor_id: ACTOR,
        retention_expires_at: "2027-01-01T00:00:00.000Z",
      },
      database as never
    )

    expect(result).toMatchObject({ branch_id: BRANCH, status: "quarantined" })

    const [sql, params] = insertCall(database, "app.transition_governed_lane")
    expect(sql).toContain("app.transition_governed_lane")
    expect(params).toContain("quarantined")
    const snapshot = JSON.parse(String(params.find((p) => typeof p === "string" && p.includes("base_revision"))))
    expect(snapshot).toEqual({ base_revision: BASE_REVISION, diff: DIFF })
  })

  it("fails closed when a non-active status lacks a retention deadline", async () => {
    for (const status of ["degraded", "expired", "rejected", "quarantined", "rolled_back"] as const) {
      const database = db()
      await expect(
        quarantineBranch(
          {
            group_id: GROUP,
            workspace_id: WORKSPACE,
            lane_id: "agent-lane-brooks",
            branch_id: BRANCH,
            base_revision: BASE_REVISION,
            diff: DIFF,
            status,
            reason: "frozen state",
            actor_id: ACTOR,
          },
          database as never
        )
      ).rejects.toThrow(/retention/i)
    }
  })

  it("accepts a non-active status with a retention deadline", async () => {
    const database = db()
    const result = await quarantineBranch(
      {
        group_id: GROUP,
        workspace_id: WORKSPACE,
        lane_id: "agent-lane-brooks",
        branch_id: BRANCH,
        base_revision: BASE_REVISION,
        diff: DIFF,
        status: "rejected",
        reason: "reference drift",
        actor_id: ACTOR,
        retention_expires_at: "2027-01-01T00:00:00.000Z",
      },
      database as never
    )
    expect(result).toMatchObject({ branch_id: BRANCH, status: "rejected" })
  })

  it("allows an active status without a retention deadline", async () => {
    const database = db()
    const result = await quarantineBranch(
      {
        group_id: GROUP,
        workspace_id: WORKSPACE,
        lane_id: "agent-lane-brooks",
        branch_id: BRANCH,
        base_revision: BASE_REVISION,
        diff: DIFF,
        status: "active",
        reason: "reopen lane",
        actor_id: ACTOR,
      },
      database as never
    )
    expect(result).toMatchObject({ branch_id: BRANCH, status: "active" })
  })

  it("builds a reproducible rollback plan from the preserved diff", () => {
    const plan = buildRollbackPlan(input())

    expect(plan.reproducible).toBe(true)
    expect(plan.branch_id).toBe(BRANCH)
    expect(plan.base_revision).toBe(BASE_REVISION)
    expect(plan.diff).toEqual(DIFF)
    expect(plan.replay_steps).toContain("replay add 8000")
    expect(plan.replay_steps).toContain("replay override 42-next supersedes 42")
    expect(plan.replay_steps).toContain("replay tombstone 7")
    expect(plan.replay_steps).toHaveLength(DIFF.added.length + DIFF.overridden.length + DIFF.deleted.length)
  })
})
