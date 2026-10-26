---
title: '4.3 Governed corrections and immutable supersedes'
status: done
created: 2026-10-26
baseline_commit: 50b25f35fb1d2b26e580e7cc1757af3df25e2b79
---

# AD-67 delegated local disposition

Brooks/direct builder owns interface/data defaults; implements `migrations/006-corrections.sql`, `src/corrections.ts`, tests. New local typed correction API, not restored retired memory_update or a deployed compatibility change. Consumer mapping/inventory remains 6.2. Fields: baseMemoryId UUID (exact semantic version), expectedBaseVersion canonical positive decimal string, content <=12000 bytes, rationale <=4000 bytes, 1–31 evidenceIds (one extra immutable correction-evidence record is added), operationKey same bounded ASCII syntax as capture. Optional proposalId/expectedProposalVersion edits a pending correction with explicit new base/evidence and a new immutable version. No automatic rebase.

Current proposal:write + memory:read; actor server-derived. Submission rechecks visible base/current head and version, appends correction evidence, pending proposal/version, version-specific immutable base binding and submission receipt atomically. Key namespace group/workspace/principal/correction/key, SHA256 normalized exact payload; same input replays immutable submission bytes even after head changes, changed payload conflicts. Foreign/missing base indistinguishable. Generic proposal revision cannot drop correction binding; use correction API to refresh it. Receipt means pending_review, never semantic promotion.

Independent human decision rechecks both exact reviewed proposal version and bound base/current head under locks. Approve creates immutable semantic version n+1 in the same knowledge identity, immutable supersedes edge to the former head, exact provenance, decision event/receipt/internal intent and atomic head switch. No old content or lineage edge is mutated. Two corrections of one head cannot both win. Losing proposal stays pending until explicitly refreshed and independently re-reviewed. Reject/request_evidence do not mutate semantic head.

Tests must prove submission replay/stale no-write; pending-only and raw source evidence; correction/head/version concurrency; immutable old versions/edges; explicit refresh with new reviewed version; failure at supersedes/head/receipt rolls back. DOC-03 restore and DOC-05 duplicate policy remain 4.4, not silently decided here. No external transfer or production action.

## Verified local acceptance

`admission3-corrections-red.log` exit1 before implementation. `admission3-story4.3-final.log`: `bun run check:all` exit0, 68 tests / 524 assertions, zero failures/skips, typecheck/ESLint; restricted PostgreSQL lane50/390 and owned container removal. Seven correction cases exercise all named criteria, including simultaneous different corrections (one winner), explicit losing-proposal refresh to version2/base2 then independent approval to semantic version3, immutable two-edge lineage, receipt injection rollback across all submission tables and lineage injection rollback before head change. Existing decision tests continue to prove rollback at every durable boundary after the forward function replacement. Real signed HTTP exercises curator correction → independent reviewer exact base/content context → approval. Review context now includes bound base content and current head, not only an opaque ID. Generic proposal edits cannot discard correction binding. No historical migration001–005 rewritten; no browser UI or deployment claim.
