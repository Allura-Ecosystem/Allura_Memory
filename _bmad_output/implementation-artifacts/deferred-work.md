# Deferred Work

## Deferred from: code review (2026-08-29) — triaged 2026-08-30

### DW-3: `audit.expected_events` used a nonexistent event vocabulary — resolved 2026-08-29
status: resolved
location: src/lib/harness/runner.ts (events recording + enforcement)
origin: 2026-08-29 code review (story 24.9)
resolution: The runner records engine events (`process_step_started`, `process_step_completed`, `process_step_failed`, `process_checkpoint_blocked`) on the receipt, enforces `audit.expected_events` as a subset check, and the three committed scenarios use the real vocabulary. The enforcement caught a bad scenario edit where a no-breakpoint scenario expected `process_checkpoint_blocked`, proving the assertion check runs.
remaining_scope: none — this record is preserved for governance history.

### DW-1: Harness `policy_expectations` were self-fulfilling
status: resolved
location: src/lib/harness/runner.ts:320-354, 538-544
origin: 2026-08-29 four-layer review
resolution: Each declared `policy_id` is validated through `findPolicyById()` against `CANONICAL_POLICIES`. The declared allow/deny decision is compared with the fixture's observed success or `POLICY_DENIED` outcome. Violations are collected during execution and reported after the ProcessEngine reaches a terminal state, preventing engine step-failure handling from masking the assertion. Focused suite: 33 harness tests passed; all 12 scenario fixtures produced expected terminal statuses.
remaining_scope: This is a deterministic harness evidence check, not direct invocation of a full production authorization engine. Production-policy-engine execution is not needed to make scenario declarations truthful and remains a future architecture decision.

### DW-2: Link guard had false-positive/false-negative classes
status: resolved
location: .github/scripts/docs-backend-residue-guard.sh:165-238
origin: 2026-08-29 four-layer review
resolution: `check_links()` strips fenced and inline code before scanning, resolves relative inline/titled links and reference-style definitions, and keeps anchors/external URLs outside scope. The success message names its deliberate multi-line inline-link limitation instead of claiming universal Markdown resolution. Repository guard passed; isolated proof passed valid inline/titled/reference links, ignored code-only links, and rejected a broken reference link.
remaining_scope: Multi-line inline targets, anchor validation, remote URLs, and a general Markdown parser remain intentionally out of scope.
