# Watchdog Scheduled — Story 21.1 Evidence

**Date:** 2026-07-27
**Story:** 21.1 — Schedule the Curator Watchdog
**Status:** done

## What was done

The existing systemd unit at `scripts/systemd/allura-curator-watchdog.service` was updated to match Story 21.1 acceptance criteria:

- **AC-1:** Unit file exists at `scripts/systemd/allura-curator-watchdog.service` (verified + updated).
- **AC-2:** `ExecStart` now runs `bun src/curator/watchdog.ts --interval 300 --group-id allura-system` (5-minute cycle). Previous value was `--interval 1800` (30 min).
- **AC-3:** Install commands documented below. The unit is NOT installed as a running service in this environment (per task constraints — files only, no install).
- **AC-4:** `StandardOutput=journal` + `StandardError=journal` + `SyslogIdentifier=allura-curator-watchdog` ensure logs go to journald, queryable via `journalctl -u allura-curator-watchdog`.
- **AC-5:** Once installed and running for 15 minutes, verify with:
  ```sql
  SELECT count(*) FROM canonical_proposals
  WHERE status='pending' AND created_at > NOW() - INTERVAL '15 minutes';
  ```
- **AC-6:** The watchdog SQL query already filters out system events, k6 load test events, and proposal artifacts (see `src/curator/watchdog.ts` lines 40-48).

## Install commands (NOT run in this environment — documented for ops)

```bash
sudo cp scripts/systemd/allura-curator-watchdog.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now allura-curator-watchdog

# Verify
systemctl status allura-curator-watchdog
journalctl -u allura-curator-watchdog -f
```

## Unit file diff

- `WorkingDirectory` corrected to `/media/ronin704/Games/Repos/team_durham-clean/allura-memory`
- `--interval 1800` → `--interval 300` (5-minute cycle per AC-2)
- Added `StandardOutput=journal`, `StandardError=journal`, `SyslogIdentifier` for journald logging (AC-4)
- Added `Wants=network-online.target` and `After=...postgresql.service` for proper ordering