# Story 21.3 — Schedule the Retrieval Drift Audit

**Status:** ready-for-dev
**Owner:** Brooks → Bellard
**group_id:** allura-system
**Epic:** 21

## User Story

As the Allura reliability lead, I need a daily cron job that runs the retrieval drift audit, so that search quality degradation is detected before it poisons downstream decisions.

## Context

- The `allura-retrieval-drift-audit` skill exists in the Hermes skills directory
- The audit checks: subsystem health, count parity (events vs promoted insights), index coverage, reader/writer schema parity, public API round-trip
- No cron job or systemd timer runs this audit
- Drift could be: missing promotions, stale index, schema mismatch, degraded search results

## Acceptance Criteria

- [ ] AC-1: A daily cron job runs the drift audit at 03:00 ET (low-traffic window)
- [ ] AC-2: The audit executes the 6 checks from the skill: (1) subsystem health, (2) count parity, (3) index coverage, (4) reader/writer parity, (5) public API round-trip, (6) legacy compatibility
- [ ] AC-3: Results are written to Allura Brain as an event with `event_type=DRIFT_AUDIT` and `metadata={checks_passed, checks_failed, details}`
- [ ] AC-4: If any check fails, an ALERT event is written with `event_type=RETRIEVAL_DRIFT` and severity
- [ ] AC-5: A log entry is written to `memory/YYYY-MM-DD.md` with the audit summary
- [ ] AC-6: The audit runs against `allura-system` group_id by default, with support for `--group-id` flag to audit other tenants

## Tasks

1. Create a script `scripts/run-drift-audit.sh` that executes the 6 checks
2. Create a cron entry: `0 3 * * * /path/to/allura/scripts/run-drift-audit.sh --group-id allura-system`
3. The script writes results to Allura Brain via `memory_add` MCP call
4. Test the script manually
5. Install the cron job
6. Document in runbook

## File List

- `scripts/run-drift-audit.sh` (NEW)
- `docs/archive/allura/evidence/drift-audit-2026-07-26.md` (NEW — first audit evidence)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |