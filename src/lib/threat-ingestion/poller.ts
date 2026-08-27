/**
 * Advisory polling orchestration (Story 26.4 Slice B).
 *
 * Enumerates verified+fresh inventory package/version pairs for a tenant,
 * queries all three approved advisory sources (per the security-owner
 * approval record, docs/governance/2026-08-27-story-26-4-security-owner-approval.md),
 * and hands the merged ThreatAdvisory list to Slice A's runDiscoveryCycle
 * (src/lib/threat-discovery/worker.ts) unchanged -- this module produces
 * inputs for that worker; it does not duplicate its matching/persistence
 * logic.
 *
 * A source failing (network error, malformed response, rate limit) does
 * not abort polling of the other two sources -- each adapter already
 * fails soft internally, and this module runs them independently.
 */

import type { InventoryProvider } from "../exposure/matcher"
import type { TenantScope } from "../inventory/types"
import type { ThreatAdvisory } from "../exposure/types"
import { queryOsv } from "./osv-adapter"
import { queryNpmAudit } from "./npm-audit-adapter"
import { queryGithubAdvisories, MAX_PACKAGES_PER_CYCLE } from "./github-advisories-adapter"
import type { InventoryQueryTarget } from "./schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface PollResult {
  advisories: ThreatAdvisory[]
  targetsQueried: number
  osvCount: number
  npmCount: number
  githubCount: number
}

/**
 * Build the list of exact (ecosystem, package, version) targets to query
 * from an already-verified+fresh inventory. Provisional, rejected, stale,
 * or degraded records are excluded -- there is no value in checking
 * advisories against inventory the matcher would reject anyway (Story
 * 26.3 only matches verified+fresh on both sides).
 */
export function buildQueryTargets(
  scope: TenantScope,
  inventoryProvider: InventoryProvider,
): InventoryQueryTarget[] {
  const result = inventoryProvider.queryInventory(scope, {})
  const seen = new Set<string>()
  const targets: InventoryQueryTarget[] = []

  for (const record of result.records) {
    if (record.trust_state !== "verified" || record.freshness_state !== "fresh") continue
    const key = `${record.ecosystem}::${record.package}::${record.version}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({ ecosystem: record.ecosystem, package: record.package, version: record.version })
  }

  return targets
}

/**
 * Poll all three approved advisory sources for the given inventory targets
 * and return the merged, deduplicated ThreatAdvisory list ready for
 * runDiscoveryCycle.
 */
export async function pollAdvisorySources(targets: readonly InventoryQueryTarget[]): Promise<PollResult> {
  const fetchedAt = new Date().toISOString()

  const [osvResults, npmResults, githubResults] = await Promise.all([
    Promise.all(targets.map((target) => queryOsv(target, fetchedAt))).then((r) => r.flat()),
    queryNpmAudit(targets, fetchedAt),
    queryGithubAdvisories(targets, fetchedAt),
  ])

  const merged = new Map<string, ThreatAdvisory>()
  for (const advisory of [...osvResults, ...npmResults, ...githubResults]) {
    merged.set(advisory.id, advisory)
  }

  return {
    advisories: [...merged.values()],
    targetsQueried: targets.length,
    osvCount: osvResults.length,
    npmCount: npmResults.length,
    githubCount: githubResults.length,
  }
}

export { MAX_PACKAGES_PER_CYCLE }
