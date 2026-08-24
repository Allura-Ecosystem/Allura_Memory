# Story A-1.1 — Agent Sync Drift Fix

**Status:** Planned
**Owner:** Woz + Knuth
**Depends on:** —
**Blocks:** A-1.2, A-1.3, A-1.4

## Outcome

`agents/` (Claude-native) and `.opencode/agent/` (OpenCode-native) are reconciled — `agent-sync-check.sh` passes with zero drift.

## Acceptance Criteria

- [ ] Every agent in `agents/` has a corresponding definition in `.opencode/agent/`.
- [ ] Every agent in `.opencode/agent/` has a corresponding definition in `agents/`.
- [ ] Agent definitions produce identical behavior in both runtimes.
- [ ] `agent-sync-check.sh` exits 0 with no drift reported.
- [ ] Drift detection runs in CI and blocks on failure.

## Evidence

- `agent-sync-check.sh` output showing zero drift.
- CI sync check green.

## Rollback

Agent surfaces may drift. Manual reconciliation required.