---
title: '4.1 Exact-version independent human decisions'
status: done
created: 2026-10-26
baseline_commit: a1bf6ec27e078311f63f997621a06e3b726d7f0c
---

# Contract and implementation plan

Implement `foundation/migrations/005-decisions.sql`, `src/decisions.ts`, `src/review-api.ts` and real `tests/decisions.test.ts`. Approved DOC-06 is binding: a new decision requires exact reviewedProposalVersion; stale conflict writes nothing. Human-only current review:approve AND review:read, distinct from requester/producer. As a defensive independence default, capture authors referenced by that version also cannot approve/reject/request evidence on their own material. No machine, role title or score substitutes for human authority.

Input allowlist: proposalId UUID, reviewedProposalVersion positive integer, operationKey 1–128 ASCII [A-Za-z0-9._:-], decision approve/reject/request_evidence, nonblank rationale <=4000 UTF-8 bytes, 1–32 unique same-version linked evidence UUIDs. Evidence arrays normalize to sorted set order. Client cannot specify semantic content/reviewer/target version. Semantic content comes exclusively from the exact immutable reviewed proposal. Reject and request_evidence require rationale/evidence too; request_evidence is pending-needs-evidence, not disguised rejection.

Replay scope `(group,workspace,authenticated reviewer,human_decision,key)`; SHA256 of normalized proposal/version/decision/rationale/evidence tuple plus scope/reviewer. Same digest returns persisted exact receipt bytes after current authorization; new payload same key conflicts. Replay lookup precedes current proposal-version conflict, preserving original decision-time receipt after later proposal edits. No TTL/deletion. Missing/foreign proposal is uniform not_found; error detail never returns SQL or foreign metadata.

Fresh approval creates one immutable semantic version/root knowledge head, provenance links to the exact reviewed proposal/evidence, decision event, immutable receipt and internal semantic-processing intent in the same transaction. No destination or external transfer is enabled. Mutable proposal state is only a projection. Initial semantic lifecycle is current; corrections/supersedes are 4.3 and deletion/restore/duplicate policy 4.4. Declared schema supports later forward migrations, never in-place content rewriting. Story4.2 adds full fault-boundary/concurrent atomicity proof before this becomes Epic4 acceptance.

Local human route is bounded POST `/api/review/decision`, plus exact proposal/evidence read POSTs using existing signed-human/same-origin gateway. This is a fresh local consumer contract, not a claim of historical curator-first delivery or compatibility with an installed UI. Browser UI remains later scope.

# Acceptance

Positive approve/reject/request-evidence, current explicit entitlement, no self/machine/role-only/foreign decisions, stale no-write, exact replay and changed-key conflict, replay after revised proposal, current revocation denial, actual loopback signed HTTP+CSRF and unchanged historical content. Full typecheck/lint/required nonzero tests. No independent development reviewer.

## Verified result

`admission3-decisions-red.log` exit1 precedes implementation. `admission3-story4.1-final.log`: `bun run check:all` exit0, 57 tests / 433 assertions, zero fail/skip, typecheck/ESLint; restricted PostgreSQL lane39/299, owned container cleanup. All named cases above exercised with actual restricted SQL and signed loopback HTTP. Source-author independence is tested with a different proposal requester/producer, not just duplicate self-review coverage. Current receipt bytes survive request-evidence→new-version and replay still denies after entitlement revocation. Semantic data is exact reviewed proposal content, not client-supplied approval content. Basic atomic schema/transaction implemented here; exhaustive durable-boundary and concurrency/crash proof follows in Story4.2 before corrections. No deployed human approval or live semantic promotion performed; fixtures are synthetic and disposable.
