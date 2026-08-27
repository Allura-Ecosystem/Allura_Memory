/**
 * Story 26.4 Slice B — advisory polling orchestration.
 *
 * Mocks all three adapters (already independently tested against real
 * response shapes in their own test files) and exercises buildQueryTargets
 * against the real Story 26.2 inventory service (in-memory, already
 * tested elsewhere).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ThreatAdvisory } from "../../exposure/types"
import { createInventoryService } from "../../inventory/service"
import type { InventorySourceRecord, TenantScope } from "../../inventory/types"

const { queryOsv, queryNpmAudit, queryGithubAdvisories } = vi.hoisted(() => ({
  queryOsv: vi.fn(),
  queryNpmAudit: vi.fn(),
  queryGithubAdvisories: vi.fn(),
}))
vi.mock("../osv-adapter", () => ({ queryOsv }))
vi.mock("../npm-audit-adapter", () => ({ queryNpmAudit }))
vi.mock("../github-advisories-adapter", () => ({ queryGithubAdvisories, MAX_PACKAGES_PER_CYCLE: 50 }))

beforeEach(() => {
  queryOsv.mockReset().mockResolvedValue([])
  queryNpmAudit.mockReset().mockResolvedValue([])
  queryGithubAdvisories.mockReset().mockResolvedValue([])
})

const { buildQueryTargets, pollAdvisorySources } = await import("../poller")

function scope(): TenantScope {
  return { group_id: "allura-test", workspace_id: "workspace-a" }
}

function makeSource(fields: Partial<InventorySourceRecord> & { id: string; package: string; version: string; hash: string }): InventorySourceRecord {
  const { id, package: pkg, version, hash, ...rest } = fields
  return {
    id, artifact_type: "package_manifest", ecosystem: "npm", package: pkg, version, hash,
    publisher: "trusted-publisher", workflow_reference: ".github/workflows/ci.yml",
    source_ref: `source-${id}`, trust_state: "verified", freshness_state: "fresh", ...rest,
  }
}

function makeAdvisory(id: string): ThreatAdvisory {
  return {
    id, source_id: "test-source", source_url: "https://example.com", publisher: "test",
    published_at: "2026-08-27T00:00:00Z", fetched_at: "2026-08-27T00:00:00Z", source_revision: "1",
    content_hash: "hash", trust_state: "verified", freshness_state: "fresh", classification: "test",
    retention_disposition: "preserve", severity: "high", evidence_ids: ["e1"],
    indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }],
  }
}

describe("Story 26.4 Slice B — buildQueryTargets", () => {
  it("includes only verified+fresh inventory records", () => {
    const inventory = createInventoryService()
    inventory.ingestSources(scope(), [
      makeSource({ id: "1", package: "good-lib", version: "1.0.0", hash: "h1", trust_state: "verified", freshness_state: "fresh" }),
      makeSource({ id: "2", package: "stale-lib", version: "1.0.0", hash: "h2", trust_state: "verified", freshness_state: "stale" }),
      makeSource({ id: "3", package: "unverified-lib", version: "1.0.0", hash: "h3", trust_state: "provisional", freshness_state: "fresh" }),
    ])

    const targets = buildQueryTargets(scope(), inventory)
    expect(targets).toEqual([{ ecosystem: "npm", package: "good-lib", version: "1.0.0" }])
  })

  it("deduplicates identical (ecosystem, package, version) triples", () => {
    const inventory = createInventoryService()
    inventory.ingestSources(scope(), [
      makeSource({ id: "1", package: "dup-lib", version: "1.0.0", hash: "h1" }),
      makeSource({ id: "2", package: "dup-lib", version: "1.0.0", hash: "h2" }), // same pkg/version, different manifest
    ])

    const targets = buildQueryTargets(scope(), inventory)
    expect(targets).toHaveLength(1)
  })
})

describe("Story 26.4 Slice B — pollAdvisorySources", () => {
  it("merges results from all three sources, deduplicated by advisory id", async () => {
    queryOsv.mockResolvedValue([makeAdvisory("osv-1")])
    queryNpmAudit.mockResolvedValue([makeAdvisory("npm-1"), makeAdvisory("osv-1")]) // duplicate id across sources
    queryGithubAdvisories.mockResolvedValue([makeAdvisory("github-1")])

    const result = await pollAdvisorySources([{ ecosystem: "npm", package: "evil-lib", version: "1.2.3" }])

    expect(result.advisories.map((a) => a.id).sort()).toEqual(["github-1", "npm-1", "osv-1"])
    expect(result.osvCount).toBe(1)
    expect(result.npmCount).toBe(2)
    expect(result.githubCount).toBe(1)
    expect(result.targetsQueried).toBe(1)
  })

  it("still returns the other sources' results when one source returns nothing", async () => {
    queryOsv.mockResolvedValue([])
    queryNpmAudit.mockResolvedValue([makeAdvisory("npm-1")])
    queryGithubAdvisories.mockResolvedValue([])

    const result = await pollAdvisorySources([{ ecosystem: "npm", package: "evil-lib", version: "1.2.3" }])
    expect(result.advisories).toHaveLength(1)
  })
})

/**
 * Story 26.4 AC-2 — retry and checkpoint behaviour.
 *
 * Every test injects a no-op sleeper so retries cost no wall-clock time.
 */
describe("Story 26.4 AC-2 — pollAdvisorySources retry + checkpoints", () => {
  const FAST = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 }
  const noSleep = async () => {}
  const opts = { config: FAST, sleep: noSleep }
  const oneTarget = [{ ecosystem: "npm", package: "evil-lib", version: "1.2.3" }]

  it("retries a failing source and reports the attempt count it took to recover", async () => {
    queryGithubAdvisories
      .mockRejectedValueOnce(new Error("502 bad gateway"))
      .mockResolvedValue([makeAdvisory("github-1")])

    const result = await pollAdvisorySources(oneTarget, opts)

    expect(result.githubCount).toBe(1)
    expect(result.retrySummary.github.attempts).toBe(2)
    expect(result.retrySummary.github.succeeded).toBe(true)
  })

  it("keeps the other two sources' results when one source exhausts its retries", async () => {
    queryOsv.mockResolvedValue([makeAdvisory("osv-1")])
    queryNpmAudit.mockResolvedValue([makeAdvisory("npm-1")])
    queryGithubAdvisories.mockRejectedValue(new Error("github is down"))

    const result = await pollAdvisorySources(oneTarget, opts)

    // The dead source costs only its own results.
    expect(result.advisories.map((a) => a.id).sort()).toEqual(["npm-1", "osv-1"])
    expect(result.githubCount).toBe(0)
    expect(result.retrySummary.github.succeeded).toBe(false)
    expect(result.retrySummary.github.attempts).toBe(FAST.maxAttempts)
    expect(result.retrySummary.github.lastError).toMatch(/github is down/)
    // ...and the healthy sources are still reported as healthy.
    expect(result.retrySummary.osv.succeeded).toBe(true)
    expect(result.retrySummary.npm.succeeded).toBe(true)
  })

  it("chunks npm targets so one failed chunk does not discard the whole source", async () => {
    // 250 npm targets at NPM_CHUNK_SIZE=100 -> 3 chunks.
    const many = Array.from({ length: 250 }, (_, i) => ({
      ecosystem: "npm",
      package: `pkg-${i}`,
      version: "1.0.0",
    }))

    // Middle chunk fails every attempt; the other two succeed first try.
    queryNpmAudit.mockImplementation(async (chunkTargets: { package: string }[]) => {
      if (chunkTargets[0]?.package === "pkg-100") throw new Error("chunk 2 failed")
      return [makeAdvisory(`npm-${chunkTargets[0]?.package}`)]
    })

    const result = await pollAdvisorySources(many, opts)

    expect(result.retrySummary.npmChunksTotal).toBe(3)
    expect(result.retrySummary.npmChunksFailed).toBe(1)
    // The two healthy chunks' results survived -- this is the checkpoint.
    expect(result.npmCount).toBe(2)
    // A partial result must never be reported as a clean success.
    expect(result.retrySummary.npm.succeeded).toBe(false)
    // 1 attempt each for the two good chunks + maxAttempts for the bad one.
    expect(result.retrySummary.npm.attempts).toBe(1 + 1 + FAST.maxAttempts)
  })

  it("carries the resolved retry policy into the summary for audit", async () => {
    const result = await pollAdvisorySources(oneTarget, opts)
    expect(result.retrySummary.config).toEqual(FAST)
  })
})
