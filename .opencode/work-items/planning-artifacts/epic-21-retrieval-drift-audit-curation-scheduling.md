# Epic 21 — Retrieval Drift Audit + Curation Scheduling

> [!NOTE]
> **AI-Assisted Documentation**
> This historical planning record was split from the prior combined epic rollup without changing its stated scope or acceptance content.
> Current delivery status is controlled by [`sprint-status.yaml`](../stories/sprint-status.yaml).
> When in doubt, defer to code, schemas, tests, and the authoritative sprint record.

**Lifecycle status:** Done — authoritative sprint status (retrospective complete)
**Owner:** Brooks (historical delivery record)
**group_id:** `allura-system`
**Migration note:** Source-preserving split from `epics.md` on 2026-08-28 to give every epic one planning file.

**Date:** 2026-07-26
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** The retrieval drift audit skill exists but doesn't run on a schedule — search quality could degrade silently. The curator scripts (auto-curator.js, curator-v3.js, content-aware-curator-v2.ts) exist but aren't scheduled — they're manual scripts. Wire both to cron/systemd so the brain self-monitors and self-curates without human intervention.

**Why now:** Brooks built the engines but left them as manual scripts. The watchdog (`src/curator/watchdog.ts`) has a `--interval` flag but no systemd unit or cron job running it. The content-aware curator has no scheduling at all. Without scheduled execution, the brain accumulates uncurated episodic memories and has no drift detection.

**Stories:**

- **21.1** Schedule the curator watchdog — create a systemd unit or cron job that runs `bun src/curator/watchdog.ts --interval 300 --group-id allura-system` every 5 minutes. This continuously scores unpromoted events and creates proposals. Verify the existing `curator-watchdog` systemd unit (#60) is active and wired to the right binary.
- **21.2** Schedule the content-aware curator — create a cron job that runs `bun scripts/content-aware-curator-v2.ts` every 6 hours. This auto-promotes eligible proposals based on category classification and score thresholds. Add `--group-id` flag support if missing. Log to `memory/YYYY-MM-DD.md`.
- **21.3** Schedule the retrieval drift audit — create a daily cron job that runs the `allura-retrieval-drift-audit` skill. The audit checks: (1) subsystem health, (2) count parity between events and promoted insights, (3) index coverage, (4) reader/writer schema parity, (5) public API round-trip for a known promoted ID. If drift is detected, write to Allura Brain as an ALERT event.
- **21.4** Add alerting on drift — when the drift audit detects degradation (missing promotions, index drift, schema mismatch), it writes an ALERT event to Allura Brain with `event_type=RETRIEVAL_DRIFT` and `metadata={component, drift_type, severity}`. The auto-recovery engine (`src/lib/healing/auto-recovery.ts`) picks this up and attempts remediation.
- **21.5** Add a curation metrics endpoint — `GET /api/curator/metrics` that returns: pending proposal count, oldest proposal age, auto-promotion rate (last 24h), rejection rate, drift audit status, watchdog health. This gives any agent or human a quick "brain health" check without a dashboard.

**Exit gate:**
- Curator watchdog runs every 5 minutes via systemd/cron — proposals are created automatically
- Content-aware curator runs every 6 hours — eligible proposals are auto-promoted
- Drift audit runs daily — results written to Allura Brain
- Alerts fire when drift is detected — auto-recovery engine responds
- Metrics endpoint returns brain health in a single API call
- Evidence: 7 days of scheduled execution logs with no manual intervention
