/**
 * Zod schemas for raw external advisory-feed responses (Story 26.4 Slice B).
 *
 * These validate ONLY the shape of third-party API responses before any
 * field is trusted. Free-text fields (summary/details/description/title)
 * are intentionally typed loosely (z.string().optional()) because they are
 * NEVER mapped into a ThreatAdvisory -- Story 26.3's ThreatAdvisory schema
 * (src/lib/exposure/schemas.ts) has no field for them at all, and this
 * module must not invent one. Only structured fields (package name,
 * ecosystem, exact version, severity, timestamps, ids) cross the boundary.
 */

import { z } from "zod"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/** A package/version pair to query each advisory source against. */
export const InventoryQueryTarget = z.object({
  ecosystem: z.string().min(1),
  package: z.string().min(1),
  version: z.string().min(1),
})
export type InventoryQueryTarget = z.infer<typeof InventoryQueryTarget>

// ── OSV.dev (POST /v1/query) ─────────────────────────────────────────────────
// https://ossf.github.io/osv-schema/

const OsvSeverityEntry = z.object({
  type: z.string().optional(),
  score: z.string().optional(),
})

export const OsvVuln = z.object({
  id: z.string().min(1),
  modified: z.string().optional(),
  published: z.string().optional(),
  database_specific: z.object({ severity: z.string().optional() }).optional(),
  severity: z.array(OsvSeverityEntry).optional(),
  // summary/details intentionally not modeled: never read.
})
export type OsvVuln = z.infer<typeof OsvVuln>

export const OsvQueryResponse = z.object({
  vulns: z.array(OsvVuln).optional(),
})

// ── npm bulk advisories (POST /-/npm/v1/security/advisories/bulk) ──────────

export const NpmAdvisory = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string().min(1),
  severity: z.string().min(1),
  // title/vulnerable_versions intentionally not modeled: title is free
  // text; vulnerable_versions is informational only -- the bulk endpoint
  // already resolved the exact-version match server-side by construction
  // of the request, so no local range parsing is needed or trusted here.
})
export type NpmAdvisory = z.infer<typeof NpmAdvisory>

export const NpmBulkAdvisoriesResponse = z.record(z.string(), z.array(NpmAdvisory))

// ── GitHub Security Advisories (GET /advisories?affects=) ──────────────────

export const GithubAdvisoryVulnerability = z.object({
  package: z.object({ ecosystem: z.string().min(1), name: z.string().min(1) }),
  vulnerable_version_range: z.string().min(1),
  first_patched_version: z.string().nullable().optional(),
})

export const GithubAdvisory = z.object({
  ghsa_id: z.string().min(1),
  html_url: z.string().min(1),
  severity: z.string().min(1),
  published_at: z.string().min(1),
  vulnerabilities: z.array(GithubAdvisoryVulnerability),
  // summary/description intentionally not modeled: never read.
})
export type GithubAdvisory = z.infer<typeof GithubAdvisory>

export const GithubAdvisoriesResponse = z.array(GithubAdvisory)

/**
 * Normalize a source's severity vocabulary to Story 26.1's Severity enum
 * (low | medium | high | critical). Returns null (fail closed -- drop the
 * advisory, never guess) for anything unrecognized.
 */
export function normalizeSeverity(raw: string | undefined): "low" | "medium" | "high" | "critical" | null {
  const value = (raw ?? "").trim().toLowerCase()
  if (value === "low") return "low"
  if (value === "medium" || value === "moderate") return "medium"
  if (value === "high") return "high"
  if (value === "critical") return "critical"
  return null
}
