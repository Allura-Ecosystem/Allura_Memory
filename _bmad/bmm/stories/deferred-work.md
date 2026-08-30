# Deferred Work

## Deferred from: code review (2026-08-29) — triaged 2026-08-29

### DW-1: Harness `policy_expectations` are self-fulfilling
status: open
location: src/lib/harness/runner.ts:317
origin: 2026-08-29 code review (stories 24.5/24.9)
note: The runner records `pe.expected_decision` verbatim when `at_step` matches;
  no policy engine is consulted. Receipt `policy_decisions` are echoes of the
  scenario file. Enforcing real policy evaluation requires wiring the harness
  to the actual policy engine (POL-001..POL-00n) — a scope change to the
  harness contract, deferred to a future story. Related: examples reference
  POL-004 / POL-007; a policy-engine consult would validate them.

### DW-2: Link guard scope
status: open
location: .github/scripts/docs-backend-residue-guard.sh (check_links)
origin: 2026-08-29 code review (story 24.8)
note: `check_links` misses reference-style links, multi-line link targets, and
  links inside fenced code blocks; the OK message claims "all internal links
  resolve" which overstates coverage. Regex-based; a markdown-aware parser
  (e.g. remark) is the proper fix. Deferred: the guard is CI-critical and the
  regex covers all current docs (verified 2026-08-29); parser migration is a
  standalone change.

### DW-3: `audit.expected_events` uses a nonexistent event vocabulary — RESOLVED
status: done
location: src/lib/harness/runner.ts (events recording + enforcement)
origin: 2026-08-29 code review (story 24.9)
resolved: 2026-08-29
resolution: The runner now records engine events (process_step_started /
  process_step_completed / process_step_failed / process_checkpoint_blocked)
  on the receipt, enforces `audit.expected_events` as a subset check, and the
  3 committed scenarios use the real vocabulary. The enforcement immediately
  caught a bad scenario edit (checkpoint-recovery-after-failure expected
  process_checkpoint_blocked but has no approval breakpoints) — proving the
  check works. Schema documents the vocabulary via examples.