# Team RAM startup

Brooks leads; retain the canonical Team RAM personas in `.opencode/agent/`.
Load an agent body only when routing work to that agent. User instructions and
host system/developer instructions take precedence over repository guidance.

## Focused hydration

For an explicit startup/rehydrate request, run:

```bash
./scripts/start-opencode.sh --hydrate --topic "<task> decisions blockers outcomes"
```

This uses the session-only `.opencode/hydration-profile.json`. The launcher
dispatches real Scout deterministically, verifies its local and Brain tool
receipts, then passes a compact packet to real Brooks for synthesis. The full
personas and two required skill contracts are preloaded. It reports elapsed
time and aggregate usage from both actual sessions, including cached tokens.
The ordinary work profile and all registered roles remain available afterward.
No skill catalog, unrelated MCP schemas, recursive delegation, or redundant
model-generated dispatch is needed for this fixed startup operation.

A successful hydration requires the real scoped Brain call and local evidence;
an unavailable service must be reported as degraded, never converted to success.
The time target is measured, not promised; an over-budget result is explicit.

- Target a useful first response within 30 seconds. Budget additional retrieved
  startup context to 3,000 tokens; task expansion to 8,000. These are targets,
  not measured usage claims or reasons to omit required evidence.
- Scout reads local navigation, worktree state, and the active task pointer when
  configured, then relevant source sections. Read files once; never preload the
  full manifest, skill matrix, both orchestrators, archives, or all skills.
- Scout makes one Brain search: topic + `decisions blockers outcomes`,
  `group_id: allura-system`, `limit: 5`. Reuse its receipt across specialists for
  the same objective, workspace revision, tenant, and authority state.
- For project status, also retrieve current task/board state and recent blockers,
  outcomes, and lessons. If recall is stale/conflicting, query filtered recent
  episodic evidence using available governed tools. Health checks are triggered
  by errors, degradation, or an explicit health request, not every task.
- Report missing/slow sources and continue safe local work. Refresh only the
  affected context after scope, diff, permissions, or authority changes.
- Return a compact ContextPacket: objective, source revisions/time, relevant
  decisions/blockers, selected skills, owner, validation, and unknowns. Do not
  repeat raw results, menus, or the packet at every handoff.
- Load only task-relevant skills. Startup chatter needs no memory write; record
  one substantive validated outcome through Brain. Omit caller identity fields
  unless verified. Promotion requires human approval.

## Model routing

`tooling/agent-sync/models.map.json` defines OpenCode tiers. Sol owns Brooks,
Jobs, and Woz; Luna handles Scout and focused specialists. Explicitly escalate
hard specialist tasks to Sol when evidence warrants it. Use the installed
OpenAI catalog; do not silently fall back to another provider.

`opencode.json` is the project runtime config. `.opencode/config.json` is a
compatibility copy of model/startup settings, not an independent routing policy.
Run `bun tooling/agent-sync/sync-agents.mjs --apply` to regenerate agent/mirror
models and both configs; use `--check` to detect drift.
Flat `.opencode/agents/*.md` adapters are generated from the nested canonical
sources so repository personas override same-named global agents.

Scout before build; validation before completion. Claim a real agent, memory
call, token count, or test only with an actual receipt. Use `rg` for local facts,
Context7/official docs for APIs, and Tavily for current external research.
