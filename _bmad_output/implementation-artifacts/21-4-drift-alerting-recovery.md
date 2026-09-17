# Story 21.4 — Drift Alerting + Auto-Recovery Integration

**Status:** done
**Owner:** Brooks → Woz + Bellard
**group_id:** allura-system
**Epic:** 21
**status_evidence:** "Added drift check to auto-recovery.ts: classifyDriftType, decideDriftRecoveryAction, executeDriftRecovery, runDriftRecoveryCycle. Queries RETRIEVAL_DRIFT events, classifies into index_drift/missing_promotions/schema_mismatch, attempts re-index/trigger-watchdog/alert. 3-strike escalation to DRIFT_ESCALATION. 24/24 drift-recovery tests pass, 39/39 existing auto-recovery tests pass."

## User Story

As the Allura reliability lead, I need drift alerts to feed into the auto-recovery engine, so that detected degradation triggers remediation automatically without human intervention.

## Context

- `src/lib/healing/auto-recovery.ts` exists — checks PostgreSQL, MCP container, disk, memory
- Recovery actions: restart-mcp, brain-recover, clear-stale-connections
- The drift audit (Story 21.3) writes ALERT events to Allura Brain
- The auto-recovery engine does NOT currently read drift alerts — it only checks infrastructure health

## Acceptance Criteria

- [x] AC-1: The auto-recovery engine checks for recent `RETRIEVAL_DRIFT` events in Allura Brain
- [x] AC-2: When a drift alert is detected, the engine attempts remediation based on drift type: index drift → re-index, missing promotions → trigger watchdog, schema mismatch → alert only (no auto-fix)
- [x] AC-3: Recovery attempts are logged to `recovery_events` table with `component=drift_audit`
- [x] AC-4: After 3 failed recovery attempts, the engine escalates to a human alert via Brain memory_add with `event_type=DRIFT_ESCALATION`
- [x] AC-5: Unit tests verify: drift event triggers recovery, 3-strike limit works, escalation fires

## Tasks

1. Read `src/lib/healing/auto-recovery.ts` to understand the recovery loop
2. Add a drift check function that queries `events WHERE event_type='RETRIEVAL_DRIFT' AND created_at > NOW() - INTERVAL '1 hour'`
3. Add recovery actions for drift types
4. Create `src/__tests__/drift-recovery.test.ts`
5. Run `bun run typecheck && bun test`

## File List

- `src/lib/healing/auto-recovery.ts` (MODIFY — add drift check)
- `src/__tests__/drift-recovery.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |