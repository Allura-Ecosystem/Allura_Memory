/**
 * OSV.dev advisory adapter (Story 26.4 Slice B).
 *
 * OSV.dev's POST /v1/query resolves an exact package+version match
 * server-side -- no local semver range parsing is needed or trusted here.
 * Only structured response fields (id, severity, timestamps) are mapped
 * into ThreatAdvisory; summary/details are never read (see schemas.ts).
 */

import { createHash } from "crypto"
import { safeFetchJson, assertSafeIdentifier } from "./safe-fetch"
import { normalizeSeverity, OsvQueryResponse, type InventoryQueryTarget } from "./schemas"
import type { ThreatAdvisory } from "../exposure/types"
import { ThreatAdvisory as ThreatAdvisorySchema } from "../exposure/schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

const OSV_QUERY_URL = "https://api.osv.dev/v1/query"

/**
 * OSV.dev only reliably carries a GHSA-style severity label in
 * database_specific.severity. Its severity[] array carries a raw CVSS
 * vector string, not a computed base score -- bucketing that correctly
 * requires implementing the full CVSS scoring formula, which is out of
 * scope here. Advisories without a usable label are dropped (fail closed,
 * never guessed), not silently defaulted to a severity.
 */
function severityFromOsvVuln(vuln: { database_specific?: { severity?: string } }): "low" | "medium" | "high" | "critical" | null {
  return normalizeSeverity(vuln.database_specific?.severity)
}

/**
 * Query OSV.dev for advisories affecting an exact package/version.
 * Returns [] on a source error or malformed response rather than throwing
 * -- one degraded source must not abort discovery across all others
 * (mirrors runDiscoveryCycle's per-advisory fail-soft behavior).
 */
export async function queryOsv(target: InventoryQueryTarget, fetchedAt: string = new Date().toISOString()): Promise<ThreatAdvisory[]> {
  const packageName = assertSafeIdentifier(target.package, "package name")
  const version = assertSafeIdentifier(target.version, "version")
  const ecosystem = assertSafeIdentifier(target.ecosystem, "ecosystem")

  let raw: unknown
  try {
    raw = await safeFetchJson(OSV_QUERY_URL, {
      method: "POST",
      body: { package: { name: packageName, ecosystem: osvEcosystemName(ecosystem) }, version },
    })
  } catch {
    return []
  }

  const parsed = OsvQueryResponse.safeParse(raw)
  if (!parsed.success) return []

  const advisories: ThreatAdvisory[] = []
  for (const vuln of parsed.data.vulns ?? []) {
    const severity = severityFromOsvVuln(vuln)
    if (!severity) continue // fail closed: never guess a severity

    const publishedAt = toIsoOrNow(vuln.published)
    const contentHash = createHash("sha256")
      .update(JSON.stringify({ id: vuln.id, severity, published: vuln.published, modified: vuln.modified }))
      .digest("hex")

    const advisory = {
      id: `osv-${vuln.id}`,
      source_id: "osv-dev",
      source_url: `https://osv.dev/vulnerability/${vuln.id}`,
      publisher: "OSV.dev",
      published_at: publishedAt,
      fetched_at: fetchedAt,
      source_revision: vuln.modified ?? vuln.id,
      content_hash: contentHash,
      trust_state: "verified" as const,
      freshness_state: "fresh" as const,
      classification: "osv-advisory",
      retention_disposition: "preserve",
      severity,
      evidence_ids: [vuln.id],
      indicators: [
        { type: "package" as const, value: packageName },
        { type: "version" as const, value: version },
      ],
    }

    const validated = ThreatAdvisorySchema.safeParse(advisory)
    if (validated.success) advisories.push(validated.data)
  }

  return advisories
}

function osvEcosystemName(ecosystem: string): string {
  // OSV.dev uses its own ecosystem naming (e.g. "npm", "PyPI", "crates.io").
  // Only npm is in scope for this slice; unrecognized ecosystems are passed
  // through as-is and will simply return no matches from OSV.
  const known: Record<string, string> = { npm: "npm" }
  return known[ecosystem.toLowerCase()] ?? ecosystem
}

function toIsoOrNow(value: string | undefined): string {
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}
