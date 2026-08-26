# Epic 25 BMad Completion Loop (worktree-scoped)

## Mission
Drive **Epic 25 — Governed Curator Review Console** to Done through the BMad
lifecycle, one story at a time in dependency order:

```
25.2a → 25.3 → 25.4 → 25.5 → 25.6 → 25.7   (25.1, 25.2b already done)
```

Each story runs: dev-story (RED→GREEN→REFACTOR) → Jobs scope gate → Pike/Fowler
review (+Knuth when data/schema changes) → Brooks reconciliation → findings-only
code-review artifact → factual story/sprint update → **then** the next story.

After all 8 stories are Done: final signed-in browser proof of `/dashboard/curator`,
independent final review (CA-24-12), one BMad retrospective, and an Allura Brain
outcome write/read-back. Notion story cards sync at closure.

## Current tracked state (source of truth: `_bmad/bmm/stories/sprint-status.yaml`)
- 25.1 done; 25.2b done; 25.2a changes-requested; 25.3–25.7 blocked.

## Hard rules
1. One story at a time, dependency order. Do not start 25.3 until 25.2a is Done.
2. Strict TDD: write a failing test first, then minimal implementation.
3. Only disposable PostgreSQL: container `allura-252a-disposable` @ 127.0.0.1:55432.
   Never touch a live DB or secret files.
4. No commit/push/reset/stash/checkout/clean/rebase unless explicitly instructed
   per story. Preserve all existing dirty 25.2a work.
5. Browser scope/role/decision success is always server-derived; fail closed.
6. Do not fabricate tool use, tests, screenshots, or story status. No status
   advancement without fresh, real evidence.
7. Keep docs lean: story, findings-only review, exact command/evidence pointers.
8. Stop and report a named blocker at the first unmet dependency or authority
   requirement. Do not invent a workaround that broadens scope.

## Per-story gate
- [ ] Jobs scope/acceptance reviewed
- [ ] RED test written and failing
- [ ] GREEN implementation
- [ ] Focused tests + typecheck + relevant disposable DB proof
- [ ] Frozen diff
- [ ] Pike/Fowler (and Knuth if data/schema) review
- [ ] Findings-only `25-x-code-review.md`
- [ ] Story + sprint ledger status updated only with fresh proof

## Loop discipline
- If a story cannot advance on real evidence, do not mark it Done. Record the exact
  blocker and move to report.
- If Woz scope is enormous (e.g. 25.2a), finish ONE verifiable slice, then report
  progress before continuing — do not burn the whole budget silently.

## Worktree
- Repo: `/mnt/projects/git/Allura-Ecosystem/Allura_Memory/.worktrees/epic-25-bmad-closure`
- Branch: `feat/epic-25-bmad-closure`
- 74 dirty files are the uncommitted 25.2a remediation; preserve them and reconcile.
