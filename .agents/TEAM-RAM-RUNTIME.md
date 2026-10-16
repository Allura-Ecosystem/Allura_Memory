# Team RAM Runtime Contract

Approved routing: verified context is mandatory; a separate Scout process is not.
All canonical GOAT personas remain in `.opencode/agent/`; runtime adapters mirror
them without silently changing models, scope, or tool permissions.

## Default route

Selected owner → relevant local context + Allura Brain → skills → work/review → validate → outcome.

Brooks owns architecture and routing in this repository. The selected owner
may read relevant local files, Git state and the configured task pointer directly.
Search Brain with `group_id: allura-system` before substantive planning.
Reuse only fresh receipts matching objective, revision, tenant and authority.
Brain supplements source, tests and schemas; it does not replace them.

Scout remains an available real specialist for broad unfamiliar-repository
discovery, independent reconnaissance, or an explicit request. Routine work
does not launch Scout. Tavily is only for needed current external research;
neither Tavily nor Brain replaces checking local code.

## Measured hydration

`./scripts/start-opencode.sh --hydrate` defaults to one real Brooks session.
The launcher reads the approved local files and Git state, then preloads only
bounded navigation/path references, task-pointer path/ID, and bounded Git status.
Full runtime configuration and unrelated fields are not forwarded. These reads
are honestly attributed to the launcher, not fabricated as model tool calls.
Brooks performs the real authenticated Brain search and returns a useful receipt.
`--with-scout` explicitly selects the optional Scout → Brooks route.

Both routes validate actual local and Brain evidence and count every participating
inference, including cached tokens. An unavailable or degraded Brain must be
reported honestly. The under-30-second target is measured, not a latency guarantee.
The task pointer's target is not read by this bounded benchmark; expand context
before actual story work. Project status requires current board/task evidence
and relevant recent outcomes; historical memory alone is not current state.

## Identity, memory and authority

Use only the active authorized tenant, `allura-system` here. The authenticated
transport owns identity; omit `user_id` and unverified agent attribution.
After substantive verified work, write one concise episodic outcome through
Brain. No startup chatter or duplicate specialist completion traces.
PostgreSQL traces are append-only. Corrections are new traces; semantic changes
are versioned and human-governed. Never promote an agent's own output.
Never directly rewrite graph storage or use `docker exec` for database access.

Keep the configured endpoint and credentials. A denial never authorizes tenant,
identity or endpoint substitution. Runtime/persona labels do not prove execution:
claim an agent, tool, test, memory write or handoff only with an actual receipt.

## Canonical references

- `.opencode/STARTUP.md`: bounded hydration and research routing.
- `.opencode/AGENTS.md`: project gates and team responsibilities.
- `.opencode/agent/`: full persona definitions.
- `.opencode/skills/allura-memory-skill/SKILL.md`: governed Brain contract.
- `tooling/agent-sync/sync-agents.mjs`: generated runtime adapters and mirrors.
