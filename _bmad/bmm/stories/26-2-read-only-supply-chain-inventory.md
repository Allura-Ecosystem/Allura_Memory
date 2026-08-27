# Story 26.2 — Read-Only Supply-Chain Inventory

**Status:** Done — merged PR #108 (`57dd9af8`)
**Owner:** Woz + Knuth
**Depends on:** 26.1
**Blocks:** 26.3

## Outcome

Build a normalized metadata inventory of approved software and AI supply-chain artifacts without executing any scanning or package-manager operations.

## Acceptance Criteria

- [x] Inventory covers: SBOMs, lockfiles, package manifests, CI workflows, container metadata, extensions, MCP manifests, skills, plugins, and model artifacts.
- [x] Inventory is read-only — no executable scanning, no package installation, no package-manager invocation.
- [x] Metadata is normalized across artifact types with consistent fields: ecosystem, package, version, hash, publisher, workflow reference.
- [x] Inventory is tenant-scoped — derived from authenticated principal, not browser-supplied.
- [x] Missing or stale inventory items are explicitly marked, not silently omitted.
- [x] Inventory can be queried by artifact type, ecosystem, or package name.

## Implementation Status — 2026-08-27

Story file was stale ("Planned", all AC unchecked) despite the story having merged on 2026-08-26. Verified independently this session against `src/lib/inventory/{types,schemas,service}.ts` and re-ran the test suite: 13/13 tests passing (`bun vitest run src/lib/inventory`). Each AC above was checked only after confirming a corresponding test exists and passes — not from the PR title alone.

## Bumblebee Guard extension — 2026-08-27 (same day)

Building Story 26.4 surfaced a real gap this story's own AC-1 left ambiguous:
`ingestSources()` normalizes records handed to it, but nothing anywhere in
this codebase ever read a real SBOM/lockfile/CI-workflow/etc. and called it
-- the in-memory service had no data source, so Story 26.4's discovery
worker had zero real packages to poll advisories against. `docs/allura/DESIGN-ALLURA.md`
already names this component "**Bumblebee Guard**" but no story ever built
it.

Added the first real source -- **lockfile only** (1 of the 10 artifact
types AC-1 lists; SBOMs, CI workflows, container metadata, extensions, MCP
manifests, skills, plugins, and model artifacts remain unbuilt and are
explicitly out of this slice):

- `src/lib/inventory/lockfile-parser.ts`: parses `bun.lock` (JSON5, not
  strict JSON -- uses the `json5` package, not a regex strip) into
  normalized `InventorySourceRecord`s. Pure parsing, no filesystem access
  in this module (matches AC-2: read-only, no exec). Deduplicates by
  `(package, version)` since bun.lock's map keys are dependency paths, not
  identities -- the same real package@version can appear under multiple
  compound keys.
- `docker/postgres-init/44-inventory-records.sql`: the persistence layer
  that never existed. Unlike `threat_alerts`/`mitigation_receipts`, this is
  a plain, fully-mutable tenant-scoped table (RLS only, no restricted-column
  trigger) -- a real dependency's version and hash genuinely change between
  cycles.
- `src/lib/inventory/reconciliation.ts`: `reconcileInventory()` upserts and
  ages missing records to `stale` (never deletes -- AC-5) per `source_ref`,
  with a safety guard: an **empty** parse result is treated as "could not
  read this cycle," not "everything was removed" -- it marks nothing stale
  rather than wrongly downgrading the whole inventory on a transient
  failure. `hydrateInventoryService()` bridges the persisted table back
  into the unchanged, already-tested in-memory `InventoryService` Story
  26.4's matcher expects.
- `src/lib/threat-discovery/cli.ts` now reconciles `bun.lock` before
  building query targets, replacing the previously-empty
  `createInventoryService()`. Verified against this repo's own real
  `bun.lock` (1274 unique real dependencies after dedup) -- not an
  invented fixture.

Tests parse both a hand-written fixture (deterministic edge cases: scoped
packages, workspace-internal packages skipped, missing-hash entries
skipped) and this repo's actual `bun.lock`.

Real Allura tenant data note: `group_id=allura-system` is used for this
repo's own supply chain (dogfooding). There is still no mechanism for a
*customer* tenant to get their own inventory into Allura -- no upload path,
no scan-their-environment story exists. That is a genuine, unscoped product
question this session did not attempt to resolve.

## Evidence

- Inventory schema and normalization rules: `src/lib/inventory/schemas.ts`, `src/lib/inventory/types.ts`.
- Read-only verification: no write paths, no exec calls — `src/lib/inventory/__tests__/inventory.test.ts:173`.
- Tenant scoping tests: `src/lib/inventory/__tests__/inventory.test.ts:181,256,268`.
- Full suite: 13/13 passing, re-verified 2026-08-27.
- Bumblebee Guard: `src/lib/inventory/__tests__/lockfile-parser.test.ts` (9 tests, including two against this repo's real `bun.lock`), `src/lib/inventory/__tests__/reconciliation.test.ts` (6 tests, including the empty-result safety guard).
- Migration 44 validated against a disposable PostgreSQL 16 container (destroyed after): valid insert, upsert-based version mutation (proves the table is genuinely mutable, unlike append-only receipt tables), and cross-tenant RLS rejection all confirmed with real INSERT/UPDATE statements.

## Completion Notes

- agent: Brooks (documentation/verification pass; original implementation by Woz + Knuth, PR #108; Bumblebee Guard extension by Brooks, 2026-08-27)
- date: 2026-08-27
- files changed: `src/lib/inventory/types.ts`, `src/lib/inventory/schemas.ts`, `src/lib/inventory/service.ts`, `src/lib/inventory/__tests__/inventory.test.ts`, `docs/allura/DATA-DICTIONARY.md` (all merged 2026-08-26 in PR #108, `57dd9af8`); this session corrected the stale story-file status/checkboxes, then added `src/lib/inventory/{lockfile-parser,reconciliation}.ts` (new), `src/lib/inventory/__tests__/{lockfile-parser,reconciliation}.test.ts` (new), `docker/postgres-init/44-inventory-records.sql` (new), `src/lib/threat-discovery/cli.ts` (wired), `src/lib/db/tenant-table-inventory.ts`, `package.json`/`bun.lock` (added `json5`)
- evidence: `bun vitest run src/lib/inventory` -> 28/28 passed (13 original + 15 new), exit 0; `bun run test:unit` -> 2024/2024 passed, exit 0; `bun run typecheck` -> exit 0; migration 44 functionally verified against a disposable PostgreSQL 16 container
- remaining gaps: AC-1's original 6 acceptance criteria remain fully met (unchanged from the earlier verification pass). The Bumblebee Guard extension covers only lockfile/bun.lock -- SBOMs, CI workflows, container metadata, extensions, MCP manifests, skills, plugins, and model artifacts have no real parser yet. Multi-tenant inventory onboarding (how a customer tenant's own supply chain gets into Allura at all) is unresolved and unscoped.

## Rollback

Disable the inventory API. No artifacts are modified — the inventory is read-only.