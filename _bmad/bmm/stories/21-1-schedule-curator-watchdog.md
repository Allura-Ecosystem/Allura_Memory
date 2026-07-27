# Story 21.1 — Schedule the Curator Watchdog

**Status:** ready-for-dev
**Owner:** Brooks → Hightower
**group_id:** allura-system
**Epic:** 21

## User Story

As the Allura ops lead, I need the curator watchdog running continuously via systemd, so that unpromoted events are automatically scored and proposals are created without manual intervention.

## Context

- `src/curator/watchdog.ts` exists with `--interval` flag (default 60s)
- Commit `9f500b32` shipped a `curator-watchdog` systemd unit (#60)
- It's unclear if the systemd unit is active on this machine or the laptop
- The watchdog polls for unpromoted events, scores them, and creates proposals in `canonical_proposals`

## Acceptance Criteria

- [ ] AC-1: A systemd unit file exists at `scripts/systemd/allura-curator-watchdog.service` (or verify the existing one)
- [ ] AC-2: The unit runs `bun src/curator/watchdog.ts --interval 300 --group-id allura-system` (5-minute cycle)
- [ ] AC-3: The unit is enabled and active — `systemctl status allura-curator-watchdog` shows `active (running)`
- [ ] AC-4: Logs are written to journald and can be queried with `journalctl -u allura-curator-watchdog`
- [ ] AC-5: After 15 minutes of running, `canonical_proposals` table has new proposals that didn't exist before
- [ ] AC-6: The watchdog does NOT process system events, k6 load test events, or proposal artifacts (already filtered in the SQL query)

## Tasks

1. Check if systemd unit exists at `scripts/systemd/allura-curator-watchdog.service`
2. If missing, create it — template at `scripts/systemd/allura-memory-stack.service.template`
3. Install: `sudo cp scripts/systemd/allura-curator-watchdog.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now allura-curator-watchdog`
4. Verify: `systemctl status allura-curator-watchdog`
5. Wait 15 minutes, check `SELECT count(*) FROM canonical_proposals WHERE status='pending' AND created_at > NOW() - INTERVAL '15 minutes'`
6. Document in runbook

## File List

- `scripts/systemd/allura-curator-watchdog.service` (NEW or VERIFY)
- `docs/archive/allura/evidence/watchdog-scheduled-2026-07-26.md` (NEW — evidence)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |