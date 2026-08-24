# Story P-1.3 — OpenCode Three-Way Sync

**Status:** Planned
**Owner:** Woz + Knuth
**Depends on:** P-1.1
**Blocks:** P-1.5

## Outcome

Claude, Codex, and OpenCode plugin surfaces are reconciled — drift between them is detected and reported, not silently accumulated.

## Acceptance Criteria

- [ ] Three-way sync script compares Claude-native, Codex-native, and OpenCode-native plugin surfaces.
- [ ] Drift is detected: missing files, mismatched versions, divergent definitions.
- [ ] Drift report is generated with specific differences and remediation steps.
- [ ] CI runs sync check on every push and blocks on drift.
- [ ] Sync can be run locally: `./harness-sync.sh --check`.

## Evidence

- Three-way sync script output.
- Drift detection test results.
- CI sync check output.

## Rollback

Disable sync check. Plugin surfaces may drift; manual reconciliation required.