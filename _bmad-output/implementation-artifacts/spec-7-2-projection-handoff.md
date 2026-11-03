---
title: Story7.2 durable authorized projection handoff and separate observations
type: feature
created: 2026-10-28
status: done
route: dispatch
baseline_commit: 413b7a951f5c119bb16fd74d2c5d586f778e586d
context: []
---
<frozen-after-approval>
## Intent
Use the accepted7.1 contract to persist explicit source/destination transfers, independent of immutable semantic decisions. Preserve local10.1 and parent README. Renewed desktop development authority supersedes archived publication pause only; no external transfer or publication.
## Boundaries
Restricted non-owner PostgreSQL, current signed human workspace-admin plus memory read, exact destination/source/evidence, immutable receipt and separate observations. Offline server-owned destination enrollment only; fixtures enroll disposable targets, no production migration/credentials/grants. No semantic promotion automation. Direct self-checks/tests, no developer reviewers.
## I/O matrix
- Approved current semantic intent plus exact configured destination/evidence and current human admin: atomic transfer/receipt/event/delivery/queued observation.
- Same actor/key/content replay: byte-identical receipt, no duplicate delivery; changed request/source revision/target: conflict.
- Pending, stale, deprecated, foreign, machine/org-only/revoked authority: deny without content leakage or durable effects.
- Due unleased claim: bounded attempt plus monotonic fence. Concurrent claims: one winner. Expired old fence: cannot write or finish.
- Committed write_started: append unknown observation before any outbound write; future claims only reconcile, never clear marker.
- Matching read-back: only verified comparator result can persist synced in server service; mismatched/ambiguous observations are failed/unknown. Receipt unchanged.
- Revocation: append evidence and disable new outbound work; historical observations remain historical, never perpetual readiness.
- Fault during any insert or deferred commit: all newly created rows roll back; no partial outbox/delivery.
</frozen-after-approval>
## Code map
New migration015-projection.sql and projection.ts; lifecycle-fixture/capture/proposal/independent decision used by projection.test.ts. Update migration inventory, schema readiness contract, disposable test discovery and affected pack/recovery fixtures only as required.7.3 supplies real bounded network transport and HTTP/UI presentation.
## Tasks
- [x] Red-first restricted PostgreSQL source/authority/replay/atomicity tests.
- [x] Durable scoped schema/constraints/immutable artifacts/private helpers, explicit offline destination boundary.
- [x] Claims/fencing/write marker/revocation/current source locks and redacted observation query.
- [x] Fault, concurrency, RLS, changed source/grant and unknown reconciliation negatives.
- [x] Typecheck/lint/full composite, direct self-check and exact local evidence.
## Verification
Raw logs Operations/direct-build-20261026/admission26-*.log. No claim of deployed/actual external acceptance; parent README and remote history remain untouched. Actual7.1 full composite passed before implementation.

Local acceptance admission27: entry verified exact nine worker-owned hashes plus parent README against admission26 checkpoint. Reused unchanged-source full composite evidence `admission26-handoff-final-full.log`, exit0 at2026-10-28T01:02:05-04:00:210tests/2093assertions plus579 browser assertions, including7 restricted-PostgreSQL projection scenarios; typecheck/lint passed. Read entire new schema/service/tests and tracked diff directly, checked actor/current-source/transfer/lease locks, immutable receipts, redaction, offline destination enrollment and private helper boundaries. No independent developer review occurred. The trusted server completion function must never become a public supplied-status endpoint;7.3 owns authenticated fresh network GET evidence. Initial lazy SQL test assertion and pre-existing global fixture mutation were fixed without relaxing product guards; final composite exercises both. Source publication/clean-revision CI and real external acceptance remain open under the parent-owned README reconciliation boundary. This done marker accepts local7.2 persistence, not external delivery or an Allura status transition.
