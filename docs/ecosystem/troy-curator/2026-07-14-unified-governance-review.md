# Troy Unified Governance + Canon Review

**Date:** 2026-07-14 (Tue)  
**Agent:** troy-curator  
**Mode:** READ-ONLY / PROPOSAL-FIRST  
**Tenant:** group_id=allura-system  
**Scope:** Weekly governance, policy, skill roster, cron health, cross-team coherence, canon drift  

> Dog, the rules and skills are clean. Tell me what's leaking.

---

## Executive Status

| Area | Status | Notes |
|---|---|---|
| Allura Brain connectivity | **ESCALATING** | MCP at `localhost:5888/mcp` is unreachable (HTTP 000). No memory server in OpenCode MCP config (`~/.opencode/mcp.json`). Desktop jobs are firing blind. |
| RuVix policy tracker | **ATTENTION** | Canonical tracker `memory/ruvix-policy-suggestions/_tracker.md` does not exist in repo or `~/.openclaw/workspace`. Policy states are only in this prompt. |
| Skill roster drift | **ATTENTION** | Penpot skills still present in `Allura-brandmaker/.claude/skills` and `.agents/skills`. Governance skills (`allura-hydration-integrity`, `allura-promotion-roundtrip`, `allura-retrieval-drift-audit`, `call-team-durham`, `ruvix-policy-curator`) missing from TeamRAM harness. Skill namespace duplication across `.claude`, `.agents`, `.opencode`. |
| Cron roster health | **ESCALATING** | 14 jobs instead of planned 4. Ops monitor split into 7 daily jobs. Memory dreaming split into 7 daily jobs. Quarterly `bmad-gilliam-sync-auditor` exists but not in the consolidated governance set. Desktop systemd timers still present and enabled. |
| Cross-team coherence | **WATCH** | `bmad-gilliam-sync-auditor` systemd timer is loaded/active but belongs to `openclaw-8847efad1d24` scope and next trigger is 2026-08-01 10:00 ET. Quarterly cadence is nominally intact, but no repo job entry in `laptop-cron-migration-jobs.json`. |
| Notion reconciliation | **WATCH** | Notion "Allura Policies & Governance" DB not accessible from this session (no Notion MCP). Reconciliation blocked until Captain provides access or a read-only export. |
| Overall system trust | **ESCALATING** | Governance automations are running, but the Brain they report into is not reachable from the current runtime, and the canonical policy tracker is missing. This is a visibility/dataloss risk, not a policy-enforcement failure yet. |

---

## 1. Allura Brain Search

### What I tried
- HTTP probe to `http://localhost:5888/mcp` → connection failed (HTTP 000).
- Checked OpenCode MCP config at `~/.opencode/mcp.json` → contains `MCP_DOCKER` and `chrome-browser`, no `memory` / Allura Brain server.
- Therefore **no Allura Brain memory search was possible** in this session.

### Findings
- The desktop OpenWork jobs are configured to log memories to `group_id=allura-system`, but the runtime they execute in (OpenCode) does not currently expose the memory MCP tools.
- Risk: cron jobs may run, attempt to query Brain, fail silently, and produce no durable trace.

### Proposed moves
1. **APPROVAL REQUIRED** — Add the Allura Brain MCP server to `~/.opencode/mcp.json` (or the OpenWork-equivalent config) so desktop OpenCode sessions can reach Brain. Use the canonical server at `/home/ronin704/Projects/allura memory/src/mcp/memory-server-canonical.ts` with PG/Neo4j credentials from private memory.
2. **Safe docs-only** — Document that the laptop migration (CRON-MIGRATION-LAPTOP.md) is the intended end state; desktop jobs are temporary and should be retired once laptop jobs prove stable.

---

## 2. RuVix Policy Backlog

### Canonical source status
- Searched repo and `~/.openclaw/workspace` for `memory/ruvix-policy-suggestions/_tracker.md`.
- **File does not exist.**

### Policy states (from review prompt)
| Policy | State |
|---|---|
| POL-RET-001 … POL-RET-003 | Approved |
| POL-018 … POL-022 | Proposed |
| BMAD-001 … BMAD-006 | Proposed |
| POL-023 … POL-027 | Approved-for-planning-only |

### Findings
- No runtime-enforced policy list was discoverable in code or config.
- The approved retrieval policies (POL-RET-001..003) are referenced in CRON-MIGRATION-LAPTOP.md as skills that should be copied to the laptop workspace, but those skills are **not present** in the TeamRAM harness at `Agent-Harnesses/Allura-TeamRam/.agents/skills/`.

### Proposed moves
1. **Safe docs-only** — Create `memory/ruvix-policy-suggestions/_tracker.md` in the repo with the backlog table, owners, states, and implementation evidence links.
2. **APPROVAL REQUIRED** — Populate the same tracker in `~/.openclaw/workspace` on the laptop if that is still the canonical workspace path.
3. **APPROVAL REQUIRED** — Install the three approved retrieval governance skills into the TeamRAM harness (or confirm they live elsewhere and update CRON-MIGRATION-LAPTOP.md).

---

## 3. Skill Roster Drift Audit

### Scope
- `Agent-Harnesses/Allura-TeamRam/.agents/skills/`
- `Agent-Harnesses/Allura-brandmaker/.claude/skills/`
- `Agent-Harnesses/Allura-brandmaker/.agents/skills/`
- `Agent-Harnesses/Allura-brandmaker/.opencode/skills/`
- `Agent-Harnesses/Allura-brandmaker/.Codex/skills/`

### Findings
| Issue | Evidence | Severity |
|---|---|---|
| **Penpot remnants** | 9 Penpot skills present in both `.claude/skills` and `.agents/skills` of brandmaker: `penpot-cms-asset-pipeline`, `penpot-create-board`, `penpot-export-handoff`, `penpot-foundations`, `penpot-implement-mockups`, `penpot-uiux-design`, `penpot-upload-media`, `penpot-use` | ATTENTION |
| **Duplicate namespaces** | Same skill names copied into `.claude/skills` (84 dirs), `.agents/skills` (78 dirs), `.opencode/skills` (17 dirs). No clear single source of truth. | ATTENTION |
| **Missing governance skills** | `allura-hydration-integrity`, `allura-promotion-roundtrip`, `allura-retrieval-drift-audit`, `call-team-durham`, `ruvix-policy-curator`, `skill-roster-drift-watch.py` not found in TeamRAM harness or repo root. | ESCALATING |
| **Brandmaker path issues** | CRON-MIGRATION-LAPTOP.md references `skills/call-team-durham/SKILL.md` and `skills/allura-*` to be copied to `~/.openclaw/workspace/skills/`. These paths do not exist in the repo. | ATTENTION |
| **Orphaned worktree** | `.claude/worktrees/mystifying-matsumoto-b68102/` contains duplicate Penpot and other skills — possible stale worktree that should be pruned. | WATCH |
| **Missing trigger tests** | No `skill-roster-drift-watch.py` or equivalent found in repo root `scripts/` or TeamRAM `scripts/`. POL-019 enforcement check has no artifact. | ATTENTION |

### Proposed moves
1. **APPROVAL REQUIRED** — Deprecate Penpot skills: move to `archive/skills/penpot/` or mark with DEPRECATED frontmatter; update brandmaker agent manifests to stop routing to them.
2. **APPROVAL REQUIRED** — Choose a single canonical skill namespace per harness (e.g., `.claude/skills` for Claude Code, `.opencode/skills` for OpenCode) and make the others thin wrappers/symlinks per AGENTS.md sync protocol.
3. **APPROVAL REQUIRED** — Add `allura-hydration-integrity`, `allura-promotion-roundtrip`, `allura-retrieval-drift-audit`, and `call-team-durham` skills to the TeamRAM harness or correct CRON-MIGRATION-LAPTOP.md references.
4. **Safe docs-only** — Create a skill inventory index under `docs/governance/skill-roster.md` listing each skill, owner harness, canonical path, and deprecation status.

---

## 4. Cron Roster Health

### Expected (per CRON-MIGRATION-LAPTOP.md)
| ID | Name | Schedule |
|---|---|---|
| `48e9333c` | Troy Unified Governance + Canon Review | Mon 09:45 ET |
| `bad27483` | Allura Unified Operations Monitor | Every 6h |
| `68511ece` | Memory Dreaming Promotion | Daily 03:00 |
| `a1b2c3d4` | BMAD Gilliam/Troy Doctrine Sync | Quarterly Jan/Apr/Jul/Oct 1st 10:00 |

### Actual OpenWork scheduler state
- `troy-unified-governance-review` — present, Mon 09:45, **status `running`** (this session). Last source `scheduled` at 2026-07-13 22:03:16 ET.
- `memory-dreaming-*` — 7 separate jobs (Mon–Sun), daily 03:00. Last run Mon succeeded; others unknown.
- `allura-ops-monitor-*` — 7 separate jobs (Mon–Sun), daily 06:00. **Mon job failed** (exit code 1) at 2026-07-13 22:03:16 ET.
- `bmad-gilliam-sync-auditor` — **not in the `allura-ecosystem` scope**. Exists as a separate `openclaw-8847efad1d24` systemd timer, next trigger 2026-08-01 10:00 ET.

### Findings
| Issue | Severity |
|---|---|
| Ops monitor and dreaming are split into per-day jobs instead of single cron expressions. This is cron sprawl/collapse. | ESCALATING |
| Mon ops monitor **failed** with exit code 1. No logs captured here; failureAlert set to WhatsApp after 2 consecutive failures. | ESCALATING |
| Quarterly doctrine sync is not integrated into the governance job set. | ATTENTION |
| Desktop systemd timers are still enabled per `systemctl --user status` output, contrary to CRON-MIGRATION-LAPTOP.md cleanup step. | ATTENTION |

### Proposed moves
1. **APPROVAL REQUIRED** — Consolidate 7 ops-monitor jobs into one `0 */6 * * *` job and 7 dreaming jobs into one `0 3 * * *` job; delete the per-day variants.
2. **APPROVAL REQUIRED** — Investigate and fix the Mon ops-monitor failure before the next run.
3. **APPROVAL REQUIRED** — Add `bmad-gilliam-sync-auditor` to the consolidated governance cron roster in `docs/governance/laptop-cron-migration-jobs.json` (or retire the separate timer and migrate it).
4. **APPROVAL REQUIRED** — Complete desktop cleanup: stop/disable/remove the OpenWork systemd timers listed in CRON-MIGRATION-LAPTOP.md after laptop jobs are verified stable.

---

## 5. Cross-Team Coherence — BMAD Gilliam/Troy Doctrine Sync

### Current state
- Separate systemd timer exists: `opencode-job-openclaw-8847efad1d24-bmad-gilliam-sync-auditor.timer`
- Status: `active (waiting)`
- Next trigger: **Saturday, 2026-08-01 10:00:00 ET**
- This is the first quarterly run scheduled since the job was created (2026-07-10).

### Findings
- The quarterly sync is **due and scheduled**, but it is outside the consolidated governance cron set.
- BMAD-006 policy is still **proposed**, so the audit is running on cadence even though its governing policy has not been approved.
- No recent sync report was found in the repo.

### Proposed moves
1. **Safe docs-only** — Record the upcoming 2026-08-01 run in `docs/governance/cross-team-sync-log.md`.
2. **APPROVAL REQUIRED** — Move `bmad-gilliam-sync-auditor` into the same governance job manifest as the other three so it can be reviewed alongside ops/dreaming/governance reports.
3. **APPROVAL REQUIRED** — Decide whether to promote BMAD-006 to approved before the next run, or keep the audit cadence provisional and clearly labeled as such.

---

## 6. Notion "Allura Policies & Governance" Reconciliation

### Current state
- This session has no Notion MCP tool.
- `~/.opencode/mcp.json` does not contain a Notion server.

### Findings
- Reconciliation could not be performed.
- The Notion DB is described as cloud-based and accessible from any machine in CRON-MIGRATION-LAPTOP.md, but the desktop runtime currently lacks the integration.

### Proposed moves
1. **APPROVAL REQUIRED** — Add a Notion MCP server to the desktop config (or confirm it lives in private memory / another runtime).
2. **Safe docs-only** — Produce a reconciliation script/template that maps Notion policy rows to `memory/ruvix-policy-suggestions/_tracker.md` columns.

---

## 7. Canon / Memory Drift

### Findings
- Could not query semantic layer because MCP is down.
- Repo documents (`SARAH-BOONE-HERMES-CRON-PROMPTS.md`, `CRON-MIGRATION-LAPTOP.md`) reference a laptop migration that is **incomplete** on the desktop side:
  - per-day jobs instead of consolidated jobs,
  - systemd timers still enabled,
  - policy tracker missing,
  - supporting skills missing.

### Proposed moves
1. **APPROVAL REQUIRED** — Once Brain is reachable, run `allura-brain_audit_invariant_check` for `group_id=allura-system` and capture the receipt.
2. **Safe docs-only** — Add a "migration completeness checklist" to `docs/governance/CRON-MIGRATION-LAPTOP.md` so each delta is tracked.

---

## 8. Risks Summary

| Risk | Likelihood | Impact | Owner |
|---|---|---|---|
| Governance cron jobs run but cannot write to Brain; reports are lost | High | High (silent data loss) | Captain + Hightower |
| Policy states exist only in prompts; no canonical tracker | High | Medium (decision drift) | Troy Curator |
| Penpot skills remain active despite deprecation intent | Medium | Medium (wrong-tool calls, brandmaker path confusion) | Team Durham lead |
| Skill namespace duplication causes agents to load stale copies | Medium | High (wrong behavior) | Brooks / Woz |
| Ops monitor job already failing on Mon | Confirmed | High (missed health events) | Captain |
| Quarterly doctrine sync isolated from governance roster | Medium | Medium (orphaned audit) | Brooks |
| Notion DB not reconciled | High | Low-Medium (policy backlog out of sync) | Bahari |

---

## 9. Proposed Moves (consolidated)

| # | Move | Type | Approval |
|---|---|---|---|
| 1 | Restore/configure Allura Brain MCP for desktop OpenCode/OPenWork runtime | Config | **APPROVAL REQUIRED** |
| 2 | Create `memory/ruvix-policy-suggestions/_tracker.md` with policy backlog table | Docs | Safe docs-only |
| 3 | Add approved retrieval governance skills to TeamRAM harness or fix CRON-MIGRATION references | Code/Config | **APPROVAL REQUIRED** |
| 4 | Deprecate/move Penpot skills in brandmaker | Code/Config | **APPROVAL REQUIRED** |
| 5 | Canonicalize skill namespace per harness and remove stale worktree | Code/Config | **APPROVAL REQUIRED** |
| 6 | Consolidate per-day ops/dreaming cron jobs into single jobs | Config | **APPROVAL REQUIRED** |
| 7 | Fix failing Mon ops-monitor job and capture logs | Ops | **APPROVAL REQUIRED** |
| 8 | Integrate `bmad-gilliam-sync-auditor` into governance roster or migrate it | Config | **APPROVAL REQUIRED** |
| 9 | Clean up desktop systemd timers after laptop verification | Ops | **APPROVAL REQUIRED** |
| 10 | Add Notion MCP and reconcile policy DB | Config | **APPROVAL REQUIRED** |
| 11 | Run Brain invariant check once MCP is back and log receipt | Ops | **APPROVAL REQUIRED** |
| 12 | Create skill-roster index and migration-completeness checklist | Docs | Safe docs-only |

---

## 10. Receipts / Evidence Captured

- `curl -s -o /dev/null -w '%{http_code}' http://localhost:5888/mcp` → `000`
- `~/.opencode/mcp.json` inspected — no memory server.
- `list_jobs` JSON exported — 15 jobs total, 14 of them sprawl variants.
- `systemctl --user status` for `troy-unified-governance-review.timer` → active/running.
- `systemctl --user status` for `bmad-gilliam-sync-auditor.timer` → active/waiting, trigger 2026-08-01.
- Directory listings for TeamRAM and brandmaker skills captured.
- Searched repo for `memory/ruvix-policy-suggestions/_tracker.md` → not found.

---

## 11. Memory Log Note

Because Allura Brain MCP is unreachable from this session, the summary memory could not be written automatically. The intended memory content is captured below and should be added to Brain once connectivity is restored.

**Target:** `allura-brain_memory_add`  
**Parameters:**
- `group_id`: `allura-system`
- `user_id`: `troy-curator`
- `source`: `manual`
- `agent_id`: `troy-curator`
- `content`: see `2026-07-14-unified-governance-review-memory-log.md` in this directory.

---

*End of report.*
