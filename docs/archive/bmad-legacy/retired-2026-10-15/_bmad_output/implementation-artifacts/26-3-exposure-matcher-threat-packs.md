# Story 26.3 — Exposure Matcher and Current-Threat Packs

**Status:** Done — merged PR #109 (`9d66f9df`)
**Owner:** Woz + Knuth + Bellard
**Depends on:** 26.1, 26.2
**Blocks:** 26.4, 26.5

## Outcome

Match current threat advisories against the supply-chain inventory and produce deduplicated, evidence-backed exposure alerts.

## Acceptance Criteria

- [x] Matching is exact: package, version, hash, publisher, workflow reference, and indicators.
- [x] Fixtures cover: compromised dependencies, malicious install hooks, workflow/action drift, credential-exposure indicators, and AI tool/plugin compromise.
- [x] Alerts are deduplicated — one alert per unique exposure, not one per advisory match.
- [x] Each alert identifies: source, publication and fetch time, trust state, affected tenant/workspace, matched artifact, and supporting evidence.
- [x] A malicious or stale feed cannot activate a policy, execute code, or cross tenant boundaries.
- [x] Matching is read-only — no mutations, no policy activation.

## Implementation Status — 2026-08-27

Story file was stale ("Planned", all AC unchecked) despite merging 2026-08-26. Verified independently this session against `src/lib/exposure/{matcher,dedup,schemas,types}.ts` and re-ran the test suite: 19/19 tests passing (`bun vitest run src/lib/exposure`). Each AC checked only after confirming a matching, passing test — including the fail-closed cases, which are the highest-risk AC in this story.

## Evidence

- Matching engine tests with all fixture categories: `exposure-matcher.test.ts:57,79,101,124,146` (dependency/hook/workflow-drift/credential/AI-plugin).
- Deduplication tests: `exposure-matcher.test.ts:169,205`.
- Tenant isolation tests: `exposure-matcher.test.ts:229,314`.
- Stale/malicious feed fail-closed tests: `exposure-matcher.test.ts:356,384`.
- Full suite: 19/19 passing, re-verified 2026-08-27.

## Completion Notes

- agent: Brooks (documentation/verification pass; original implementation by Woz + Knuth + Bellard, PR #109)
- date: 2026-08-27
- files changed: `src/lib/exposure/matcher.ts`, `src/lib/exposure/dedup.ts`, `src/lib/exposure/schemas.ts`, `src/lib/exposure/types.ts`, `src/lib/exposure/__tests__/exposure-matcher.test.ts`, `docs/allura/DATA-DICTIONARY.md` (all merged 2026-08-26 in PR #109, `9d66f9df`); this session only corrected the stale story-file status/checkboxes.
- evidence: `bun vitest run src/lib/exposure` -> 19/19 passed, exit 0
- remaining gaps: none — all 6 acceptance criteria, including both fail-closed cases, have a corresponding passing test, verified 2026-08-27.

## Rollback

Disable the matcher. The inventory remains available; no alerts are generated.