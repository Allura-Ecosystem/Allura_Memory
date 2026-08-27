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
