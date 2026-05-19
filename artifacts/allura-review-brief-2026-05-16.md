# /allura Review Brief — 2026-05-16

## Mission
Validate that `/allura` is trustworthy in-browser before the Kanban card moves from In Review to Done.

## Source Of Truth
- `DESIGN.md` is the brand/design authority.
- `artifacts/allura-runtime-trust-evidence-2026-05-16.md` is the current evidence pack.
- `src/app/(main)/allura/page.tsx`, `src/app/(main)/allura/layout.tsx`, `src/lib/graph-adapter/neo4j-adapter.ts`, `src/styles/presets/allura.css`, and `src/styles/brand-tokens.css` are the implementation surfaces under review.

## Current Board State
- Notion card: `P0 — Track and complete 6420→3334/3100 route parity map`
- Status: In Review
- Evidence comments already attached per `artifacts/allura-runtime-trust-evidence-2026-05-16.md`.
- Do not move to Done without explicit review verdicts and Ralph/IRIS CEO validation.

## Required Review Payload
Return a structured result:
- Verdict: APPROVED, NOT APPROVED, or BLOCKED
- Scope reviewed
- Checklist results
- Evidence inspected or commands run
- Blocking findings
- Non-blocking findings
- Required next action

## Constraints
- Do not fabricate data or approval.
- Do not mark Done.
- Do not rewrite unrelated code.
- If editing is necessary, only fix blockers in the assigned scope and list changed files.
