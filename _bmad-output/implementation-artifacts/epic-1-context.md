# Epic 1 Context: Executable foundation and build contracts

## Goal

Provide a reproducible executable harness and concrete authority/storage contracts before building governed memory. Direct-build authority in `guidelines/ALLURA-BMAD.md` supersedes historical temporary worker limits in the source planning snapshot below. Baseline 9e3df50891f99b4ed9e0f6e33f9082a68f2ef9ce is committed. Ordinary design decisions and local disposable tests are delegated; production actions are not.

## Stories

- Story 1.1: Local executable foundation
- Story 1.2: Authority and service contracts
- Story 1.3: Persistence and security contracts
- Story 1.4: Foundation acceptance and handoff

## Requirements & Constraints

Server-derived current workspace/action authority; explicit workspace grants even for org admins; distinct human and machine identities; independent human promotion of exact reviewed versions; immutable evidence and semantic lineage. Denial cannot broaden retrieval or disclose derivatives. Outcome receipts are not live delivery observations. No production change or restored legacy runtime.

## Technical Decisions

Thin authenticated transports, bounded services owning PostgreSQL transactions, restricted app role/RLS, derived RuVector retrieval. Exact fields are specified in new contracts before code. Test nonzero behavior, compiler and lint separately. Development validation is direct self-checking, not independent review.

## Cross-Story Dependencies

1.2 follows verified 1.1, then 1.3, then 1.4 and a real retrospective before 2.1. Later replay/vector/correction/projection decisions stay in their owning stories. Local evidence does not prove deployment or live work status.

## Historical compiled snapshot (superseded execution limits)

Current sequence is [Epic 1 onward](../planning-artifacts/epics.md), not a continuation of legacy numbered delivery. This is a compiled planning context, not a live tracker.

- 1.1 local executable foundation: locally verified; nine package files reused unchanged. Not product/CI/release completion.
- 1.2 authority/service contracts: lowest unfinished story, ready for preparation after parent reconciles/commits the baseline for development continuation.
- 1.3 persistence/security contracts: not started; depends on 1.2 and concrete security/schema decisions.
- 1.4 foundation acceptance/handoff: not started; requires 1.1–1.3 accepted.

Read [PRD](../planning-artifacts/prds/prd-Allura_Memory-2026-10-25/prd.md), [architecture](../planning-artifacts/architecture.md), [readiness](../planning-artifacts/readiness.md), the concrete story, and [adapter](../../guidelines/ALLURA-BMAD.md). No legacy runtime restoration, operational-status fiction or generic reapproval of already approved numbering. Only exact unresolved product/security/schema decisions gate their dependent stories. Parent owns Git; preserve legacy STOP, protected UX and foundation bytes. Remote state unknown.
