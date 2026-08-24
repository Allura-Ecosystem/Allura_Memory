# Story P-1.2 — Eval Fixture Expansion

**Status:** Planned
**Owner:** Woz + Fowler
**Depends on:** P-1.1
**Blocks:** P-1.5

## Outcome

Eval fixture coverage expands beyond the current 5 agents to cover all installed agents with pass/fail evidence.

## Acceptance Criteria

- [ ] Eval fixtures exist for every agent defined in the plugin catalog.
- [ ] Each fixture has a pass/fail verdict with evidence.
- [ ] Eval results are reproducible — same input produces same verdict.
- [ ] Eval CI lane runs on every push and reports coverage.

## Evidence

- Eval fixture inventory.
- Reproducibility test results.
- CI eval lane output.

## Rollback

Reduce eval coverage to 5 agents. Plugins remain functional; coverage is reduced.