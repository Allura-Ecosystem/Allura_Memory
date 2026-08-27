/**
 * GitHub Security Advisories adapter (Story 26.4 Slice B).
 *
 * Unlike OSV.dev and npm's bulk-advisories endpoint, GET /advisories?affects=
 * does not resolve an exact-version match server-side -- it returns every
 * advisory naming the package, each carrying a `vulnerable_version_range`
 * string (e.g. ">= 4.0.0, <= 4.17.23"). This adapter checks inventory's
 * exact version against that range locally using `semver`, a well-audited,
 * widely-used range parser -- not hand-rolled comparison logic.
 *
 * Rate limit: unauthenticated requests are capped at 60/hour by GitHub
 * (confirmed 2026-08-27 against the live API). This adapter queries once
 * per distinct package name (not once per package+version), and callers
 * MUST cap distinct package count per cycle to stay under that limit --
 * see MAX_PACKAGES_PER_CYCLE.
 */

import { createHash } from "crypto"
import semver from "semver"
import { safeFetchJson, assertSafeIdentifier } from "./safe-fetch"
import { GithubAdvisoriesResponse, normalizeSeverity, type InventoryQueryTarget } from "./schemas"
import type { ThreatAdvisory } from "../exposure/types"
import { ThreatAdvisory as ThreatAdvisorySchema } from "../exposure/schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

const GITHUB_ADVISORIES_URL = "https://api.github.com/advisories"

/** Unauthenticated GitHub REST API rate limit is 60 requests/hour. */
export const MAX_PACKAGES_PER_CYCLE = 50

/**
 * GitHub's vulnerable_version_range uses comma-separated AND conditions
 * (">= 4.0.0, <= 4.17.23"); node-semver's range syntax uses spaces for AND.
 * This is the only normalization applied -- no other rewriting of the
 * range string is performed.
 */
function toSemverRange(range: string): string {
  return range.split(",").map((part) => part.trim()).join(" ")
}

/**
 * Query GitHub Security Advisories for each distinct npm package name in
 * targets, then locally check inventory's exact version against each
 * advisory's vulnerable_version_range. Returns [] entries for any query
 * that errors, is malformed, or exceeds MAX_PACKAGES_PER_CYCLE (fail-soft,
 * matching the other adapters).
 */
export async function queryGithubAdvisories(
  targets: readonly InventoryQueryTarget[],
  fetchedAt: string = new Date().toISOString(),
): Promise<ThreatAdvisory[]> {
  const npmTargets = targets.filter((t) => t.ecosystem.toLowerCase() === "npm")
  const versionsByPackage = new Map<string, string[]>()
  for (const target of npmTargets) {
    versionsByPackage.set(target.package, [...(versionsByPackage.get(target.package) ?? []), target.version])
  }

  const distinctPackages = [...versionsByPackage.keys()].slice(0, MAX_PACKAGES_PER_CYCLE)
  const advisories: ThreatAdvisory[] = []

  for (const packageName of distinctPackages) {
    const safeName = assertSafeIdentifier(packageName, "package name")
    const versions = versionsByPackage.get(packageName) ?? []

    let raw: unknown
    try {
      raw = await safeFetchJson(`${GITHUB_ADVISORIES_URL}?affects=${encodeURIComponent(safeName)}`)
    } catch {
      continue
    }

    const parsed = GithubAdvisoriesResponse.safeParse(raw)
    if (!parsed.success) continue

    for (const entry of parsed.data) {
      const severity = normalizeSeverity(entry.severity)
      if (!severity) continue // fail closed: never guess a severity

      const packageVuln = entry.vulnerabilities.find(
        (v) => v.package.ecosystem.toLowerCase() === "npm" && v.package.name === packageName,
      )
      if (!packageVuln) continue

      let range: string
      try {
        range = toSemverRange(packageVuln.vulnerable_version_range)
      } catch {
        continue
      }

      for (const version of versions) {
        const cleanVersion = semver.valid(semver.coerce(version))
        if (!cleanVersion || !semver.satisfies(cleanVersion, range)) continue

        const contentHash = createHash("sha256")
          .update(JSON.stringify({ id: entry.ghsa_id, package: packageName, severity, range }))
          .digest("hex")

        const advisory = {
          id: `github-${entry.ghsa_id}`,
          source_id: "github-security-advisories",
          source_url: entry.html_url,
          publisher: "GitHub Security Advisories",
          published_at: toIsoOrNow(entry.published_at, fetchedAt),
          fetched_at: fetchedAt,
          source_revision: entry.ghsa_id,
          content_hash: contentHash,
          trust_state: "verified" as const,
          freshness_state: "fresh" as const,
          classification: "github-security-advisory",
          retention_disposition: "preserve",
          severity,
          evidence_ids: [entry.ghsa_id],
          indicators: [
            { type: "package" as const, value: packageName },
            { type: "version" as const, value: version },
          ],
        }

        const validated = ThreatAdvisorySchema.safeParse(advisory)
        if (validated.success) advisories.push(validated.data)
      }
    }
  }

  return advisories
}

function toIsoOrNow(value: string, fallback: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}
