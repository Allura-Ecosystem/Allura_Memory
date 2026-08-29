/**
 * Epic gate contract tests.
 *
 * The gate is the epic exit gate: tenant/workspace isolation fails closed,
 * poisoning/replay/tamper/quota/expiry/rollback all block promotion, and the
 * release manifest is machine-readable with a validate() that fails on
 * missing required fields. The final invariant — canonical memory cannot
 * change through a branch without curator approval — is pinned by the gate's
 * own no-direct-mutation import scan plus the 27.3 adapter import-scan test.
 */

import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { BranchDiff } from "../../branch/promotion-adapter"
import {
  checkExpiry,
  checkIsolation,
  checkPoisoning,
  checkQuota,
  checkReplay,
  checkRollback,
  checkTamper,
  diffHash,
  evaluateGate,
  type GateContext,
  tenantIsolationPredicate,
  workspacePredicate,
} from "../epic-gate"
import {
  createReleaseManifest,
  pendingFields,
  type ReleaseManifest,
  validateManifest,
} from "../release-manifest"

const GROUP = "allura-system"
const WORKSPACE = "workspace-a"
const BRANCH = "branch-b1"
const BASE_REVISION = "base-5000-d128-cosine"

const DIFF: BranchDiff = { added: ["8000", "8001"], overridden: ["42"], deleted: ["7"] }
const EVIDENCE = ["event:41", "evidence-request:00000000-0000-4000-8000-000000000001"]

function baseContext(overrides: Record<string, unknown> = {}): GateContext {
  return {
    group_id: GROUP,
    workspace_id: WORKSPACE,
    branch_id: BRANCH,
    base_revision: BASE_REVISION,
    diff: DIFF,
    evidence_refs: EVIDENCE,
    status: "active",
    base_owner: { group_id: GROUP, workspace_id: WORKSPACE },
    ...overrides,
  } as GateContext
}

/** In-memory queryable answering the gate's exact SQL shapes. */
function memoryDb(overrides: { receipts?: boolean; branchCount?: number } = {}) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    const text = String(sql)
    if (text.includes("FROM promotion_receipts")) {
      return { rows: overrides.receipts ? [{ found: 1 }] : [] }
    }
    if (text.includes("count(*)") && text.includes("FROM branch_registry")) {
      return { rows: [{ count: overrides.branchCount ?? 0 }] }
    }
    return { rows: [] }
  })
  return { query }
}

describe("epic gate — tenant/workspace isolation fails closed", () => {
  it("rejects a branch inheriting a base from another tenant", () => {
    const result = checkIsolation(
      baseContext({ base_owner: { group_id: "allura-other", workspace_id: WORKSPACE } }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/tenant/i)
  })

  it("rejects a branch inheriting a base from another workspace", () => {
    const result = checkIsolation(
      baseContext({ base_owner: { group_id: GROUP, workspace_id: "workspace-b" } }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/workspace/i)
  })

  it("accepts same-tenant same-workspace inheritance", () => {
    const result = checkIsolation(baseContext())
    expect(result.ok).toBe(true)
  })

  it("fails closed when the base owner is unknown", () => {
    const result = checkIsolation(baseContext({ base_owner: undefined }))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/unknown|verify/i)
  })

  it("mirrors the branch_registry RLS model: tenant axis only, workspace as column predicate", () => {
    const migration = readFileSync(
      join(process.cwd(), "docker/postgres-init/53-branch-registry.sql"),
      "utf8",
    )
    // RLS is keyed on the tenant setting exactly like migrations 36/39/41.
    expect(migration).toContain("current_setting('app.current_group_id', true)")
    // The workspace dimension stays a column, never a second RLS axis.
    expect(migration).toContain("workspace_id TEXT NOT NULL")
    expect(migration).not.toContain("current_setting('app.current_workspace_id', true)")

    // The predicate model mirrors the SQL: tenant axis from the transaction
    // setting, workspace axis as an explicit column predicate.
    expect(tenantIsolationPredicate(GROUP, GROUP)).toBe(true)
    expect(tenantIsolationPredicate(GROUP, "allura-other")).toBe(false)
    expect(workspacePredicate(WORKSPACE, WORKSPACE)).toBe(true)
    expect(workspacePredicate(WORKSPACE, "workspace-b")).toBe(false)
  })
})

describe("epic gate — poisoning blocks", () => {
  it("blocks a quarantined branch from promoting", () => {
    const result = checkPoisoning(baseContext({ status: "quarantined" }))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/quarantined/i)
  })

  it("allows an active branch", () => {
    const result = checkPoisoning(baseContext())
    expect(result.ok).toBe(true)
  })
})

describe("epic gate — replay dedupes", () => {
  it("computes a deterministic diff hash from base_revision and diff", () => {
    const a = diffHash(BASE_REVISION, DIFF)
    const b = diffHash(BASE_REVISION, DIFF)
    const c = diffHash(BASE_REVISION, { ...DIFF, added: ["9999"] })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^diff-[a-f0-9]{16}$/)
  })

  it("blocks a replayed diff (same base_revision + same diff hash) from creating a duplicate proposal", async () => {
    const database = memoryDb({ receipts: true })
    const result = await checkReplay(baseContext(), database as never)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/replay|duplicate/i)
  })

  it("allows a novel diff with no prior receipt", async () => {
    const database = memoryDb({ receipts: false })
    const result = await checkReplay(baseContext(), database as never)
    expect(result.ok).toBe(true)
  })
})

describe("epic gate — tamper rejects", () => {
  it("rejects a diff whose evidence_refs were altered after creation", () => {
    const result = checkTamper(
      baseContext({
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: ["event:41"] },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/tamper|evidence/i)
  })

  it("rejects a diff whose base_revision was altered after creation", () => {
    const result = checkTamper(
      baseContext({
        base_revision: "base-9999",
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/tamper|base revision/i)
  })

  it("fails closed when no recorded snapshot exists to verify against", () => {
    const result = checkTamper(baseContext({ recorded: undefined }))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/recorded|verify/i)
  })

  it("accepts an unaltered diff", () => {
    const result = checkTamper(
      baseContext({
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
    )
    expect(result.ok).toBe(true)
  })
})

describe("epic gate — quota bounds", () => {
  it("blocks a workspace at the branch limit", async () => {
    const database = memoryDb({ branchCount: 100 })
    const result = await checkQuota(baseContext(), database as never)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/limit|quota/i)
  })

  it("allows a workspace under the limit", async () => {
    const database = memoryDb({ branchCount: 99 })
    const result = await checkQuota(baseContext(), database as never)
    expect(result.ok).toBe(true)
  })

  it("honors a configurable limit", async () => {
    const database = memoryDb({ branchCount: 3 })
    const result = await checkQuota(baseContext(), database as never, { branchLimitPerWorkspace: 3 })
    expect(result.ok).toBe(false)
  })

  it("defaults to 100 branches per workspace", async () => {
    const database = memoryDb({ branchCount: 100 })
    const result = await checkQuota(baseContext(), database as never)
    expect(result.reason).toMatch(/100/)
  })
})

describe("epic gate — expiry blocks", () => {
  it("blocks a branch whose retention_expires_at has passed", () => {
    const result = checkExpiry(
      baseContext({ retention_expires_at: "2026-01-01T00:00:00.000Z" }),
      { now: () => new Date("2026-08-29T00:00:00.000Z") },
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/expired|expiry/i)
  })

  it("blocks a branch with status expired", () => {
    const result = checkExpiry(baseContext({ status: "expired" }))
    expect(result.ok).toBe(false)
  })

  it("allows a branch whose retention has not passed", () => {
    const result = checkExpiry(
      baseContext({ retention_expires_at: "2027-01-01T00:00:00.000Z" }),
      { now: () => new Date("2026-08-29T00:00:00.000Z") },
    )
    expect(result.ok).toBe(true)
  })
})

describe("epic gate — rollback preserves and blocks re-promotion", () => {
  it("blocks a rolled_back branch from re-promoting", () => {
    const result = checkRollback(
      baseContext({
        status: "rolled_back",
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/rolled_back|re-promot/i)
  })

  it("preserves the rolled_back diff for replay", () => {
    const result = checkRollback(
      baseContext({
        status: "rolled_back",
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
    )
    expect(result.reason).toMatch(/preserv/i)
  })

  it("fails closed when a rolled_back branch has no preserved diff", () => {
    const result = checkRollback(baseContext({ status: "rolled_back", recorded: undefined }))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/preserv/i)
  })
})

describe("epic gate — aggregate", () => {
  it("aggregates all checks and fails closed on any failure", async () => {
    const database = memoryDb({ receipts: false, branchCount: 1 })
    const result = await evaluateGate(
      baseContext({
        status: "quarantined",
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
      database as never,
    )
    expect(result.ok).toBe(false)
    expect(result.checks.poisoning.ok).toBe(false)
    expect(result.checks.isolation.ok).toBe(true)
    expect(result.checks.replay.ok).toBe(true)
    expect(result.checks.tamper.ok).toBe(true)
    expect(result.checks.quota.ok).toBe(true)
    expect(result.checks.expiry.ok).toBe(true)
    expect(result.checks.rollback.ok).toBe(true)
  })

  it("passes only when every check passes", async () => {
    const database = memoryDb({ receipts: false, branchCount: 1 })
    const result = await evaluateGate(
      baseContext({
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
      database as never,
    )
    expect(result.ok).toBe(true)
    for (const check of Object.values(result.checks)) {
      expect(check.ok).toBe(true)
    }
  })

  it("reports proposal-only promotion (the gate never writes canonical memory)", async () => {
    const database = memoryDb({ receipts: false, branchCount: 1 })
    const result = await evaluateGate(
      baseContext({
        recorded: { base_revision: BASE_REVISION, diff: DIFF, evidence_refs: EVIDENCE },
      }),
      database as never,
    )
    expect(result.promotion).toBe("proposal-only")
  })
})

describe("epic gate — final invariant: canonical memory cannot change through a branch without curator approval", () => {
  it("imports no memory-write module and never names canonical tables", () => {
    for (const file of ["src/lib/branch-gate/epic-gate.ts", "src/lib/branch-gate/release-manifest.ts"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8")
      for (const prefix of [
        "@/lib/memory/",
        "@/mcp/canonical-tools",
        "@/lib/graph-adapter",
        "@/control-plane/syscalls",
        "@/lib/neo4j",
      ]) {
        expect(source).not.toContain(prefix)
      }
      expect(source).not.toContain("allura_memories")
      expect(source).not.toContain("graph_memories")
    }
  })

  it("confirms the 27.3 import-scan test still guards the promotion adapter", () => {
    const adapterTest = readFileSync(
      join(process.cwd(), "src/lib/branch/__tests__/promotion-adapter.test.ts"),
      "utf8",
    )
    expect(adapterTest).toContain("imports no memory-write module and never references canonical memory tables")
    expect(adapterTest).toContain("allura_memories")
    expect(adapterTest).toContain("graph_memories")
  })
})

describe("release manifest — typed builder", () => {
  const complete = {
    revision: "aa15a37a",
    tests: { total: 2424, passed: 2424, failed: 0, skipped: 160 },
    benchmark: {
      fixture: "docs/archive/allura/evidence/epic-27/spike-27.2-fixture-metrics.json",
      story: "27-2-disposable-branch-mechanics-agenticow-spike",
      status: "PASS",
      measuredAt: "2026-08-29T17:44:46.237Z",
    },
    sbom: {
      tool: "pinned-source recon (spike 27.2)",
      licenses: [
        { name: "agenticow", version: "0.2.4", license: "MIT", source: "npm + GitHub spdx_id: MIT" },
        { name: "@ruvector/rvf-node", version: "0.2.3", license: "MIT", source: "npm metadata" },
        { name: "allura", version: "workspace", license: "MIT", source: "packages/*/package.json" },
      ],
    },
  }

  /** Fill the parent-owned fields the way the parent does after review. */
  function parentFilled(manifest: ReleaseManifest): ReleaseManifest {
    return {
      ...manifest,
      review: {
        status: "approved",
        reviewer: "pike",
        verdict: "approved",
        reason: "independent review approved the frozen green diff",
        reviewedAt: "2026-08-29T00:00:00.000Z",
      },
      allura: {
        status: "issued",
        receipt_id: "receipt-27-6-1",
        trace_id: "promo-27-6-1",
        issuedAt: "2026-08-29T00:00:00.000Z",
      },
    }
  }

  it("builds a machine-readable manifest with all fields", () => {
    const manifest = createReleaseManifest(complete)
    expect(manifest.schema).toBe("allura-release-manifest/1")
    expect(manifest.revision).toBe("aa15a37a")
    expect(manifest.tests.total).toBe(2424)
    expect(manifest.benchmark.status).toBe("PASS")
    expect(manifest.sbom.licenses).toHaveLength(3)
    expect(manifest.browser.applicable).toBe(false)
    expect(manifest.review.status).toBe("pending")
    expect(manifest.allura.status).toBe("pending")
    expect(manifest.generatedAt).toBeTruthy()
  })

  it("validates when all required fields are present (parent filled review + Allura receipt)", () => {
    const manifest = parentFilled(createReleaseManifest(complete))
    const result = validateManifest(manifest)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("fails validation while the review verdict and Allura receipt are pending", () => {
    const manifest = createReleaseManifest(complete)
    const result = validateManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.errors.join(" ")).toMatch(/review/i)
    expect(result.errors.join(" ")).toMatch(/allura/i)
  })

  it("fails validation when revision is missing", () => {
    const manifest = parentFilled(createReleaseManifest({ ...complete, revision: "" }))
    const result = validateManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.errors.join(" ")).toMatch(/revision/i)
  })

  it("fails validation when tests are missing", () => {
    const manifest = parentFilled(createReleaseManifest({ ...complete, tests: { total: 0, passed: 0, failed: 0, skipped: 0 } }))
    const result = validateManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.errors.join(" ")).toMatch(/tests/i)
  })

  it("fails validation when benchmark is missing", () => {
    const manifest = parentFilled(createReleaseManifest({ ...complete, benchmark: { fixture: "", story: "", status: "", measuredAt: "" } }))
    const result = validateManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.errors.join(" ")).toMatch(/benchmark/i)
  })

  it("fails validation when SBOM license evidence is missing", () => {
    const manifest = parentFilled(createReleaseManifest({ ...complete, sbom: { tool: "pinned-source recon", licenses: [] } }))
    const result = validateManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.errors.join(" ")).toMatch(/sbom|license/i)
  })

  it("accepts headless browser evidence as not applicable", () => {
    const manifest = parentFilled(createReleaseManifest(complete))
    expect(manifest.browser).toEqual({ applicable: false, note: expect.stringMatching(/headless/i) })
    expect(validateManifest(manifest).ok).toBe(true)
  })

  it("lists review verdict and Allura receipt as pending fields for the parent", () => {
    const manifest = createReleaseManifest(complete)
    expect(pendingFields(manifest)).toEqual(["review.verdict", "allura.receipt_id"])
  })
})
