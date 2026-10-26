---
title: '3.2 Atomic capture, immutable receipts and replay'
status: done
created: 2026-10-26
baseline_commit: 546bd1d69038b31a0e3c23e1bc977d5a7c622b78
---

# Intent and implemented acceptance

Implements the preceding Story 3.1 capture-v1 contract in `foundation/src/capture.ts`, `migrations/003-capture.sql`, `tests/capture.test.ts`. No new HTTP capture endpoint or deployed consumer change. `capture` accepts verified non-human identity, resolves current memory:capture, locks the scoped operation key, and atomically inserts event + immutable receipt text + replay binding + durable index intent. Same digest returns the exact receipt bytes; different digest conflicts. Receipt read-back requires current memory:read and the original authenticated principal; foreign/missing receipts are indistinguishable. No provider/worker/promotion call is made.

Request normalization preserves content bytes and array order; effective defaults and sorted metadata produce stable SHA256. Unknown fields, invalid trace types, nonfinite values, NUL/unpaired surrogates, malformed metadata and oversized encoded payloads reject. PostgreSQL-safe text and 60,000 encoded-payload bytes supplement the contract's 48,000 raw-content/4096 metadata limits. Receipt stage fields remain capture-time observations, not mutable indexing or promotion claims.

# Real verification

Operations `direct-build-20261026/admission2-capture-final.log`: `bun run check:all` exit 0; 47 tests / 342 assertions total, zero failures/skips, typecheck and ESLint passed. DB lane: 29 tests / 208 assertions using actual PostgreSQL 16.15 with non-owner NOBYPASSRLS app login; exact disposable container removal confirmed.

Seven capture cases exercise canonical/default equivalence and invalids; six-way concurrent same-key exact replay with one four-record set; changed payload/no-write conflict; current revoked/foreign denial; separate actor namespace and discarded-response reconciliation; injected failure before every durable boundary and deferred failure at COMMIT; actual terminated capture PostgreSQL backend and same-key retry; immutable DELETE/TRUNCATE rejection and no-context RLS exclusion; capture with no embedding/provider configured. Raw red evidence: `admission2-capture-red.log`, `admission2-capture-input-red.log`. First full run exposed lazy Bun SQL rejection assertions; explicit `.execute()` fixed test execution, not weakened assertions (`admission2-capture-check1.log`, then check2/final).

# Boundaries and next story

This is accepted local capture-service behavior, not complete Epic 3 or product/release acceptance. No MCP capture route is claimed yet; consumers are Epic 6.2. No indexing worker is running; model/worker implementation is 5.1. Story 3.3 must add evidence-linked immutable pending proposal versions/state/audit, source/confidence semantics and high-score-no-promotion negatives before Epic 3 retrospective. Product independent authorized human promotion remains Epic 4. No independent development reviewer ran. Production, remote pushes, retained UX and vendor bodies are unchanged.
