# Drift Audit Scheduled — Evidence

**Date:** 2026-07-27
**Story:** 21.3 — Schedule the Retrieval Drift Audit
**Owner:** Brooks → Bellard
**group_id:** allura-system

## What Was Done

1. Created `scripts/run-drift-audit.sh` — a bash script that runs 6 drift checks:
   - Check 1: Subsystem health (HTTP GET /api/health/ready)
   - Check 2: Count parity (events vs canonical_proposals)
   - Check 3: Index coverage (trace_ref coverage on proposals)
   - Check 4: Reader/writer schema parity (core tables present)
   - Check 5: Public API round-trip (brain health endpoint)
   - Check 6: Legacy compatibility (pgvector extension available)

2. Created systemd timer: `scripts/systemd/allura-drift-audit.timer`
   - Runs daily at 03:00 (ET) — low-traffic window
   - `Persistent=true` ensures missed runs execute on next boot
   - `RandomizedDelaySec=300` prevents thundering herd

3. Created systemd service: `scripts/systemd/allura-drift-audit.service`
   - `Type=oneshot` — runs once per timer activation
   - `SuccessExitStatus=0 1` — exit 1 (drift detected) doesn't mark as failed
   - Logs to journald via `SyslogIdentifier=allura-drift-audit`

4. The script writes results to Allura Brain:
   - `event_type=DRIFT_AUDIT` with metadata `{checks_passed, checks_failed, details}`
   - If any check fails: `event_type=RETRIEVAL_DRIFT` with severity
   - Daily log entry to `memory/YYYY-MM-DD.md`

5. The script supports `--group-id` flag for multi-tenant auditing (defaults to `allura-system`)

## Install Commands (not run in dev environment)

```bash
sudo cp scripts/systemd/allura-drift-audit.service /etc/systemd/system/
sudo cp scripts/systemd/allura-drift-audit.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now allura-drift-audit.timer
# Verify:
systemctl status allura-drift-audit.timer
systemctl list-timers | grep drift
```

## Acceptance Criteria Evidence

- **AC-1:** ✅ Timer configured for daily 03:00 ET (`OnCalendar=*-*-* 03:00:00`)
- **AC-2:** ✅ Script executes all 6 checks (subsystem health, count parity, index coverage, reader/writer parity, public API round-trip, legacy compatibility)
- **AC-3:** ✅ Results written to events table with `event_type=DRIFT_AUDIT` and metadata containing `checks_passed`, `checks_failed`, `details`
- **AC-4:** ✅ If any check fails, `event_type=RETRIEVAL_DRIFT` alert event is written with severity
- **AC-5:** ✅ Log entry written to `memory/YYYY-MM-DD.md` with audit summary
- **AC-6:** ✅ Default group_id is `allura-system`, `--group-id` flag supported for other tenants

## Files Created

- `scripts/run-drift-audit.sh` (NEW)
- `scripts/systemd/allura-drift-audit.timer` (NEW)
- `scripts/systemd/allura-drift-audit.service` (NEW)