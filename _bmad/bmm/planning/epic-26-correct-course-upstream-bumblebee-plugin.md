# Epic 26 Correct Course — Upstream Bumblebee Plugin Boundary

> [!NOTE]
> **AI-Assisted Documentation**
> This planning correction was prepared with AI assistance and passed independent review against the pinned upstream source and repository authority. Implementation evidence is still required before any Story 26.7 AC advances.

**Date:** 2026-08-27
**Status:** Accepted planning correction — [Pike/Fowler/Knuth remediation and final staged-diff review passed](../../../docs/archive/allura/evidence/epic-26/correct-course/review-verdict-2026-08-27.md)
**Trigger:** Senior-developer source input identified `https://github.com/perplexityai/bumblebee` as the intended scanner and confirmed that the Allura integration must be a plugin.

## Executive decision

Bumblebee is an **Allura plugin around a pinned upstream Perplexity Bumblebee scanner**.

```text
upstream Bumblebee binary on a developer endpoint
→ Allura plugin runner obtains a server-issued scan lease
→ scanner posts NDJSON with a lease-bound ingestion credential
→ sanitized records and immutable acceptance/promotion receipts
→ accepted complete snapshot becomes current inventory
→ Allura exposure, alert, and simulated proposal services
→ optional Curator display through the generic module registry
```

The upstream binary performs read-only endpoint scanning. The Allura plugin owns runner configuration, secure transport, source enrollment, tenant/workspace binding, durable snapshot state, and downstream handoff. The Curator dashboard may display accepted state, but it is not the scanner and is not required for headless integration.

## Why the course changed

The repository has useful Allura-native inventory, advisory polling, matching, mitigation, containment, and Curator code. It does **not** yet integrate the upstream scanner. There is no pinned upstream binary proof, source enrollment, scan lease, NDJSON receiver, or `scan_summary` promotion path.

Calling the existing dashboard adapter or local parsers “Bumblebee integration” would be false attribution. This correction preserves merged work while moving the remaining ship gate to the real plugin boundary.

## Ownership

| Surface                     | Owns                                                                                                                                                                                                                                                       | Does not own                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Upstream scanner            | One-shot `baseline`, `project`, and `deep` metadata scans; supported parsers; stable record IDs; run IDs; package/finding/summary NDJSON; self-test; stdout/file/HTTP sinks                                                                                | Allura tenant scope, scan scheduling, durable current state, alerts, approvals, containment, receipts, or UI    |
| Allura Bumblebee plugin     | Pinned scanner build; server-issued scan lease; source/population contract; dedicated ingestion credential; HTTPS receiver; server-owned scope; schema adapter; sanitized ledgers; complete-snapshot promotion; idempotency; staleness; downstream handoff | Reimplementing upstream parsers; trusting caller scope; direct policy activation or infrastructure action       |
| Curator registry/display    | Optional read-only display of accepted plugin state; server-derived browser scope; feature-flag rollback; accessibility                                                                                                                                    | Scanner transport, endpoint enrollment, ingestion, mutation authority, or a direct `/dashboard/bumblebee` route |
| Canonical Allura governance | Alerts, simulated proposals, approvals, optional host-response actions, and immutable receipts                                                                                                                                                             | Being described as powers of the read-only scanner                                                              |

## Immutable upstream planning pin

- Repository: `perplexityai/bumblebee`
- Release tag: `v0.1.2`
- Commit: `cc57710eeaf685e7b89924a36c8583cad0a378fe`
- Commit tree: `985f57cf1749c15561c886c4476f10950ffa9cae`
- Emitted record schema: `0.1.0`
- Tag signature: no cryptographic tag signature was found during review
- Artifact checksum: must be captured and verified by Story 26.7 before acceptance
- Pinned transport source: `https://github.com/perplexityai/bumblebee/blob/cc57710eeaf685e7b89924a36c8583cad0a378fe/docs/transport.md`
- Pinned state source: `https://github.com/perplexityai/bumblebee/blob/cc57710eeaf685e7b89924a36c8583cad0a378fe/docs/state-model.md`

### Compatibility restriction

The pinned code can emit `agent-skill`, but the pinned package/finding schemas omit that enum. The finding schema also omits `homebrew`. V1 must not silently relax validation. The source population contract must restrict scanner ecosystems and finding modes to the reviewed schema-compatible allowlist until a corrected upstream schema or separately reviewed compatibility schema is adopted.

Catalog schema version and emitted record schema version are separate contracts.

## Server-owned source and run authority

### Source enrollment

Each immutable source revision binds:

- tenant, workspace, source ID, and endpoint device ID;
- dedicated long-lived runner credential audience `bumblebee_runner`;
- scanner tag/commit/checksum and record schema;
- profile and mode (`inventory` or `findings-only`);
- root-set/config digest, ecosystem allowlist, all-users setting, and a scope-qualified catalog revision FK required for findings-enabled runs;
- freshness TTL, retention, classification, and redaction policy.

Identity or population changes create a new source revision. Only disable metadata may be updated in place.

### Run lease

Before starting a scan, the Allura plugin runner authenticates with its `bumblebee_runner` credential and obtains a server-issued, source-bound monotonic generation/lease. The lease binds the source revision, population contract, and required catalog revision and supplies a short-lived `bumblebee_ingest` credential accepted only by the ingestion route.

This is required because upstream `run_id` is random and scan timestamps are endpoint-generated. Current-state ordering uses the server-issued generation, not caller time. Promotion serializes the source/population/profile key, enforces clock-skew bounds for diagnostics, and rejects generation conflicts deterministically.

Because upstream does not emit every population setting, the Allura wrapper/runner attests the server-bound contract. A bare scanner invocation without a valid lease can persist nothing.

## Minimal V1 transport

1. Runner uses only its `bumblebee_runner` credential at `POST /api/plugins/bumblebee/runs` to obtain a lease.
2. Scanner uses only the short-lived `bumblebee_ingest` lease credential at `POST /api/plugins/bumblebee/ingest`.
3. Production ingestion is HTTPS-only. Trusted-proxy scheme handling must be explicit; insecure overrides are allowed only for isolated loopback tests.
4. Authentication occurs before decompression/parsing.
5. Compressed bytes, expanded bytes, line size, and record count are bounded.
6. A request is accepted atomically; no `2xx` is returned until sanitized records and an immutable batch receipt commit.
7. Exact body replay returns the prior receipt; conflicting replay returns `409`; database failure returns `503` without a durable-acceptance claim.

Route authorization is exact: `bumblebee_runner` is refused by ingest/MCP/browser routes, and `bumblebee_ingest` is refused by run-lease/MCP/browser routes.

## State and privacy contract

- Persist **sanitized allowlisted record fields**, canonical record verification inputs, body/line hashes, and redaction provenance; do not persist unqualified raw bodies.
- Hostnames, usernames, paths, roots, catalog text, errors, and evidence strings follow explicit classification, normalization, redaction, and retention rules before database or telemetry writes.
- Secret canaries must be absent from logs, responses, stored payloads, events, and receipts.
- Current inventory derives from the highest eligible server-issued generation for one source revision, endpoint population, and profile.
- A valid empty complete routine snapshot is current known-empty state.
- Partial, error, timeout, missing-summary, contradictory, deep, or findings-only runs remain held evidence and cannot retire routine inventory.

## Relational ledger contract

The implementation must define scope-qualified keys and FKs:

1. `bumblebee_runner_credentials` — hashed/revocable source-runner credential with exclusive `bumblebee_runner` audience; accepted only by the run-lease endpoint
2. `bumblebee_sources` — immutable source revision identity/population with a composite FK to credential and workspace; soft-disable metadata only
3. `bumblebee_catalog_revisions` — immutable scoped canonical catalog bytes/digest, provenance, schema, reviewer/approval receipt, and revision identity
4. `bumblebee_catalog_entries` — immutable normalized entries with a composite FK to catalog revision
5. `bumblebee_scan_leases` — source-bound monotonic generation, population and catalog-revision FK, and hashed short-lived `bumblebee_ingest` credential
6. `bumblebee_batch_receipts` — unique source/lease/body identity and atomic acceptance facts
7. `bumblebee_records` — sanitized append-only records with unique `(group_id, workspace_id, source_id, run_id, record_id)` and FKs to source, lease, and batch
8. `bumblebee_run_decisions` — append-only held/promoted facts referencing source, lease, batch, and summary record; promotion is a new fact, never an update of the held fact
9. Scope-qualified evidence junctions from accepted records to downstream matcher/alert evidence
10. Views for current routine runs, current inventory, and incomplete/missing-summary operations

Every table/view requires composite workspace authority, `ENABLE/FORCE ROW LEVEL SECURITY`, exact app-role policies, least-privilege grants, immutable guards where applicable, and fresh non-owner PostgreSQL proof.

## Finding and downstream authority

Upstream findings contain a catalog ID but no trusted catalog digest/revision. Findings-enabled source revisions and leases must reference an immutable scoped `bumblebee_catalog_revisions` row whose canonical bytes/digest and normalized entries are durably stored and approved. Uploaded findings remain provisional endpoint assertions and are revalidated server-side against accepted package records and that exact revision before trusted alerts are created.

The downstream adapter must preserve nullable upstream fields. It must not invent hashes, publishers, versions, or workflow references to fit `inventory_records`. Allura enrichment is a separate typed projection with matcher name/version, advisory/catalog provenance, and scope-qualified evidence links back to accepted source/run/record identities.

## Preserved work

- Stories 26.1–26.6 remain historical Allura-native downstream foundations.
- Local Bun/workflow parsers remain adjunct Allura sources; they are not the upstream scanner.
- Story 25.3b remains useful optional display infrastructure and is not an Epic 26 ingestion dependency.
- Advisory polling, enriched matchers, alerts, proposal gates, response handoff, RLS, and receipts remain downstream Allura services.

## Replanned remaining story

Story 26.7 becomes **Upstream Bumblebee Plugin Integration, Adversarial Conformance, and Headless Demo Gate**. All corrected acceptance criteria remain open until implementation, independent review, current-SHA CI, and merge/source reconciliation.

## Deferred host response

The durable host flow `alert → simulated proposal → approval → action → receipt → recovery` is Allura governance, not upstream scanner behavior. It is not required to prove the read-only scanner plugin unless a separate host-response story owns it.

## Research receipt

- Upstream README, transport, state model, inventory sources, schemas, model code, release tag, and record-ID implementation were inspected at the immutable pin above.
- Upstream Go tests/self-test were not run because Go is not installed in the current environment; no passing claim is made.
