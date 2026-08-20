# Story 24.10: CI Gate Integrity and Branch Protection

**Status:** ready-for-dev
**Priority:** P0-Critical
**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Gate:** A — Truthful baseline
**Depends on:** 24.1
**Opened:** 2026-08-20
**group_id:** allura-system

## Story

As a reviewer assessing whether this project's quality claims are trustworthy, I
need every green check to correspond to a test that actually ran and actually
passed, and I need the checks that matter to be enforceable, so that "CI is
green" is evidence rather than decoration.

## Why This Exists

Found during Story 24.3 remediation, by a Team RAM audit of all 14 workflows.
Two independent problems, either of which alone invalidates the Gate A claim:

1. **Four lanes report green while suppressing test failures.** 28
   `continue-on-error` occurrences across 7 workflow files. In four cases the
   suppression sits on the step that runs the tests, so the check is green
   regardless of the result.
2. **`main` has no branch-protection rule.** `gh api
   repos/Allura-Ecosystem/Allura_Memory/branches/main/protection` returns
   `404 Branch not protected`. No status check is required to merge.

Three of the four suppressions were traced to rationales that no longer hold.
`mcp-testing.yml`'s e2e suppression was added for "missing DB schema migration
in CI" — the exact defect fixed in `3e2ba2b2`. The workaround outlived its cause.

`epic-24-evidence.yml` is NOT affected: it carries no suppression and the
controlled-red run in Story 24.1 genuinely demonstrated it fails on a broken
change. This story does not reopen 24.1's evidence; it addresses the lanes
around it and the absence of enforcement.

## Dangerous Lanes

| Workflow | Job | Step | Consequence today |
|---|---|---|---|
| `ci.yml` | `test-e2e` | Run E2E tests | Any live-DB regression merges with a green flagship check |
| `mcp-testing.yml` | `e2e-tests` | Run E2E tests | Same, one workflow over; duplicate of the above |
| `mcp-testing.yml` | `unit-tests` | Run unit tests | Redundant with `ci.yml test-unit` today; sole record if that job is ever consolidated |
| `check.yml` | `check` | Unit & Integration | `test:unit && test:integration` chained in one suppressed step — a unit failure means integration never runs, and neither is visible |

Correctly informational, leave alone: `allura-hosted-ci.yml`, `brand-audit.yml`,
`skill-triage.yml`, `nextjs_bundle_analysis.yml` (report step only). Each is
documented as non-blocking at the file level — that is the pattern to copy.

## Acceptance Criteria

- [ ] AC-1: `continue-on-error` is removed from the four lanes above, or the lane
      is retired. Every remaining `continue-on-error` in `.github/workflows/`
      carries a comment stating why it is informational.
- [ ] AC-2: `check.yml`'s chained step is split so `test:unit` and
      `test:integration` fail independently and visibly.
- [ ] AC-3: A decision is recorded on the two duplicate e2e lanes (`ci.yml
      test-e2e` vs `mcp-testing.yml e2e-tests`) — one survives as the source of
      truth, or both gate with a documented reason for keeping both.
- [ ] AC-4: All newly-unsuppressed failures are triaged. These lanes have been
      hiding real results; expect unknown breakage. Each surfaced failure is
      either fixed or converted into a tracked issue with an explicit owner.
      No failure is re-suppressed to make the lane green.
- [ ] AC-5: Branch protection on `main` requires an explicit check list, applied
      only AFTER AC-1..AC-4 pass. Requiring a check that cannot fail formalizes
      false confidence rather than removing it.
- [ ] AC-6: The required-check list is documented in
      `docs/portfolio/evidence-index.md` alongside the run evidence.
- [ ] AC-7: A controlled-red demonstration proves branch protection blocks a
      merge, mirroring 24.1 AC-10 — this time proving prevention, not detection.
- [ ] AC-8: No portfolio document describes any check as "required" unless
      branch protection actually requires it.

## Out of Scope

- Fixing the underlying test flakiness that motivated the original suppressions,
  beyond triaging what AC-4 surfaces. Genuinely flaky tests may be quarantined
  with an owner and a tracking issue rather than fixed here.
- Adding new test coverage. This story makes existing coverage honest.
- Changing `epic-24-evidence.yml`, which already gates hard.

## Validation and Evidence

The evidence artifact must be a before/after table naming every lane, its
suppression state, and whether it is required by branch protection. A passing
summary without that table is insufficient — the point of this story is that a
green summary is exactly what cannot be trusted.

## Dev Agent Record

**Status:** pending
