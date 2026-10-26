---
title: '3.3 Evidence-linked pending proposals'
status: done
created: 2026-10-26
baseline_commit: 90d2c2e41f69f4000924e3fce6294b0dbcd62a28
---

# Intent and delegated contract

Generate bounded pending proposal versions from permitted captured evidence without activating semantic memory. Implement `foundation/migrations/004-proposals.sql`, `src/proposals.ts` and real `tests/proposals.test.ts`; reuse the current authority/scoped transaction rather than add a second security model. Existing immutable capture records remain untouched.

Given proposal:write and a permitted same-workspace captured event, create immutable version 1 plus evidence links, mutable current-version/pending projection and append-only proposal audit atomically. Requester and producer derive from current verified identity, never JSON. Later revisions preserve original requester, derive current producer and require exact prior version; only pending/needs_evidence can be revised. Changes append a version and audit, never update historical content. Unknown/foreign/unreadable evidence gives identical not_found with zero domain writes. Confidence is finite [0,1], submitter-supplied assessment labeled as such (absent becomes 0/unscored), not a measured model probability. Assertion kind observation/inference remains explicit. Score=1 cannot approve or create semantic state. Caller-supplied legacy promotion modes reject.

Raw-evidence boundary: own captured events, explicit evidence:read entitlement, or evidence already attached to a proposal visible via review:read may be linked. Guessing an unlinked event ID does not reveal/link it. Review:read grants linked proposal evidence only, not arbitrary raw traces. Proposal read returns content/provenance and evidence IDs; separate linked-evidence read returns one bounded exact source. Viewer memory:read alone sees no pending proposal or linked trace. No generated summary invents facts: the bounded capture-to-proposal helper uses verbatim captured content, labels observation/unscored and remains pending.

DOC-08: retained `RISKS-AND-DECISIONS.md:29` does not establish a historical approved curator-first route; AD-57 is not substitute evidence. This build implements the already-required backend proposal lifecycle, not a curator-first UI/delivery claim. Exact UI adoption/visual acceptance remains its owning epic; no new historical decision ID is invented. Current delegated design authority resolves these backend defaults.

# Acceptance

Real restricted PostgreSQL: pending-only score extremes and immutable versions; same-scope exact evidence; spoofed actors/legacy modes/NaN rejected; foreign/missing evidence indistinguishable; viewer/org-only denial and current revocation; curator can read linked evidence but not raw/unlinked; competing version writes yield one winner; audit failure rolls back versions/links/state/event. Typecheck/lint and nonzero required cases must pass before Epic3 retrospective.

## Verified local result

Implemented all named files and required cases. `admission3-proposals-red.log`: absent implementation exit1. `admission3-epic3-final.log`: `bun run check:all` exit0, 52 tests / 389 assertions, no fail/skip, TypeScript/ESLint pass; actual restricted PostgreSQL lane 34 tests / 255 assertions and exact owned container removal. Proposal tests exercise actual SQL functions, current authority/RLS, bounded verbatim generation, linked evidence reads, high-score pending state, input/authority negatives, two simultaneous version edits with one winner, immutable historical content, and audit injection proving all five affected table counts unchanged. No provider-generated confidence or independent review claimed. DOC-08 evidence limitation remains explicitly bounded to curator-first UI assertions; backend proposal acceptance does not claim that decision.
