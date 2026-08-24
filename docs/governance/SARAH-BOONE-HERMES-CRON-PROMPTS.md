# Governance Automations for Sarah Boone (Hermes) — Natural Language Prompts

**Created:** 2026-07-10
**Architecture:** Desktop = Bahari Command Center (OpenCode). Laptop = 24/7 Hermes with Sarah Boone as general assistant.
**Method:** Hermes has a built-in cron scheduler. You tell Sarah Boone in natural language and she creates the jobs. No JSON files needed.

## How to Set Up

On the laptop, open a chat with Sarah Boone and paste each prompt below. Sarah Boone will create the cron job via Hermes's `cronjob` tool.

**Prerequisite:** Ensure Saraha/Hermes has Allura Brain MCP configured (memory_search, memory_add, audit_health_report, etc. available as tools). The MCP endpoint is `http://localhost:5888/mcp` or the tunnel endpoint.

---

## Job 1: Weekly Governance Review

**Paste to Saraha:**
```
Create a cron job that runs every Monday at 9:45am Eastern Time. 

The job should do a read-only governance review of the Allura system. Here's what it should check:

1. Search Allura Brain (group_id=allura-system) for recent governance, policy, skill, and canon findings.
2. Check the RuVix policy tracker at the policy backlog: which policies are proposed vs approved vs implemented vs runtime-enforced. The tracker is at memory/ruvix-policy-suggestions/_tracker.md.
3. Audit skill roster drift: check for orphaned skills, duplicate owners, missing trigger tests.
4. Check cron roster health: are the expected governance jobs present and firing?
5. Check cross-team coherence.
6. Write a report with status (WATCH/ATTENTION/ESCALATING), findings, risks, and proposed moves.
7. Log a summary memory to Allura Brain with group_id=allura-system, source=manual, agent_id=troy-curator.

Hard boundaries:
- Do NOT promote memories, mutate configs, change cron, or enforce policies without Captain approval.
- Use group_id=allura-system on all Allura Brain operations.
- This is read-only and proposal-first.
```

---

## Job 2: Daily Operations Monitor

**Paste to Saraha:**
```
Create a cron job that runs every day at 6am Eastern Time.

The job should do a read-only health check of the Allura Brain system. Here's what it should check:

1. Run a health check on Allura Brain — check PostgreSQL, Neo4j, embedding backfill, curator queue depth, and MCP tool availability. Use the audit_health_report tool with group_id=allura-system if available.
2. Validate all 6 governance invariants against live data. Use the audit_invariant_check tool with group_id=allura-system if available.
3. Check curator queue depth — if it's growing, flag it.
4. Check for any recent governance gate events that failed.
5. Write a brief status report: GREEN / YELLOW / RED with per-subsystem notes.
6. If any invariant is violated or any subsystem is RED, log a memory to Allura Brain with group_id=allura-system, source=manual, agent_id=ops-monitor, flagging the issue for Captain attention.

Hard boundaries:
- Do NOT attempt to fix issues. Report only.
- Do NOT mutate configs, promote memories, or enforce policies.
- Use group_id=allura-system on all operations.
```

---

## Job 3: Daily Memory Dreaming Promotion

**Paste to Saraha:**
```
Create a cron job that runs every day at 3am Eastern Time.

The job should review high-scoring episodic memories and submit promotion requests for human-in-the-loop review. This is NOT auto-promotion — all promotions require HITL approval.

Here's what it should do:

1. List recent memories for group_id=allura-system (limit 50, sorted by score descending) to see highest-scoring episodic memories.
2. Search Allura Brain for memories that appear eligible for promotion (high score, low usage count, stable content).
3. For each strong candidate, submit a promotion request — this queues it for HITL review, it does NOT auto-promote.
4. Check if any previously queued proposals have been approved or rejected.
5. Write a brief report: how many candidates identified, how many promotion requests submitted, any stale proposals awaiting Captain action.
6. Log a summary memory to Allura Brain with group_id=allura-system, source=manual, agent_id=dreaming-promoter.

Hard boundaries:
- Do NOT auto-promote memories to the semantic layer.
- Do NOT delete, restore, or update memories.
- Use group_id=allura-system on all operations.
- Never claim a promotion is complete — requests queue for HITL.
```

---

## Job 4: Quarterly BMAD Doctrine Sync (Optional)

**Paste to Saraha:**
```
Create a cron job that runs quarterly — on the 1st of January, April, July, and October at 10am Eastern Time.

The job should do a read-only audit checking for doctrine drift between Troy and Gilliam BMAD skills.

Here's what it should do:

1. Search Allura Brain (group_id=allura-system) for "Gilliam BMAD doctrine" and "Gilliam skill roster" and "Troy BMAD skills".
2. Compare skill names, workflow coverage, ownership mapping, artifact handling, and any duplicate or conflicting rules.
3. Flag any drift: missing skills, conflicting ownership, duplicate rules, stale references.
4. Write a report with verdict (SYNC / DRIFT / ERROR), findings, and proposed moves.
5. Log a summary memory to Allura Brain with group_id=allura-system, source=manual, agent_id=gilliam-sync-auditor.

Hard boundaries:
- Read-only audit. Do NOT mutate configs, promote memories, or enforce policies.
- Use group_id=allura-system on all operations.
```

---

## After Creating the Jobs

Ask Sarah Boone:
```
List all my cron jobs and confirm they're active.
```

Then verify each one manually:
```
Run the operations monitor job now and show me the result.
```

---

## What Bahari (Desktop) Does

Bahari on the desktop is the **command center**. Bahari doesn't run cron jobs — Bahari:
- Reads the reports Sarah Boone writes to Allura Brain
- Reviews the Notion policy database
- Approves promotions when Troy/Sarah Boone queue them
- Directs actions based on what the automations surface

The desktop OpenWork systemd timers created earlier today are temporary. Once Sarah Boone's Hermes jobs are verified running for 3+ days, clean them up:
```bash
systemctl --user stop opencode-job-allura-ecosystem-860c558842cb-*.timer
systemctl --user disable opencode-job-allura-ecosystem-860c558842cb-*.timer
rm -f ~/.config/systemd/user/opencode-job-allura-ecosystem-860c558842cb-*.timer
systemctl --user daemon-reload
```

---

## Allura Agent Roster (Reference)

| Agent | Role | Where |
|-------|------|-------|
| **Bahari** | Memory Curator / Command Center | Desktop (OpenCode) |
| **Sarah Boone** | General Assistant / 24/7 runner | Laptop (Hermes) |
| **Gilliam** | Personal Assistant / Navigator | Desktop (OpenClaw) |
| **Troy Curator** | Governance Auditor | Desktop (OpenClaw, being sunset) |
| **Team RAM** | Engineering crew (Brooks, Woz, Scout, etc.) | Project-local (.opencode/agent) |
| **Team Durham** | Brand/creative (Kotler, Aaker, Glaser, etc.) | Brand Maker harness |
| **Team TALON** | Dev/DevOps (8 agents) | OpenClaw |
| **Team IRIS** | UX/QA (8 agents) | OpenClaw |