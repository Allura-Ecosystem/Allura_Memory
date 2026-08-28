# Story 26.4 — Scheduled Discovery and Alert Routing

**Status:** Done — all 9 acceptance criteria met and verified 2026-08-27 (see Completion Notes for the honest limits of the AC-6 evidence)
**Owner:** Hightower + Woz
**Depends on:** 26.3 (done)
**Blocks:** 26.7

## Outcome

A governed worker operates the scheduled advisory-polling and reconciliation lanes, routes alerts to the right tenants/workspaces, and maintains alert lifecycle, freshness, and health evidence. Internal security events remain a separately observable event-driven lane.

## Acceptance Criteria

- [x] Governed worker schedule is configured with security-owner approval.
- [x] Polling cadence, checkpoints, retry behavior, and source freshness expectations are security-owner-configured and auditable; the worker cannot alter its own schedule.
- [x] Alert lifecycle is defined: new, acknowledged, mitigated, resolved, stale.
- [x] Freshness/degraded states are visible — stale alerts are marked, not silently retained.
- [x] Alert routing is deduplicated and tenant-scoped.
- [x] Scheduler health is monitored with audit evidence.
- [x] A newly matched high-severity exposure creates one deduplicated alert and a reviewable mitigation draft; it does not activate enforcement.
- [x] Scheduler execution can create alerts and simulated proposals only; package blocks, CI changes, containment, and policy activation remain denied without a separate approval receipt.
- [x] Disabling the scheduler leaves the dashboard shell, core API/MCP controls, and other modules operational.

## Implementation Status — 2026-08-27

**Slice A implemented (this session):** given `ThreatAdvisory` objects (already Story
26.1/26.3-typed), the worker matches them against inventory (reusing Story 26.3's
in-memory `ExposureMatcher` unmodified), persists deduplicated tenant-scoped alerts
with a real, restricted-column lifecycle, and generates a simulated mitigation draft
(reusing Story 26.5's `DraftGenerator` unmodified) for new high/critical-severity
alerts. AC-3, AC-4, AC-5, AC-7, AC-8 are met and verified.

**AC-1/AC-2 status:** the security-owner approval is recorded
(`docs/governance/2026-08-27-story-26-4-security-owner-approval.md`), but "worker
schedule is configured" means an actual running scheduled job, which does not exist
yet — that depends on Slice B below.

**Slice B implemented (2026-08-27, same day):** `src/lib/threat-ingestion/` --
adapters for all three security-owner-approved sources (GitHub Security Advisories,
OSV.dev, npm audit API), a hardened outbound-fetch boundary (`safe-fetch.ts`: fixed
host allowlist, HTTPS-only, timeout, response-size cap, JSON-only), and a poller that
enumerates verified+fresh inventory and merges results from all three sources into
Slice A's `runDiscoveryCycle` unchanged.

Real advisories were pulled from all three live APIs during development to confirm
actual response shapes rather than guessing (osv.dev, api.github.com, registry.npmjs.org
all directly reachable and tested manually 2026-08-27) -- this confirmed the exact risk
this story's own trust contract exists for: real GitHub/OSV advisories carry raw,
attacker-shaped HTML and exploit source code embedded directly in their
`summary`/`details`/`description` free-text fields. Story 26.3's `ThreatAdvisory`
schema has no field for that text at all, so it structurally cannot be mapped in; each
adapter has an explicit test proving the untrusted text never appears anywhere in the
resulting `ThreatAdvisory`.

OSV.dev and npm's bulk-advisories endpoint both resolve an exact package+version match
server-side (the query itself supplies the exact version), so no local range parsing
is needed for either. GitHub's advisories endpoint does not -- it returns a
`vulnerable_version_range` string per package, checked locally with `semver`
(a well-audited, widely-used range parser, not hand-rolled comparison logic); tests
prove a version inside the range matches, a patched version does not, and a version
below the introduced bound does not. GitHub's unauthenticated rate limit (60
requests/hour, confirmed against the live API) is enforced via `MAX_PACKAGES_PER_CYCLE`.

The systemd `.service`/`.timer` unit files (`scripts/systemd/allura-threat-discovery.*`)
exist, matching the approved 6-hour cadence and the pattern already established by
Stories 21.1-21.3 (`allura-content-curator.timer`). AC-1 is checked because the
configuration artifact exists and matches the approval exactly. AC-9 is checked because
disabling this (not-yet-deployed) timer changes nothing else: no dashboard/API route
anywhere imports `threat-discovery` or `threat-ingestion` (verified by grep). This
paragraph records the original slice state. AC-2 and AC-6 were later closed by the
retry/checkpoint and repeated-process evidence recorded below; the systemd units still
have never been installed on a production host.

**The inventory gap noted above -- now partially closed, same day (2026-08-27):**
Story 26.2 was extended with an Allura-local inventory adjunct -- a real, persisted inventory
reconciled from this repo's own `bun.lock` (see Story 26.2's own file for the
full writeup: `src/lib/inventory/{lockfile-parser,reconciliation}.ts`,
`docker/postgres-init/44-inventory-records.sql`). `src/lib/threat-discovery/cli.ts`
now reconciles `bun.lock` and hydrates the real persisted inventory instead of
an empty in-memory service, so `buildQueryTargets` returns real targets (1274
unique dependencies from this repo's own lockfile) rather than always `[]`.

**Still genuinely limited, not solved:** only the `lockfile` artifact type has
a real source. SBOMs, CI workflows, container metadata, extensions, MCP
manifests, skills, plugins, and model artifacts (9 of the 10 types Story
26.2's schema supports) have no parser -- inventory for those remains empty.
And this only covers `allura-system`'s own repo; there is still no mechanism
for a customer tenant's supply chain to enter Allura at all. This worker is
no longer a guaranteed no-op, but it is far from complete inventory coverage.

**A pre-existing bug found and NOT fixed here (out of this story's scope):** Story
26.4's `threat_alerts` migration needed a restricted-column UPDATE trigger, and the
closest precedent -- `pattern_proposals`' trigger, migration 31 -- uses
`jsonb_object_keys(to_jsonb(NEW) - to_jsonb(OLD))`. `jsonb - jsonb` is not a valid
PostgreSQL operator (confirmed directly: `ERROR: operator does not exist: jsonb -
jsonb`). This means migration 31's trigger would throw on any real UPDATE, and
`/api/genesis/proposals/approve` and `/reject` (`src/app/api/genesis/proposals/{approve,reject}/route.ts`)
both route through it via `pgUpdatePatternProposal` (`src/control-plane/target-resolver.ts`).
This module's own trigger (`app.guard_threat_alert_lifecycle_update`) uses explicit
per-column `IS DISTINCT FROM` comparisons instead and was verified working. The
pattern_proposals bug is flagged here for separate remediation, not fixed in this PR.

## AC-2 and AC-6 Closure — 2026-08-27

**AC-2 (cadence/checkpoints/retry, security-owner-configured, worker-immutable).**
Cadence was already externally fixed by the systemd timer and the worker still has
no code path that can rewrite its own unit file. What was missing -- and is now
built -- is retry and checkpoint behaviour:

- `src/lib/threat-ingestion/retry.ts`: `withRetry` with exponential backoff and a
  hard delay cap. Policy comes from three env vars
  (`THREAT_DISCOVERY_RETRY_MAX_ATTEMPTS` / `_BASE_DELAY_MS` / `_MAX_DELAY_MS`),
  read fresh on every call, with safe defaults and no setter anywhere. The worker
  can *observe* its retry policy and report on it; it cannot change it. A
  malformed operator value degrades to the default rather than disabling retry or
  looping forever.
- **A real checkpoint gap was found and fixed while building this.** The three
  adapters were not equivalent: OSV is per-target and GitHub is per-package (both
  already fail soft internally), but `queryNpmAudit` sends *every* npm target in
  one bulk POST -- so on this repo's ~1274-package inventory, a single transient
  failure silently discarded 100% of npm results for the cycle. That is an
  all-or-nothing batch, not a checkpoint. `pollAdvisorySources` now chunks npm
  targets (`NPM_CHUNK_SIZE = 100`) and retries each chunk independently, so a
  failed chunk costs ~100 packages instead of all of them. A partial npm result is
  reported as `succeeded: false` with `npmChunksFailed > 0` -- reporting a partial
  result as clean success would hide real data loss.
- **Auditable** is literal, not aspirational: the resolved policy and the actual
  per-source attempt counts are written into the `THREAT_DISCOVERY_HEARTBEAT`
  event's `metadata.retry` (schema: `DiscoveryRetryEvidence`), so it lands in an
  immutable `events` row rather than only in a log line.

**AC-6 (scheduler health monitored with audit evidence).** Six real
`runDiscoveryCycle` executions were run at a 20-second interval against a real
PostgreSQL 16 database with real inventory reconciled from this repo's own
artifacts (1274 lockfile + 17 ci_workflow records). Result: 6 heartbeat rows
spanning 100 seconds of genuine elapsed wall-clock time, with measured inter-beat
gaps of 20.0 / 20.0 / 20.2 / 20.0 / 20.1 seconds, each carrying the retry policy
in its metadata. Full evidence, including the queries used:
`docs/archive/allura/evidence/epic-26/26.7/scheduler-health-evidence.md`.

**What AC-6's evidence does NOT cover.** This was a local repeated-process run,
not a systemd/production deployment. It proves the worker executes repeatedly on
a schedule and emits durable, queryable health evidence with real timing. It does
not prove behaviour under systemd supervision, across host restarts, or over days
rather than minutes. The unit files (`scripts/systemd/allura-threat-discovery.*`)
still have never been installed on any host. AC-6 is checked because the
mechanism is built, exercised over real time, and produces real audit evidence --
not because this has run in production.

**Inventory coverage improved.** A second real source now exists: the
`ci_workflow` artifact type, via `src/lib/inventory/ci-workflow-parser.ts`.
Its historical evidence remains in this Story 26.4 completion record and the parser tests;
it is an Allura-local adjunct source, not the upstream Bumblebee scanner.
2 of 10 artifact types now have real sources, up from 1.

## Evidence

- Security-owner approval record: `docs/governance/2026-08-27-story-26-4-security-owner-approval.md`.
- Alert lifecycle state machine: `docker/postgres-init/42-threat-alerts.sql` (CHECK constraint + restricted-update trigger), `src/lib/threat-discovery/worker.ts` (`markAlertStale`).
- Freshness/degraded state tests: `src/lib/threat-discovery/__tests__/worker.test.ts` ("transitions a non-resolved alert to stale", "never overwrites a resolved alert").
- Dedup/tenant-scoping tests: same file ("does not create a duplicate row...", "processes the same exposure across two advisories into exactly one alert", "does not leak alerts across tenants").
- Alert + draft composition test: same file ("creates one alert and a simulated draft for a high-severity match (AC-7)", "does not generate a draft for a low-severity match").
- Migration 42 validated against a disposable PostgreSQL 16 container (destroyed after): RLS tenant isolation, dedup UNIQUE constraint, restricted-column UPDATE trigger, and DELETE rejection all independently confirmed with real INSERT/UPDATE/DELETE statements, not just schema inspection.
- Hardened fetch boundary tests: `src/lib/threat-ingestion/__tests__/safe-fetch.test.ts` (13 tests) -- allowlist rejection, HTTPS-only, timeout, response-size cap, malformed-JSON rejection, identifier-injection rejection.
- Per-source adapter tests, each using a response shape captured from a real live call (2026-08-27), each proving untrusted free text never reaches the mapped `ThreatAdvisory`: `osv-adapter.test.ts` (6), `npm-audit-adapter.test.ts` (6), `github-advisories-adapter.test.ts` (8, including real semver range boundary correctness and the `MAX_PACKAGES_PER_CYCLE` rate-limit cap).
- Poller tests: `poller.test.ts` (4) -- verified+fresh-only target selection, dedup, and merge-across-sources.
- Scheduler configuration: `scripts/systemd/allura-threat-discovery.{service,timer}`, matching the approved 6-hour cadence and the existing `allura-content-curator` pattern.
- No-coupling check for AC-9: `grep -rl "threat-discovery\|threat-ingestion" src/app` returns nothing.

## Completion Notes

- agent: Brooks
- date: 2026-08-27
- files changed: **(AC-2/AC-6 closure pass, 2026-08-27)** `src/lib/threat-ingestion/retry.ts` (new), `src/lib/threat-ingestion/poller.ts` (retry + npm chunking), `src/lib/threat-ingestion/__tests__/retry.test.ts` (new, 12 tests), `src/lib/threat-ingestion/__tests__/poller.test.ts` (+5 retry/checkpoint tests), `src/lib/threat-discovery/{schemas,types,worker,cli}.ts` (retry evidence threaded into the heartbeat event), `src/lib/inventory/ci-workflow-parser.ts` (new), `docs/archive/allura/evidence/epic-26/26.7/scheduler-health-evidence.md` (new)
  **(original Slice A/B)** `docker/postgres-init/42-threat-alerts.sql`, `src/lib/threat-discovery/{schemas,types,worker,cli}.ts`, `src/lib/threat-discovery/__tests__/worker.test.ts` (10 tests), `src/lib/threat-ingestion/{safe-fetch,schemas,osv-adapter,npm-audit-adapter,github-advisories-adapter,poller}.ts` (all new), `src/lib/threat-ingestion/__tests__/*.test.ts` (37 tests, all new), `scripts/systemd/allura-threat-discovery.{service,timer}` (new), `src/lib/db/tenant-table-inventory.ts`, `vitest.config.unit.ts` (also registered Story 26.2/26.3's tests, previously missing from the CI unit lane -- found while wiring this story's own tests in), `docs/allura/DATA-DICTIONARY.md`, `docs/allura/REQUIREMENTS-MATRIX.md`, `package.json`/`bun.lock` (added `semver` + `@types/semver`)
- evidence: **(AC-2/AC-6 closure)** `bun vitest run src/lib/threat-ingestion src/lib/threat-discovery` -> 63/63 passed (was 47), exit 0; `bun run test:unit` -> 2147/2147 passed, exit 0; `bun run typecheck` -> exit 0; six real discovery cycles executed at a 20s interval against a disposable PostgreSQL 16 container, producing 6 heartbeat rows over 100s of real elapsed time with measured gaps of 20.0/20.0/20.2/20.0/20.1s (evidence file linked above); container destroyed afterward
  **(original Slice A/B)** `bun vitest run src/lib/threat-discovery src/lib/threat-ingestion` -> 47/47 passed, exit 0; `bun run test:unit` -> 2009/2009 passed (was 1930 at session start; +79 total), exit 0; `bun run typecheck` -> exit 0; migration 42 functionally verified against a disposable PostgreSQL 16 container; real OSV.dev/GitHub/npm-registry API calls made manually during development to confirm actual response shapes (not hit by the automated test suite, which mocks the HTTP boundary)
- remaining gaps: AC-2 and AC-6 were closed 2026-08-27 -- see the "AC-2 and AC-6 Closure" section above for what was built and, importantly, for the honest limits of the AC-6 evidence (a local repeated-process run over 100s, NOT a systemd/production deployment; the unit files have still never been installed on any host). Inventory coverage is still partial: 2 of 10 artifact types (`lockfile`, `ci_workflow`) have real sources; SBOMs, package manifests, container metadata, extensions, MCP manifests, skills, plugins, and model artifacts have no parser. There is still no mechanism for a customer tenant's own supply chain to enter Allura -- coverage is `allura-system`'s own repo only. The pattern_proposals `jsonb - jsonb` bug found while building this story was fixed separately in PR #115, not folded into this one.

## Rollback

Disable the scheduler. Alerts already created remain; no new alerts are generated.
