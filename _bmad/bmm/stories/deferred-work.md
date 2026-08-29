# Deferred Work

## Deferred from: code review (2026-08-29)

- **Harness `policy_expectations` are self-fulfilling** — the runner records `pe.expected_decision` verbatim when `at_step` matches; no policy engine is consulted. Receipt `policy_decisions` are echoes of the scenario file. Pre-existing harness design; enforcement of real policy evaluation is a separate concern. (stories 24.5/24.9)
- **Link guard scope** — `check_links` misses reference-style links, multi-line link targets, and links inside fenced code blocks; the OK message claims "all internal links resolve" which overstates coverage. Pre-existing guard scope; a markdown-aware parser is the proper fix. (story 24.8)
- **`audit.expected_events` uses a nonexistent event vocabulary** — scenarios expect `["proposal_approved"]` but the engine emits `process_step_started`/`process_step_completed`/`process_checkpoint_blocked`. Even if assertions were enforced, these would never match. Requires aligning the scenario contract with the engine's actual event names. (story 24.9)
