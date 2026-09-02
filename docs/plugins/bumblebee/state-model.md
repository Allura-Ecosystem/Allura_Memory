# State & Promotion Model

## Snapshot Truth

Current inventory is derived from the **highest eligible server-issued generation** for one source revision, endpoint population, and profile. The server issues a monotonic generation number when a lease is created — not the scanner's timestamp.

### What can be promoted

A batch is promoted to current inventory only when **all** of the following hold:

1. A `scan_summary` record exists
2. Summary `status` is `complete`
3. `timed_out` is false
4. `error` field is empty
5. Profile is `baseline` or `project` (not `deep`)
6. Mode is `inventory` (not `findings-only`)
7. Summary roots match the server-bound source config roots exactly (by value, order-independent)
8. Summary ecosystem counts are all within the server-bound ecosystem allowlist
9. Summary declared package count matches the actual package record count in the batch

### What is held (evidence only, current state preserved)

| Condition | Reason code |
|-----------|-------------|
| No summary record | `HELD_MISSING_SUMMARY` |
| `timed_out: true` | `HELD_TIMEOUT` |
| `status: "error"` or non-empty error | `HELD_ERROR` |
| `status: "partial"` | `HELD_PARTIAL` |
| Deep profile | `HELD_DEEP_PROFILE` |
| Findings-only mode | `HELD_FINDINGS_ONLY` |
| Roots don't match source config | `HELD_CHANGED_ROOTS` |
| Ecosystems outside source config | `HELD_UNBOUND_ECOSYSTEMS` |
| Summary count ≠ actual package count | `HELD_CONTRADICTORY_COUNTS` |
| Unknown status | `HELD_PARTIAL` (fail closed) |

### Empty inventory

A valid empty complete routine snapshot is **current known-empty state**. This is not stale — it means the scan ran completely and found nothing.

## Promotion Persistence

Promotion is an **append-only fact**, never an update:

1. Every accepted batch starts as `held` with reason `HELD_PENDING_PROMOTION`
2. The promotion engine evaluates and, if promoted, inserts a **new** `bumblebee_run_decisions` row with `decision: "promoted"`
3. The held row remains — it is durable evidence of the batch's initial acceptance state
4. Decision IDs are deterministic: `dec_<leaseId>_<batchId>` — retries target the same row

## Staleness

Staleness is determined by the `isStale()` function in `staleness.ts`:

- **Never completed** a generation → stale (not clean)
- **No completion timestamp** → stale
- **Age exceeds freshness TTL** → stale
- **Otherwise** → fresh

Missing recent complete generations mean **stale, not clean**. This is a critical distinction — the absence of fresh data does not mean the endpoint has no packages; it means the inventory is out of date.

## Profile Separation

| Profile | Classification | Can replace inventory? | Can union? |
|---------|---------------|----------------------|-----------|
| `baseline` | Routine | Yes (if complete) | Yes — with `project` |
| `project` | Routine | Yes (if complete) | Yes — with `baseline` |
| `deep` | Campaign | Never | Never — with anything |

`canUnionProfiles(a, b)` returns true only when both profiles are routine (baseline or project). Deep scans are campaign evidence and never union with routine inventory or with themselves.

## Finding Authority

Findings uploaded by the scanner are **provisional endpoint assertions**. They become trusted exposures only when:

1. A matching package exists in accepted (promoted) inventory
2. The finding's version matches the package's version (or the finding's version is null — name-only match)
3. A catalog digest was bound to the lease at issuance
4. A catalog entry matches `(ecosystem, normalized_name, finding_type, advisory_id)` AND the matched package's version is in the entry's `affected_versions`

Without the catalog digest, ALL findings stay `endpoint-asserted` — the server cannot prove the catalog was current.

The `evidence_source` field distinguishes:
- `"server-recomputed"` — trusted, matched against accepted inventory + catalog
- `"endpoint-asserted"` — unverified, the scanner's claim only

## Evidence Junctions

Each recomputed exposure produces an `EvidenceJunction` that binds:
- `source_id` + `source_revision_id` + `lease_id` + `batch_id` + `run_id` — the full accepted scope
- `record_id` — server-derived digest over exposure identity fields (not the scanner's self-asserted ID)
- `exposure_key` — stable hash for downstream dedup
- `is_trusted` — whether this exposure is server-recomputed or endpoint-asserted

This ensures downstream alert evidence is always traceable to the exact server-bound context, not to the scanner's self-asserted scope.