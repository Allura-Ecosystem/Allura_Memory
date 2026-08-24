# Memory Log — Troy Unified Governance + Canon Review

**Target operation:** `allura-brain_memory_add`  
**group_id:** `allura-system`  
**user_id:** `troy-curator`  
**source:** `manual`  
**agent_id:** `troy-curator`  
**date:** 2026-07-14

---

## Content (ready to paste into memory_add)

```text
Troy Curator weekly governance review 2026-07-14. Overall status: ESCALATING.
Key findings:
- Allura Brain MCP at localhost:5888/mcp is unreachable from the desktop OpenCode runtime. The OpenCode MCP config (~/.opencode/mcp.json) has no memory server. Governance cron jobs may be firing without the ability to log to Brain.
- Canonical RuVix policy tracker memory/ruvix-policy-suggestions/_tracker.md does not exist. Policy states (POL-RET-001..003 approved; POL-018..022 and BMAD-001..006 proposed; POL-023..027 approved-for-planning-only) are only known from the review prompt.
- Approved retrieval governance skills (allura-hydration-integrity, allura-promotion-roundtrip, allura-retrieval-drift-audit) and call-team-durham / ruvix-policy-curator / skill-roster-drift-watch are missing from the TeamRAM harness at Agent-Harnesses/Allura-TeamRam/.agents/skills/.
- Skill roster drift in Allura-brandmaker: Penpot skills still present in .claude/skills and .agents/skills; duplicate namespaces across .claude/.agents/.opencode; stale worktree .claude/worktrees/mystifying-matsumoto-b68102/ contains duplicate skill copies.
- Cron roster is collapsed into 14 per-day jobs instead of the planned 4 consolidated governance jobs. The Monday allura-ops-monitor job failed (exit code 1) on 2026-07-13 22:03:16 ET.
- Quarterly bmad-gilliam-sync-auditor is isolated in the openclaw-8847efad1d24 scope; next trigger 2026-08-01 10:00 ET. Not integrated into the governance roster.
- Desktop systemd timers for governance jobs are still enabled; CRON-MIGRATION-LAPTOP.md cleanup step is incomplete.
- Notion Allura Policies & Governance database could not be reconciled because no Notion MCP is configured in this session.
Proposed moves requiring approval: restore Brain MCP; consolidate cron jobs; fix failing ops monitor; integrate doctrine sync; deprecate Penpot skills; canonicalize skill namespaces; add missing governance skills; add Notion MCP; run Brain invariant audit.
Safe docs-only moves: create policy tracker; create skill roster index; create cross-team sync log.
Full report: workspace/memory/troy-curator/2026-07-14-unified-governance-review.md
```

---

*This log is a manual substitute because the Allura Brain MCP server was unreachable during the review session. Insert via `allura-brain_memory_add` once connectivity is restored.*
