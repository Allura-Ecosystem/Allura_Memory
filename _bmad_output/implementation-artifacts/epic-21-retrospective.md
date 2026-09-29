# Epic 21 Retrospective — Retrieval Drift Audit + Curation Scheduling

**Date:** 2026-07-27
**Epic:** 21 — Retrieval Drift Audit + Curation Scheduling
**Status:** Complete
**Owner:** Brooks (dispatched via Hermes delegate_task as Hightower + Woz)

## What Went Well

1. **Existing infrastructure was solid.** The watchdog, content-aware curator, and auto-recovery engine were all already built by Brooks. This epic was wiring and scheduling, not greenfield code.

2. **Scheduling stories were fast.** Creating systemd unit files and timers is mechanical once you know the patterns. Stories 21.1 and 21.2 were done in the first pass.

3. **Drift alerting integrated cleanly.** The auto-recovery engine's `RecoveryDeps` injection pattern made it easy to add drift detection without modifying the core recovery loop. The `classifyDriftType` and `decideDriftRecoveryAction` functions slot in naturally.

4. **Tests passed on first run.** 24/24 drift-recovery tests, 39/39 auto-recovery tests, 11/11 curator-metrics tests. The mock patterns from existing tests were easy to follow.

## What Didn't Go Well

1. **Subagent timeout.** The first dispatch (Hightower) ran out of time after 2/5 stories. Had to re-dispatch for the remaining 3. The 5-minute timeout on delegate_task is tight for 5 stories with implementation + tests.

2. **Story 21.5 status not updated.** The subagent wrote the route and test but didn't mark the story as done. Had to manually update the status. The "mark done" step needs to be more prominent in the brief.

3. **Sprint status not updated by subagent.** The subagent updated individual story files but didn't update sprint-status.yaml. The parent had to handle this.

4. **No retrospective written by subagent.** Ran out of time before writing the retrospective. Parent wrote this one.

## Lessons Learned

- **Split epics into smaller dispatches.** 5 stories per subagent is too many for a 5-minute timeout. 3 stories is the sweet spot.
- **"Mark done" must be in the brief as a hard step.** Subagents skip it when rushed.
- **Sprint status updates should be automated.** A post-story hook that updates sprint-status.yaml would prevent this gap.
- **Existing code patterns are the best documentation.** The subagent followed existing test mock patterns perfectly — no guidance needed.

## What Shipped

- `scripts/systemd/allura-curator-watchdog.service` — 5-minute interval, journald logging
- `scripts/systemd/allura-content-curator.service` + `.timer` — 6-hour cycle
- `scripts/systemd/allura-drift-audit.service` + `.timer` — daily 03:00 ET
- `scripts/run-drift-audit.sh` — 6-check drift audit script
- `src/lib/healing/auto-recovery.ts` — drift detection + recovery integration
- `src/app/api/curator/metrics/route.ts` — curation metrics endpoint
- 3 test files: drift-recovery (24 tests), auto-recovery (39 tests), curator-metrics (11 tests)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-27 | Retrospective written | Gilliam |