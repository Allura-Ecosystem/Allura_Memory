---
title: '4.2 Atomic semantic decision and failure proof'
status: done
created: 2026-10-26
baseline_commit: e9b44f8683c13d3dc46b04f52ddf413250dd8383
---

# Acceptance and execution

Proves Story4.1's actual restricted database transaction, not a duplicate policy implementation. `foundation/tests/decision-atomic.test.ts` injects SQL trigger failure at semantic version, current head, immutable provenance, receipt/replay, decision event, proposal state/audit and internal intent boundaries, plus a deferred-at-COMMIT failure. Every case compares all seven durable-table counts and pending proposal state before/after. No partially approved record survives. Fresh initial versions have immutable provenance to exact proposal/evidence; supersedes lineage for corrections belongs to 4.3.

Six concurrent same-key decisions return one exact receipt and one semantic/provenance/intent set. Different independent authorized human reviewers competing on a single proposal produce one winner. Actual terminated PostgreSQL approval connection rolls back the full set; same-key recovery succeeds once. A real loopback HTTP response is deliberately lost after commit and reconciled without a second semantic version. Product self/role-only/machine denial remains covered by 4.1's required suite. No actual user/production semantic memory is promoted: tests are synthetic disposable fixtures only.

`admission3-atomic-check.log`: `bun run check:all` exit0, 61 tests / 475 assertions, zero failures/skips; TypeScript/ESLint pass. Restricted PostgreSQL lane43/341 and exact owned container removal. This story is added atomicity acceptance on already working 4.1 code; no fabricated failing implementation/TDD receipt is claimed. No code change was needed to pass the additional fault tests. Required named cases added to `scripts/test-db.ts`.

Next: 4.3 AD-67 correction contract, pending correction evidence/submission replay, expected head and immutable supersedes concurrency. 4.4 must still settle restore/duplicate defaults and deletion history before Epic4 closure. No independent development review, external outbox transfer, deployment or remote push.
