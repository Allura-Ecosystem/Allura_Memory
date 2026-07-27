# Content-Aware Curator Scheduled — Story 21.2 Evidence

**Date:** 2026-07-27
**Story:** 21.2 — Schedule the Content-Aware Curator
**Status:** done

## What was done

### 1. Added `--group-id` flag to `scripts/content-aware-curator-v2.ts` (AC-2)

- CLI arg parsing added: `--group-id` flag with validation against `^allura-[a-z0-9-]+$`
- When provided, the curator scopes proposals to that tenant only: `WHERE status = 'pending' AND group_id = $1`
- When omitted, processes all non-test tenants (existing behavior preserved)

### 2. Created systemd timer + service (AC-1)

- `scripts/systemd/allura-content-curator.timer` — runs every 6 hours (`OnCalendar=*-*-* 00/6:00:00`)
- `scripts/systemd/allura-content-curator.service` — oneshot service that runs the curator with `--group-id allura-system`
- `Persistent=true` ensures missed runs execute on next boot
- `RandomizedDelaySec=300` avoids thundering herd

### 3. Category rules enforced (AC-3, AC-4)

- `COMPLIANCE_CLAIM` → never auto-promoted (returns false immediately)
- `SESSION_LOG` → never auto-promoted (returns false immediately)
- `BUSINESS_DECISION` → requires `score >= 0.85` AND `!hasVagueMarkers(content)` (vague markers: "maybe", "might", "could", "possibly", "tentative", "unclear", "tbd", "not sure")

### 4. Daily log output (AC-5)

- Each run appends to `memory/YYYY-MM-DD.md` with: proposals reviewed, promoted, held, failed
- Format: `- **[timestamp] content-aware-curator-v2:** Reviewed=N, Promoted=N, Held=N, Failed=N, group_id=allura-system`

## Install commands (NOT run — documented for ops)

```bash
sudo cp scripts/systemd/allura-content-curator.service /etc/systemd/system/
sudo cp scripts/systemd/allura-content-curator.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now allura-content-curator.timer

# Verify timer is active
systemctl list-timers allura-content-curator.timer
# Check last run logs
journalctl -u allura-content-curator.service -n 50
```

## Manual test (without installing)

```bash
cd /media/ronin704/Games/Repos/team_durham-clean/allura-memory
/home/ronin704/.bun/bin/bun scripts/content-aware-curator-v2.ts --group-id allura-system
```