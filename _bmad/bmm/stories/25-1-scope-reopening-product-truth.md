# Story 25.1 — Scope Reopening and Product Truth

**Status:** Planned
**Owner:** Brooks + Jobs
**Depends on:** Explicit scope approval
**Blocks:** 25.3–25.6

## Outcome

Turn the existing curator-first UX into one truthful, bounded implementation plan. Establish the governed development loop, canonical route inventory, brand/token contract, and Neo4j-sunset verification boundary before UI work begins.

## Acceptance Criteria

- [ ] `AD-46` is decided as a curator-first operator-surface slice; it does not authorize a broad dashboard restore.
- [ ] `AD-57` establishes the development loop, Definition of Ready/Done, and evidence-bundle convention.
- [ ] `/dashboard/curator` is the sole initial dashboard route; every other old dashboard route is classified as future, historical, or unsupported.
- [ ] `DESIGN.md` is source-grounded in `src/app/globals.css` and approved brand assets; no new visual brand is invented.
- [ ] All six canonical docs point to the same PostgreSQL-only and curator-first truth.
- [ ] A read-only `verify-neo4j-sunset.ts` integrity gate is specified; it distinguishes active violations from allowed historical references.
- [ ] No mutation endpoint, UI action, schema migration, or Notion status change is marked done by this story.

## Evidence

- Canonical-doc link and terminology sweep.
- `npx -y @google/design.md lint DESIGN.md` output.
- Route inventory artifact.
- Proposed Neo4j-sunset gate contract.

## Rollback

Documentation-only: revert the documentation commit. The engine and runtime behavior remain unchanged.
