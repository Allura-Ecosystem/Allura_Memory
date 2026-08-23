# Story 25.1 Retrospective — Scope and Product Truth Documentation Loop

**Status:** Done — independent Pike/Fowler review approved 2026-08-23.

## Outcome

Story 25.1 established a truthful, tested documentation authority model for Epic 25:

```text
Notion = scope, acceptance criteria, and decisions
Repository = versioned implementation, tests, and commit-bound evidence
```

The canonical Notion page is:

```text
3c41d9be-65b3-819b-96c6-c9d14a3424ea
https://app.notion.com/p/Epic-25-Governed-Curator-Review-Console-3c41d9be65b3819b96c6c9d14a3424ea
```

The dangling `docs/allura/DEVELOPMENT-LOOP.md` reference was removed from the canonical Notion page and repository current-state text. The file remains intentionally absent because creating it would violate the repository’s closed six-document rule.

## Evidence

- `bun run epic25:drift`: PASS; epic planning, eight story files, and sprint status agree.
- `bun run test:epic25:drift`: 2 files / 9 tests passed.
- `bun run typecheck`: passed.
- `git diff --check`: passed.
- Independent Pike/Fowler review: APPROVE.

## What was corrected

- Reconciled Notion/repository ownership rather than leaving competing canonical claims.
- Corrected stale current-state statements that said the drift gate was red while preserving Woz’s historical handoff through an attributed Brooks Gate Addendum.
- Corrected `REQ-CUR-005` to trace the governed decision/receipt delivery story (`25.6`) alongside relevant prerequisites.
- Added durable fixture coverage for dependency membership, status, dependency, range, block, and malformed-input drift cases.
- Recorded AD-57 through AD-63 transparently: unsourced entries remain Proposed instead of receiving invented rationale.

## Lessons

1. A planning gate needs executable fixtures; narrative controlled-red evidence is not durable regression coverage.
2. Post-handoff edits belong in an attributed addendum, not in rewritten builder evidence.
3. A missing reference in the source of truth is an authority defect, not a repository-only typo.
4. Documentation authority must be explicit by artifact class; "Notion canonical" cannot mean repository implementation evidence is optional.

## Remaining boundaries

- Story 25.2a remains `dependency-blocked`; 25.1 completion does not satisfy its declared Epic 24 authority prerequisites or mark it Done.
- Story 24.4 atomic-promotion remediation is a separate uncommitted workstream and must be independently validated/reviewed before decision/receipt stories advance.
- Epic 25 is not Done.

## Next action

Complete and merge Story 24.4’s canonical database-controlled decision boundary, then progress the next dependency-ready Epic 25 implementation story.
