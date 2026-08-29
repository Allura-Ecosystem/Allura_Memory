// Server-only guard — this module recomputes exposure authority and must never
// be bundled into a client build.  The guard throws at import time on window.
if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

import { createHash } from "node:crypto"

// ── Public types ──────────────────────────────────────────────────────────

/**
 * A finding record as extracted from a batch's sanitized_payload — the
 * endpoint-asserted fields the scanner uploaded.  Per AC-16 these are
 * *provisional*: trusted exposure is recomputed server-side, not taken at face
 * value.
 */
export interface FindingRecord {
  readonly ecosystem: string
  readonly normalized_name: string
  /** May be null — the scanner does not always know the version. */
  readonly version: string | null
  readonly finding_type: string
  /** May be null — not all findings carry a catalog id. */
  readonly catalog_id: string | null
  /** May be null — not all findings carry an advisory id. */
  readonly advisory_id: string | null
}

/**
 * An accepted package inventory record — the server-side evidence that a
 * finding is matched against.  These come from promoted inventory batches,
 * not from the finding upload itself.
 */
export interface PackageRecord {
  readonly ecosystem: string
  readonly normalized_name: string
  readonly version: string
  readonly source_file: string
}

/**
 * The result of recomputing a single finding's exposure against accepted
 * package evidence.
 *
 * - `is_trusted` is true only when a matching package exists AND a catalog
 *   digest was bound to the lease (AC-16: "source-lease-bound catalog
 *   digest/revision").  Without the catalog digest the finding stays
 *   endpoint-asserted even if a package name matches — the server has no
 *   proof the catalog was current.
 * - `evidence_source` distinguishes server-recomputed truth from the
 *   scanner's endpoint assertion.
 * - `matched_package` is null when no accepted package matches, so callers
 *   can surface the gap rather than fabricating one.
 * - Upstream nullable fields (version, catalog_id, advisory_id) are carried
 *   through as-is — no fake sentinel is ever substituted (AC-17).
 */
export interface RecomputedExposure {
  readonly ecosystem: string
  readonly package_name: string
  readonly version: string | null
  readonly finding_type: string
  readonly catalog_id: string | null
  readonly advisory_id: string | null
  readonly is_trusted: boolean
  readonly matched_package: PackageRecord | null
  readonly evidence_source: "server-recomputed" | "endpoint-asserted"
}

/**
 * A scope-qualified evidence junction linking an accepted source/run/record
 * identity to a downstream recomputed exposure.  Per AC-17 these junctions
 * carry the *accepted* scope (source, lease, batch, run) so downstream alert
 * evidence is traceable to the exact server-bound context, not to the
 * scanner's self-asserted scope.
 */
export interface EvidenceJunction {
  readonly source_id: string
  readonly source_revision_id: string
  readonly lease_id: string
  readonly batch_id: string
  readonly run_id: string
  /** Stable identifier for the finding record this junction binds. */
  readonly record_id: string
  /** Stable hash of the exposure's identity fields, for dedup downstream. */
  readonly exposure_key: string
  readonly is_trusted: boolean
}

// ── recomputeExposures ────────────────────────────────────────────────────

/**
 * Recompute trusted exposure for each finding against accepted package
 * evidence.
 *
 * Matching is by (ecosystem, normalized_name).  When the finding also
 * carries a non-null version, the matched package's version is checked for
 * equality — but a null finding version still matches by name+ecosystem
 * alone (the scanner may not know the version, and the package record
 * supplies it).
 *
 * `catalogDigest` is the source-lease-bound catalog digest/revision from
 * AC-16.  When it is null, *all* findings are endpoint-asserted even if a
 * matching package exists — the server cannot prove the catalog evidence
 * was current, so no finding is promoted to trusted.
 *
 * No fake sentinels are created: if the finding's version, catalog_id, or
 * advisory_id is null, the exposure carries null for that field (AC-17).
 */
export function recomputeExposures(
  findings: readonly FindingRecord[],
  packages: readonly PackageRecord[],
  catalogDigest: string | null,
): RecomputedExposure[] {
  // Index packages by (ecosystem, normalized_name) for O(1) lookup.  When
  // multiple packages share the same name (e.g. different versions across
  // projects), the first one wins — the purpose here is to prove the finding
  // touches an *accepted* package, not to pin a specific installed instance.
  const packageIndex = new Map<string, PackageRecord>()
  for (const pkg of packages) {
    const key = packageKey(pkg.ecosystem, pkg.normalized_name)
    if (!packageIndex.has(key)) {
      packageIndex.set(key, pkg)
    }
  }

  const hasCatalog = catalogDigest !== null && catalogDigest.length > 0

  return findings.map((finding): RecomputedExposure => {
    const matchedPackage = packageIndex.get(packageKey(finding.ecosystem, finding.normalized_name)) ?? null

    // Version refinement: when the finding declares a version, the matched
    // package must carry that same version to be trusted.  A null finding
    // version skips this check — the finding matches by name alone and the
    // package's version is available in matched_package for downstream use.
    const versionMatches =
      matchedPackage !== null &&
      (finding.version === null || finding.version === matchedPackage.version)

    const isTrusted = hasCatalog && matchedPackage !== null && versionMatches

    return {
      ecosystem: finding.ecosystem,
      package_name: finding.normalized_name,
      // No fake sentinel: null stays null (AC-17).
      version: finding.version,
      finding_type: finding.finding_type,
      catalog_id: finding.catalog_id,
      advisory_id: finding.advisory_id,
      is_trusted: isTrusted,
      matched_package: isTrusted ? matchedPackage : null,
      evidence_source: isTrusted ? "server-recomputed" : "endpoint-asserted",
    }
  })
}

// ── buildEvidenceJunctions ────────────────────────────────────────────────

/**
 * Build scope-qualified evidence junctions for a set of recomputed
 * exposures.  Each junction binds the accepted source/lease/batch/run scope
 * to one exposure's stable identity, so downstream alert evidence is
 * traceable to the exact server-bound context (AC-17).
 */
export function buildEvidenceJunctions(
  exposures: readonly RecomputedExposure[],
  sourceId: string,
  sourceRevisionId: string,
  leaseId: string,
  batchId: string,
  runId: string,
): EvidenceJunction[] {
  return exposures.map((exposure): EvidenceJunction => {
    const recordId = mintRecordId(exposure)
    const exposureKey = mintExposureKey(exposure)
    return {
      source_id: sourceId,
      source_revision_id: sourceRevisionId,
      lease_id: leaseId,
      batch_id: batchId,
      run_id: runId,
      record_id: recordId,
      exposure_key: exposureKey,
      is_trusted: exposure.is_trusted,
    }
  })
}

// ── Internal helpers ──────────────────────────────────────────────────────

function packageKey(ecosystem: string, normalizedName: string): string {
  // NUL-separated so ecosystem prefixes can't collide with name suffixes.
  return `${ecosystem}\0${normalizedName}`
}

// Stable record identity for a recomputed exposure.  This is not the
// scanner's upstream record_id (which the scanner self-asserts) — it is a
// server-derived digest over the exposure's identity fields, so the junction
// is anchored to server-recomputed truth, not endpoint assertion.
function mintRecordId(exposure: RecomputedExposure): string {
  const parts = [
    exposure.ecosystem,
    exposure.package_name,
    exposure.version ?? "",
    exposure.finding_type,
    exposure.catalog_id ?? "",
    exposure.advisory_id ?? "",
  ].join("\0")
  return `finding:${createHash("sha256").update(parts).digest("hex")}`
}

// Dedup key for downstream alert evidence — same exposure identity across
// batches produces the same key so dedup is stable.
function mintExposureKey(exposure: RecomputedExposure): string {
  return createHash("sha256")
    .update(mintRecordId(exposure))
    .update("\0")
    .update(exposure.evidence_source)
    .digest("hex")
}