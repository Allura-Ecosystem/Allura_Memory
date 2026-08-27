/**
 * npm bulk-advisories adapter (Story 26.4 Slice B).
 *
 * POST /-/npm/v1/security/advisories/bulk resolves exact package+version
 * matches server-side (the request itself supplies the exact version to
 * check) -- no local semver comparison needed. Only structured response
 * fields (id, url, severity) are mapped into ThreatAdvisory; `title` is
 * free text and is never read (see schemas.ts).
 */

import { createHash } from "crypto"
import { safeFetchJson, assertSafeIdentifier } from "./safe-fetch"
import { normalizeSeverity, NpmBulkAdvisoriesResponse, type InventoryQueryTarget } from "./schemas"
import type { ThreatAdvisory } from "../exposure/types"
import { ThreatAdvisory as ThreatAdvisorySchema } from "../exposure/schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

const NPM_BULK_ADVISORIES_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk"

/**
 * Query npm's bulk advisories endpoint for one or more npm packages, each
 * against one or more exact versions present in inventory. Returns [] on a
 * source error or malformed response (fail-soft, matching the OSV adapter).
 */
export async function queryNpmAudit(
  targets: readonly InventoryQueryTarget[],
  fetchedAt: string = new Date().toISOString(),
): Promise<ThreatAdvisory[]> {
  const npmTargets = targets.filter((t) => t.ecosystem.toLowerCase() === "npm")
  if (npmTargets.length === 0) return []

  const body: Record<string, string[]> = {}
  for (const target of npmTargets) {
    const packageName = assertSafeIdentifier(target.package, "package name")
    const version = assertSafeIdentifier(target.version, "version")
    body[packageName] = [...(body[packageName] ?? []), version]
  }

  let raw: unknown
  try {
    raw = await safeFetchJson(NPM_BULK_ADVISORIES_URL, { method: "POST", body })
  } catch {
    return []
  }

  const parsed = NpmBulkAdvisoriesResponse.safeParse(raw)
  if (!parsed.success) return []

  const versionsByPackage = new Map<string, string[]>()
  for (const target of npmTargets) {
    versionsByPackage.set(target.package, [...(versionsByPackage.get(target.package) ?? []), target.version])
  }

  const advisories: ThreatAdvisory[] = []
  for (const [packageName, entries] of Object.entries(parsed.data)) {
    const versions = versionsByPackage.get(packageName) ?? []
    for (const entry of entries) {
      const severity = normalizeSeverity(entry.severity)
      if (!severity) continue // fail closed: never guess a severity

      const contentHash = createHash("sha256")
        .update(JSON.stringify({ id: entry.id, package: packageName, severity }))
        .digest("hex")

      for (const version of versions) {
        const advisory = {
          id: `npm-audit-${entry.id}`,
          source_id: "npm-audit",
          source_url: entry.url,
          publisher: "npm audit advisory database",
          published_at: fetchedAt, // bulk endpoint does not return a publication timestamp
          fetched_at: fetchedAt,
          source_revision: String(entry.id),
          content_hash: contentHash,
          trust_state: "verified" as const,
          freshness_state: "fresh" as const,
          classification: "npm-audit-advisory",
          retention_disposition: "preserve",
          severity,
          evidence_ids: [String(entry.id)],
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
