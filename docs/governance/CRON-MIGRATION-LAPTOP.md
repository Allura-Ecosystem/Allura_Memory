# Governance Cron Migration — Desktop → Laptop

**Created:** 2026-07-10
**Reason:** Desktop is the Bahari Command Center (where Captain sits and directs). Laptop runs 24/7 with Hermes (OpenClaw) + Saraha and handles always-on governance automations.

## Architecture

```
Desktop (Bahari Command Center)          Laptop (24/7 Hermes)
┌─────────────────────────────┐          ┌──────────────────────────────┐
│ OpenCode + Bahari agent      │          │ OpenClaw + troy-curator      │
│ - Captain directs from here  │          │ - Runs governance cron jobs  │
│ - Reads reports from Brain   │◄─────────┤ - Writes reports to Brain    │
│ - Reviews Notion policy DB    │  Allura  │ - Updates Notion policy DB   │
│ - Approves/directs actions   │  Brain    │ - Monitors health 6x/day     │
│                              │  (PG +    │ - Dreams memories daily      │
│ This is where decisions       │  Neo4j)   │ - Audits doctrine quarterly  │
│ are made                     │          │                              │
└─────────────────────────────┘          └──────────────────────────────┘
```

- **Desktop**: Captain's seat. Bahari (OpenCode) reads Allura Brain, reviews governance reports, approves promotions, directs actions. Not a 24/7 runner.
- **Laptop**: Always-on worker. Hermes (OpenClaw) runs troy-curator governance cron jobs, writes reports and health checks to Allura Brain, updates Notion.
- **Allura Brain**: Shared via PostgreSQL + Neo4j. Both machines connect to the same brain (laptop via tunnel or direct).
- **Agent mapping**: Jobs use `agentId: "troy-curator"` on the laptop. Bahari on the desktop reads the results.

## What's Being Migrated

4 governance cron jobs from the desktop to the laptop's OpenClaw cron system. The desktop keeps Bahari (OpenCode) as the command center — it stops running cron automations and becomes the review/approval seat.

### Jobs

| ID | Name | Schedule (ET) | Purpose |
|---|---|---|---|
| `48e9333c` | Troy Unified Governance + Canon Review | Mon 09:45 | Weekly governance+canon+policy+skill audit |
| `bad27483` | Allura Unified Operations Monitor | Every 6h (00,06,12,18) | Brain health + invariant check + queue depth |
| `68511ece` | Memory Dreaming Promotion | Daily 03:00 | High-score memory promotion review (HITL-gated) |
| `a1b2c3d4` | BMAD Gilliam/Troy Doctrine Sync | Quarterly (Jan/Apr/Jul/Oct 1st, 10:00) | Troy/Gilliam doctrine drift audit |

All jobs are **proposal-first / read-only**:
- Do NOT promote/delete/restore memories without HITL (pol-004)
- Do NOT mutate configs, cron, or runtime
- Do NOT touch production/data-bearing systems
- All operations use `group_id=allura-system` (pol-001, pol-006)

## Migration File

The cron job definitions are in:
```
docs/governance/laptop-cron-migration-jobs.json
```

This file contains all 4 jobs in OpenClaw `cron/jobs.json` format, ready to merge into the laptop's existing `~/.openclaw/cron/jobs.json`.

## Setup Instructions (on the laptop)

### 1. Prerequisites

Ensure the laptop has:
- OpenClaw installed and running (`openclaw --version`)
- Allura Brain MCP accessible at `http://localhost:5888/mcp` (or the laptop's tunnel endpoint)
- `troy-curator` agent configured (or `bahari` agent — see "Agent Mapping" below)
- WhatsApp delivery configured for failure alerts (optional but recommended)

### 2. Copy the Jobs

```bash
# On the laptop, from the Allura-ecosystem repo:
cat docs/governance/laptop-cron-migration-jobs.json | python3 -c "
import json, sys
new_data = json.load(sys.stdin)
new_jobs = new_data['jobs']

# Read existing jobs
try:
    with open('$HOME/.openclaw/cron/jobs.json') as f:
        existing = json.load(f)
except:
    existing = {'version': 1, 'jobs': []}

# Merge: replace jobs with matching IDs, keep others
existing_ids = {j['id'] for j in existing['jobs']}
for nj in new_jobs:
    if nj['id'] in existing_ids:
        existing['jobs'] = [nj if j['id'] == nj['id'] else j for j in existing['jobs']]
    else:
        existing['jobs'].append(nj)

with open('$HOME/.openclaw/cron/jobs.json', 'w') as f:
    json.dump(existing, f, indent=2)
print(f'Merged {len(new_jobs)} jobs. Total now: {len(existing[\"jobs\"])}')
"
```

### 3. Validate

```bash
openclaw config validate
openclaw cron list
```

### 4. Verify Allura Brain Connectivity

```bash
# Test MCP connectivity from the laptop
openclaw agent --agent troy-curator --message "Search Allura Brain for 'governance cron migration' with group_id=allura-system. Report: PASS or FAIL."
```

### 5. Copy Supporting Files

These files should also be synced to the laptop's OpenClaw workspace:

| File | Destination | Purpose |
|---|---|---|
| `scripts/skill-roster-drift-watch.py` | `~/.openclaw/workspace/scripts/` | POL-019 enforcement check |
| `memory/ruvix-policy-suggestions/_tracker.md` | `~/.openclaw/workspace/memory/ruvix-policy-suggestions/` | Policy tracker (canonical) |
| `skills/call-team-durham/SKILL.md` | `~/.openclaw/workspace/skills/call-team-durham/` | Durham Brand Maker dispatch (path-fixed) |
| `skills/allura-hydration-integrity/SKILL.md` | `~/.openclaw/workspace/skills/allura-hydration-integrity/` | POL-RET-001 skill |
| `skills/allura-promotion-roundtrip/SKILL.md` | `~/.openclaw/workspace/skills/allura-promotion-roundtrip/` | POL-RET-002 skill |
| `skills/allura-retrieval-drift-audit/SKILL.md` | `~/.openclaw/workspace/skills/allura-retrieval-drift-audit/` | POL-RET-003 skill |

### 6. Update Agent Skills (if using troy-curator)

In `~/.openclaw/openclaw.json`, ensure troy-curator has the retrieval-governance skills:

```json
{
  "id": "troy-curator",
  "skills": [
    "allura-memory-skill",
    "allura-melfina-protocol",
    "ruvix-policy-curator",
    "agent-scorecard",
    "evidence-before-done",
    "mcp-tool-usage",
    "superpowers-systematic-debugging",
    "allura-hydration-integrity",
    "allura-promotion-roundtrip",
    "allura-retrieval-drift-audit"
  ]
}
```

## Agent Mapping

The jobs reference `agentId: "troy-curator"`. This is correct — **troy-curator runs on the laptop's Hermes (OpenClaw)** as the 24/7 governance worker. **Bahari runs on the desktop's OpenCode** as the command center where Captain reviews reports and approves actions.

| Machine | Agent | Runtime | Role |
|---------|-------|---------|------|
| **Desktop** | Bahari | OpenCode | Command center — reads reports, approves promotions, directs actions |
| **Laptop** | troy-curator | OpenClaw (Hermes) | 24/7 governance worker — runs cron jobs, writes reports to Brain |

No agent ID changes needed. The jobs stay as `troy-curator`. Bahari picks up the results by searching Allura Brain and reading Notion from the desktop.

## Notion Policy DB

The Notion "Allura Policies & Governance" database is already cloud-based and accessible from any machine. No migration needed — the laptop can read/write it via the Notion MCP.

## Desktop Cleanup (after laptop verification)

The desktop is the **Bahari Command Center** — it keeps OpenCode + Bahari but stops running governance cron automations. Once the laptop jobs are verified running for 3+ days:

1. Disable the desktop's OpenClaw cron jobs (if any remain from the old setup):
```bash
# On desktop
openclaw cron list  # confirm which jobs exist
openclaw cron edit <job-id> --enabled false  # for each governance job
```

2. Remove the OpenWork systemd timers we created on the desktop today (these were temporary, the laptop replaces them):
```bash
systemctl --user stop opencode-job-allura-ecosystem-860c558842cb-*.timer
systemctl --user disable opencode-job-allura-ecosystem-860c558842cb-*.timer
rm -f ~/.config/systemd/user/opencode-job-allura-ecosystem-860c558842cb-*.timer
systemctl --user daemon-reload
```

3. The desktop keeps:
   - **OpenCode + Bahari** — command center for reading reports and approving actions
   - **Allura Brain access** — for querying memory and reviewing governance state
   - **Notion access** — for reviewing the policy DB
   - **Allura-ecosystem repo** — for code and documentation

## Verification Checklist

- [ ] Laptop OpenClaw running
- [ ] Allura Brain MCP accessible from laptop
- [ ] Jobs merged into laptop `cron/jobs.json`
- [ ] `openclaw config validate` passes
- [ ] `openclaw cron list` shows 4 jobs
- [ ] First manual run of each job succeeds (`openclaw cron run <job-id>`)
- [ ] Supporting files copied (scripts, tracker, skills)
- [ ] Agent skills updated in openclaw.json
- [ ] 3+ days of successful automated runs
- [ ] Desktop jobs disabled and systemd timers removed