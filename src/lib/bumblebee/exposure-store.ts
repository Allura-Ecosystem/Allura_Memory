if (typeof window !== "undefined") throw new Error("server-side only")

import type { ConformedRecord } from "./batch-conformance"
import type { BatchStoreDeps } from "./batch-store"
import {
  buildEvidenceJunctions,
  type CatalogEntryAuthority,
  type FindingRecord,
  type PackageRecord,
  type RecomputedExposure,
  recomputeExposures,
} from "./finding-authority"
import type { IngestLease, PersistBatchInput } from "./ingest-pipeline"

function stringValue(payload: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = payload[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function packageFromPayload(payload: Readonly<Record<string, unknown>>): PackageRecord | null {
  const ecosystem = stringValue(payload, "ecosystem")
  const normalizedName = stringValue(payload, "normalized_name")
  const version = stringValue(payload, "version")
  const sourceFile = stringValue(payload, "source_file")
  if (!ecosystem || !normalizedName || !version || !sourceFile) return null
  return {
    ecosystem,
    normalized_name: normalizedName,
    version,
    source_file: sourceFile,
  }
}

function findingFromPayload(payload: Readonly<Record<string, unknown>>): FindingRecord | null {
  const ecosystem = stringValue(payload, "ecosystem")
  const normalizedName = stringValue(payload, "normalized_name")
  const findingType = stringValue(payload, "finding_type")
  if (!ecosystem || !normalizedName || !findingType) return null
  return {
    ecosystem,
    normalized_name: normalizedName,
    version: stringValue(payload, "version"),
    finding_type: findingType,
    catalog_id: stringValue(payload, "catalog_id"),
    advisory_id: stringValue(payload, "advisory_id"),
  }
}

function normalizedCatalogEntry(row: unknown): CatalogEntryAuthority | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null
  const candidate = row as { catalog_entry_id?: unknown; normalized_entry?: unknown }
  if (typeof candidate.catalog_entry_id !== "string" || candidate.catalog_entry_id.length === 0 ||
    typeof candidate.normalized_entry !== "object" || candidate.normalized_entry === null ||
    Array.isArray(candidate.normalized_entry)) return null
  const entry = candidate.normalized_entry as Record<string, unknown>
  const affectedVersions = entry.affected_versions
  if (typeof entry.ecosystem !== "string" || entry.ecosystem.length === 0 ||
    typeof entry.normalized_name !== "string" || entry.normalized_name.length === 0 ||
    typeof entry.finding_type !== "string" || entry.finding_type.length === 0 ||
    typeof entry.advisory_id !== "string" || entry.advisory_id.length === 0 ||
    !Array.isArray(affectedVersions) || affectedVersions.length === 0 ||
    affectedVersions.some((version) => typeof version !== "string" || version.length === 0)) return null
  return {
    catalog_entry_id: candidate.catalog_entry_id,
    ecosystem: entry.ecosystem,
    normalized_name: entry.normalized_name,
    finding_type: entry.finding_type,
    advisory_id: entry.advisory_id,
    affected_versions: affectedVersions as string[],
  }
}

async function exactCatalogEntries(
  deps: BatchStoreDeps,
  lease: IngestLease,
): Promise<CatalogEntryAuthority[]> {
  if (!lease.catalogRevisionId || !lease.catalogDigest) return []
  const result = await deps.pool.query(
    `SELECT e.catalog_entry_id, e.normalized_entry
     FROM bumblebee_catalog_entries e
     JOIN bumblebee_catalog_revisions r
       ON r.group_id=e.group_id AND r.workspace_id=e.workspace_id
      AND r.catalog_revision_id=e.catalog_revision_id
     WHERE e.group_id=$1 AND e.workspace_id=$2 AND e.catalog_revision_id=$3
       AND r.catalog_digest=$4
       AND r.catalog_digest=encode(digest(r.canonical_catalog::text, 'sha256'),'hex')
       AND jsonb_typeof(r.canonical_catalog->'entries')='array'
       AND r.canonical_catalog->'entries' @> jsonb_build_array(e.catalog_entry_id)
       AND app.bumblebee_catalog_entry_is_normalized(e.normalized_entry)
       AND e.entry_digest=encode(digest(e.normalized_entry::text, 'sha256'),'hex')
     ORDER BY e.catalog_entry_id`,
    [lease.groupId, lease.workspaceId, lease.catalogRevisionId, lease.catalogDigest],
  )
  return result.rows
    .map(normalizedCatalogEntry)
    .filter((value): value is CatalogEntryAuthority => value !== null)
}

async function exactCurrentPackages(
  deps: BatchStoreDeps,
  lease: IngestLease,
): Promise<{
  packages: PackageRecord[]
  inventory: { leaseId: string; batchId: string; generation: number } | null
}> {
  if (!lease.profile) return { packages: [], inventory: null }
  const result = await deps.pool.query(
    `SELECT promoted.lease_id,promoted.batch_id,promoted.generation,
            COALESCE(jsonb_agg(records.sanitized_payload ORDER BY records.record_id)
              FILTER (WHERE records.record_id IS NOT NULL),'[]'::jsonb) AS packages
     FROM (
       SELECT leases.lease_id,decisions.batch_id,leases.generation,decisions.decided_at
       FROM bumblebee_scan_leases leases
       JOIN bumblebee_run_decisions decisions
         ON decisions.group_id=leases.group_id AND decisions.workspace_id=leases.workspace_id
        AND decisions.source_id=leases.source_id
        AND decisions.source_revision_id=leases.source_revision_id
        AND decisions.lease_id=leases.lease_id
       JOIN bumblebee_sources sources
         ON sources.group_id=leases.group_id AND sources.workspace_id=leases.workspace_id
        AND sources.source_id=leases.source_id
        AND sources.source_revision_id=leases.source_revision_id
       WHERE leases.group_id=$1 AND leases.workspace_id=$2 AND leases.source_id=$3
         AND leases.source_revision_id=$4 AND leases.profile=$5
         AND decisions.decision='promoted'
         AND decisions.decided_at + sources.freshness_ttl_seconds * INTERVAL '1 second'
           > statement_timestamp()
       ORDER BY decisions.decided_at DESC,leases.generation DESC,decisions.batch_id DESC,leases.lease_id DESC
       LIMIT 1
     ) promoted
     LEFT JOIN bumblebee_records records
       ON records.group_id=$1 AND records.workspace_id=$2 AND records.source_id=$3
      AND records.source_revision_id=$4 AND records.lease_id=promoted.lease_id
      AND records.batch_id=promoted.batch_id AND records.record_type='package'
     GROUP BY promoted.lease_id,promoted.batch_id,promoted.generation`,
    [lease.groupId, lease.workspaceId, lease.sourceId, lease.sourceRevisionId, lease.profile],
  )
  const row = result.rows[0] as {
    packages?: unknown
    lease_id?: unknown
    batch_id?: unknown
    generation?: unknown
  } | undefined
  if (!row || !Array.isArray(row.packages) || typeof row.lease_id !== "string" ||
    typeof row.batch_id !== "string" || !Number.isSafeInteger(Number(row.generation))) {
    return { packages: [], inventory: null }
  }
  const packages = row.packages
    .map((payload) => typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? packageFromPayload(payload as Record<string, unknown>)
      : null)
    .filter((value): value is PackageRecord => value !== null)
  return {
    packages,
    inventory: { leaseId: row.lease_id, batchId: row.batch_id, generation: Number(row.generation) },
  }
}

function exposureJson(exposure: RecomputedExposure): string {
  return JSON.stringify(exposure)
}

export async function projectBatchExposures(
  deps: BatchStoreDeps,
  input: PersistBatchInput,
): Promise<void> {
  const { lease } = input
  if (!lease.profile) throw new Error("BUMBLEBEE_LEASE_AUTHORITY_MISMATCH")

  const findingRecords = input.records.filter((record) => record.record_type === "finding")
  if (findingRecords.length === 0) return

  const findings: FindingRecord[] = []
  const acceptedFindingRecords: ConformedRecord[] = []
  for (const record of findingRecords) {
    const finding = findingFromPayload(record.sanitized_payload)
    if (finding === null) throw new Error("BUMBLEBEE_EXPOSURE_INPUT_INVALID")
    findings.push(finding)
    acceptedFindingRecords.push(record)
  }

  const localPackages = input.records
    .filter((record) => record.record_type === "package")
    .map((record) => packageFromPayload(record.sanitized_payload))
    .filter((value): value is PackageRecord => value !== null)
  const current = input.promotion?.decision === "promoted"
    ? {
        packages: localPackages,
        inventory: lease.generation === undefined ? null : {
          leaseId: lease.leaseId,
          batchId: input.batchId,
          generation: lease.generation,
        },
      }
    : await exactCurrentPackages(deps, lease)
  const catalogEntries = await exactCatalogEntries(deps, lease)
  const exposures = recomputeExposures(
    findings,
    current.packages,
    lease.catalogDigest ?? null,
    catalogEntries,
  )

  for (let index = 0; index < exposures.length; index += 1) {
    const exposure = exposures[index]!
    const finding = acceptedFindingRecords[index]!
    const junction = buildEvidenceJunctions(
      [exposure],
      lease.sourceId,
      lease.sourceRevisionId,
      lease.leaseId,
      input.batchId,
      finding.run_id,
    )[0]!
    await deps.pool.query(
      `SELECT app.insert_bumblebee_exposure_evidence(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb
       )`,
      [
        lease.groupId,
        lease.workspaceId,
        lease.sourceId,
        lease.sourceRevisionId,
        lease.profile,
        lease.leaseId,
        input.batchId,
        finding.run_id,
        finding.record_id,
        junction.exposure_key,
        exposure.is_trusted,
        lease.catalogRevisionId ?? null,
        lease.catalogDigest ?? null,
        exposure.is_trusted ? (current.inventory?.leaseId ?? null) : null,
        exposure.is_trusted ? (current.inventory?.batchId ?? null) : null,
        exposure.is_trusted ? (current.inventory?.generation ?? null) : null,
        exposureJson(exposure),
      ],
    )
  }
}

export async function loadAuthoritativeExposures(
  deps: BatchStoreDeps,
  lease: IngestLease,
): Promise<Array<{
  exposure: Readonly<Record<string, unknown>>
  isTrusted: boolean
  evidenceState: "inventory_bound" | "legacy_unverified"
}>> {
  if (!lease.profile || !Number.isSafeInteger(lease.generation) || (lease.generation ?? 0) <= 0) {
    throw new Error("BUMBLEBEE_LEASE_AUTHORITY_MISMATCH")
  }
  const result = await deps.pool.query(
    `SELECT e.exposure, e.is_trusted, e.evidence_state
     FROM bumblebee_exposure_evidence_reader e
     JOIN bumblebee_scan_leases l
       ON l.group_id=e.group_id AND l.workspace_id=e.workspace_id
      AND l.source_id=e.source_id AND l.source_revision_id=e.source_revision_id
      AND l.lease_id=e.lease_id
     LEFT JOIN bumblebee_scan_leases inventory_lease
       ON inventory_lease.group_id=e.group_id
      AND inventory_lease.workspace_id=e.workspace_id
      AND inventory_lease.source_id=e.source_id
      AND inventory_lease.source_revision_id=e.source_revision_id
      AND inventory_lease.profile=e.profile
      AND inventory_lease.lease_id=e.inventory_lease_id
      AND inventory_lease.generation=e.inventory_generation
     LEFT JOIN bumblebee_run_decisions inventory_decision
       ON inventory_decision.group_id=e.group_id
      AND inventory_decision.workspace_id=e.workspace_id
      AND inventory_decision.source_id=e.source_id
      AND inventory_decision.source_revision_id=e.source_revision_id
      AND inventory_decision.lease_id=e.inventory_lease_id
      AND inventory_decision.batch_id=e.inventory_batch_id
      AND inventory_decision.decision='promoted'
     LEFT JOIN bumblebee_sources inventory_source
       ON inventory_source.group_id=e.group_id
      AND inventory_source.workspace_id=e.workspace_id
      AND inventory_source.source_id=e.source_id
      AND inventory_source.source_revision_id=e.source_revision_id
     WHERE e.group_id=$1 AND e.workspace_id=$2 AND e.source_id=$3
       AND e.source_revision_id=$4 AND e.profile=$5
       AND e.catalog_revision_id IS NOT DISTINCT FROM $6
       AND e.catalog_digest IS NOT DISTINCT FROM $7
       AND e.lease_id=$8 AND l.generation=$9
       AND (
         e.evidence_state='legacy_unverified'
         OR inventory_decision.decided_at
           + inventory_source.freshness_ttl_seconds * INTERVAL '1 second'
           > statement_timestamp()
       )
     ORDER BY e.created_at, e.exposure_key`,
    [
      lease.groupId,
      lease.workspaceId,
      lease.sourceId,
      lease.sourceRevisionId,
      lease.profile,
      lease.catalogRevisionId ?? null,
      lease.catalogDigest ?? null,
      lease.leaseId,
      lease.generation,
    ],
  )
  return result.rows.map((row) => {
    const value = row as {
      exposure: Readonly<Record<string, unknown>>
      is_trusted: boolean
      evidence_state: "inventory_bound" | "legacy_unverified"
    }
    return {
      exposure: value.exposure,
      // Legacy receipts remain inspectable but cannot be treated as fresh authority.
      isTrusted: value.evidence_state === "inventory_bound" && value.is_trusted,
      evidenceState: value.evidence_state,
    }
  })
}
