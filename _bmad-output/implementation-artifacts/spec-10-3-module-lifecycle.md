---
title: Story10.3 bounded apps lifecycle and operator presentation
type: feature
created: 2026-10-28
status: done
route: dispatch
baseline_commit: daa91b43f659469f4a33f081c842397e55e4a90b
context: []
---
<frozen-after-approval>
## Intent
Expose the locally verified scanner and existing review workflow through a stable task-oriented Apps surface. A server-issued known release registry and independently configurable modules must preserve scoped data and authority through compatible updates, rejection, disable and recovery. This is a cohesive lifecycle-through-UI story, not a new plugin execution engine.

## Boundaries & Constraints
Preserve REQ-MOD-001–006, AD-63, scanner capability ceiling, retained shell/interactive graph and independent human semantic approval. Modules are bounded presentation descriptors, never code loaders, scope selectors, identity resolvers, storage clients, permission evaluators or receipt issuers. Existing core services remain the only authority/data access. Never install arbitrary packages, grant capabilities on installation, activate enforcement, adopt banking/credit behavior, mutate prior evidence or conflate local fixtures with deployed acceptance. No production migrations, push, transfer or new upstream. User delegated ordinary design and authorized local disposable migrations/tests; no developer reviewers or routine approval loop.

## I/O & Edge-Case Matrix
| Given / when | Then |
|---|---|
| Current human workspace admin enables a known app with exact expected revision, evidence and rationale | Atomic immutable configuration/event/receipt and monotonic scoped head; no permission changes |
| Two known apps and compatible patch release | Each resolves independently through approved shared components; owner/version/core/capabilities/change impact visible |
| Unknown/duplicate/untrusted/incompatible/code-bearing or capability-missing descriptor | Reject affected module without executing input; unrelated app and shell survive |
| Update/disable/restore while existing configuration and source/review data exist | Preserve records and configuration; explicit disable blocks app navigation without erasing or disabling separate core APIs |
| Revoked/org-only/machine/foreign actor, stale revision or changed-key replay | Deny/conflict without partial write or cross-scope disclosure |
| Concurrent exact command or injected commit failure | One exact receipt or unknown with rollback; authorized read-back shows actual prior/current head |
| Partial/late/stale scanner state, expired catalog and historical exposure | Display separate freshness/trust and bounded-result limits; never claim current remediation or canonical promotion |
| Keyboard/phone/direct app navigation, one module render or service failure | Accessible shared controls and independent failure state; graph and other modules remain usable |
</frozen-after-approval>

## Code Map
- `foundation/src/bumblebee-contract.ts`: existing two allowlisted data-only modules and independent rejection; extend explicit compatible release allowlist, not arbitrary version ranges.
- `foundation/src/persistence.ts`, migrations016–018 and `bumblebee-configuration.ts`: reuse scopedTransaction/current authority locking/private definer/append-only receipt patterns; new019-app-modules.sql and app-modules.ts own scoped lifecycle only.
- `foundation/src/gateway.ts`, core-api.ts and dashboard-transport.ts: signed-human, same-origin, current-scope/error/abort boundaries; add app-modules-api.ts without alternate auth or credentials.
- `foundation/ui/main.tsx`, controls.tsx, memory-map.tsx, projection-panel.tsx and dashboard-contract.ts: reuse shell/components; new apps-panel.tsx owns Apps/admin presentation, not domain decisions.
- `foundation/tests/lifecycle-fixture.ts`, core-release.test.ts and browser fixtures: actual restricted SQL/signed identities/installed package/browser patterns. Register new cases in scripts/test.ts, scripts/test-db.ts and ci-contract.ts; update only required migration-count assertions.

## Tasks & Acceptance
- [x] TDD release/lifecycle contracts and scoped immutable configuration, replay, optimistic updates, disable/restore and atomic fault recovery.
- [x] Expose server-issued discovery and authorized app read paths through core gateway; prove missing capabilities/foreign/current revocation isolation and no canonical mutation.
- [x] Render two task-oriented apps and admin owner/version/update-impact controls; preserve actual scanner/review records and retain graph. Test real buttons, direct disabled navigation, responsive keyboard and isolated failures.
- [x] Direct complete-diff self-check, dependency/license/source evidence, current full checks and exact-source package/CI. Each matrix row needs actual behavior; pure descriptor tests do not close UI or persistence acceptance.

## Design Notes
Use existing built-in bumblebee and memory-review as two representative apps; no fictional Mortgage runtime. Start disabled per scope. Known1.0.0 and compatible1.0.1 share core allura-core-v1 and the exact same read-only capability ceiling, schema1/configuration shape; changes are presentation-only. Unknown major versions/dependencies fail closed. Upgrades and explicit restores create new revisions, never edit old ones. Preserve a bounded typed per-app configuration (selected scanner source UUID or null; review configuration empty) separately from release metadata. No domain migration is needed for these compatible releases; a future incompatible schema needs its own approved migration/recovery contract, not a pretend rollback. Administration is existing explicitly granted workspace:grants:manage; org administration alone is insufficient. Read capability is rechecked independently of module enabled state, which grants nothing. Data survives because app lifecycle never writes domain tables. Unknown update outcome requires explicit exact replay/read-back, not automatic retry.

## Implementation Notes
Native Brooks/Woz and build steps01→02 loaded. Epic context revalidated against newer parallel amendment; previous10.2 locally accepted and documented. Direct user continuation delegates this bounded design and local schema work; no unresolved product question/remote authority inferred. Parent-owned README and candidate snapshots remain excluded. Allura retrieval failed once; local evidence only.

## Verification
Focused real tests red→green, registered nonzero suites, typecheck/lint and `bun run check:all`; actual installed/browser exercises and clean exact-source six-lane CI/package before story closure. Raw logs/checkpoint under Operations/direct-build-20261026/admission35-* and later admissions as needed. Local10.3 is not hosted/deployed/human release acceptance. Epic10 retrospective precedes canonical11 integration.

Admission38 complete current-source check passed261 tests/3034 assertions,0fail/skip, plus731 browser assertions across12 scenarios, typecheck and lint. Raw `admission38-matrix-full.log` SHA256 c585957080865f83f00fc91aa114a2a08c1a59e18e19cdfe28c710310ea5f631. Direct self-check read the full660-line113827-byte staged diff at `admission38-owned-final.diff`; no independent review claimed. No new dependencies/upstream/license changes. Retained graph regression ran; native package/recovery tests include19 migrations.

Matrix witnesses: `app-modules.test.ts` lifecycle/concurrency/fault cases exercise atomic config, exact replay, incompatible updates, explicit disable/restore, unchanged domain rows and denied authority. HTTP case proves scoped authenticated discovery and independent unavailable app views. Both registered Apps browser cases exercise populated data, patch update/cancel/restore, malformed per-module responses, independent shell survival, scope change/revocation clearing, direct route/keyboard/390px layout. New lost-response case commits through real signed HTTPS then aborts acknowledgement: explicit identical retry preserves the exact operation key, obtains revision2 receipt and proves only two total revisions. Partial and late actual ingestion leave the last complete generation visible; approved catalog genuinely expires after a bounded fixture wait, while historical concerns remain separately labelled. Inventory age is explicitly not latest-run health. Parser/ingestion regression covers stale, bounded/truncated and historical state; no real scanner population or actual-human acceptance inferred. Agent inspected `admission38-ui/apps-phone.png`: readable single-column layout, wrapped active identifiers and contained controls without page clipping.

Local acceptance: runtime/source0eb9607aa2a56bec08eee5e0704bd89f9e813ecc. Fresh byte-manifested plain git archive with private scratch index (no branch/worktree or canonical README mutation) passed six local CI lanes, install/typecheck/lint/unit/model/database, all exit0:261tests/3034assertions. Exact receipt `Operations/direct-build-20261026/releases/0eb9607aa2a56bec08eee5e0704bd89f9e813ecc/allura-ci-21DAE2/attempt.json`; raw `admission38-exact-ci.log` and `admission38-export.json`. Packed `allura-core-artifact-OzydxK/allura-core-0.1.0-dev.1.tar.gz` in that release directory has SHA256 e9c73b58a4d0a40c6cabb65f9564d5e0ac78e55a035fa6d92c206c07695141c1; archive digest,97 input hashes, exact sourceHead and sourceDirty:false verified. This is local source/package/installed-fixture acceptance, not independent review or hosted CI.

Remaining: finish Epic10 retrospective before canonical11 integration. Native admission38 wrap-up arrived after retrospective resolver/config/references, catalog/story/previous-retro reads and deterministic git_evidence.py. Its sprint completeness query returned missing sprint-status.yaml; no replacement tracker created. External6/7/9 release gates stay open; no production migration, deployment, hosted CI, external transfer or publication occurred.
