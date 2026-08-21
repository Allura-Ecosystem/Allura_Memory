# Team RAM Runtime Contract

> [!NOTE]
> **AI-Assisted Documentation**
> Drafted with AI assistance (Claude Code) on 2026-08-21 and not yet fully reviewed.
> Where it conflicts with the source code, schemas, or tests, defer to those.

All eleven Team RAM agent definitions in `.claude/agents/` close with the same
Claude Bridge sentence:

> For Allura project work, follow `.agents/TEAM-RAM-RUNTIME.md`: Scout hydrates
> context and Allura Brain before build or status answers, then outcomes are
> logged to Allura Brain.

This file did not exist. Every agent pointed at a missing contract, so the rule
each of them cited could not be read. This document is that contract.

**It consolidates rules already written elsewhere in the repo.** It is an index
and a reconciliation, not new policy. Each section names its source. Where this
file and its source disagree, the source wins.

---

## 1. Hydrate before answering

Scout hydrates from Allura Brain before any build, status, or architecture
answer. Do not derive project state from flat files when the Brain is reachable.

*Source: `.claude/rules/_bootstrap.md` (Startup Protocol), `.claude/agents/brooks.md` (Startup Protocol).*

Hydration is one parallel batch, not a sequence:

| Pass | Call | Purpose |
|---|---|---|
| A | `audit_health_report` | subsystem status, curator queue depth |
| B | `memory_search` | promoted/semantic truth |
| C | `audit_query_events`, filtered, last 48h | current episodic truth |

**Staleness rule.** If the newest Pass-B hit is older than 7 days, or curator
queue depth exceeds 100, the report must open with `⚠ graph stale — trusting
episodic` and derive state from Pass C. Where B and C disagree, C wins.

**Never query events unfiltered at boot** — `process_*` test events drown the
signal.

**`_bootstrap.md` System State is an untrusted hint.** Never assert it as fact.
If it diverges from the hydration batch, say so.

### Known hydration failure modes

Verified on 2026-08-21. Treat an empty result as *unrun* until you have checked
these:

- `memory_search` attempts the **graph store only** while `memory_add` writes to
  **PostgreSQL**, and the contract reports `degraded: false` either way. An empty
  search is not evidence of absence. `memory_list` attempts both stores and is
  the reliable fallback.
- `audit_health_report` and `audit_query_events` require the `audit:read` scope.
  A principal lacking it gets `SCOPE_INSUFFICIENT`, not a degraded report.

---

## 2. Identity on every memory operation

`user_id` **must** be the authenticated principal. The runtime rejects anything
else with `ACTOR_MISMATCH` — Story 24.2 binds `user_id` to the verified principal
and request parameters cannot override it.

Agent persona goes in `metadata.agent_id`:

```js
memory_add({
  group_id: "allura-system",
  user_id:  "<authenticated principal>",   // NOT the persona
  content:  "...",
  metadata: { source: "conversation", agent_id: "brooks-architect" },
})
```

`group_id` is required on every read and write and must match `^allura-[a-z0-9-]+$`.
`allura-roninmemory` and `allura-team-ram` are legacy and must not be used.

*Source: `src/lib/auth/principal-context.ts`, `CLAUDE.md` (Non-Negotiable Invariants),
`.claude/rules/semantic-graph-best-practices.md`.*

> **Known contract gap.** The Reflection Protocol in `brooks.md` specifies
> `metadata.principle`, `.reasoning`, `.alternatives`, `.tradeoffs`, and
> `.confidence`. The `memory_add` tool schema accepts only `source`,
> `conversation_id`, and `agent_id`. Until reconciled, put structured reflection
> fields in `content`.

---

## 3. Promotion is human

Agents write episodic traces and read approved knowledge. No agent promotes its
own output. Promotion routes through `curator:approve` under human authority.

`memory_add` returning `stored: "episodic"` with `pending_review: true` is the
system working as designed, not a failure.

*Source: `CLAUDE.md`, `.claude/rules/semantic-graph-best-practices.md`, governance invariant 4.*

---

## 4. Runtime honesty

Distinguish perspective from execution:

- *"Brooks active"* means the current runtime is operating under Brooks guidance.
- *"A real subagent ran"* means a subagent or task was actually invoked.

Never claim a runtime, subagent, search, test, or memory operation occurred
unless the tool call actually succeeded. Do not say memory was searched or
written without a successful call.

*Source: `team-ram-cowork` skill (Runtime Honesty), `CLAUDE.md` (Verify before presenting).*

---

## 5. Log outcomes

After substantive work, write an outcome trace to Allura Brain: what was done,
what was found, what to watch for. Record architectural decisions with the
principle applied, alternatives considered, and tradeoffs accepted.

Corrections are **new rows**, never edits. PostgreSQL events are append-only;
semantic versioning uses supersession. To correct a prior memory, write a new one
that names the superseded id and states what is false.

*Source: `CLAUDE.md` (Non-Negotiable Invariants), `.claude/rules/BROOKS-TRACKING.md`, governance invariants 2 and 3.*

---

## 6. Routing

Brooks is primary in this repository and owns architecture and delegation. The
agent-to-concern map, model tiers, and tool restrictions are in
[`.claude/rules/agent-routing.md`](../.claude/rules/agent-routing.md).

Do not force Team RAM onto a repository that does not declare it.

---

## 7. Environment

Allura is a **cloud deployment**. PostgreSQL runs on the operator's laptop and is
reached over the network; the MCP endpoint is a tunnel, not a local service.

A workstation may run a container named `knowledge-postgres` whose database is an
**empty scratch copy**. It is not the canonical ledger and will silently answer
queries with nothing. A "0 results" or "0 processed" reading from a workstation
means *wrong database* before it means *empty queue*.

Database operations go through MCP tooling. Never `docker exec`.

*Source: `CLAUDE.md` (MCP Integration), `.claude/rules/mcp-integration.md`, governance invariant 5.*

---

## References

- [`.claude/rules/agent-routing.md`](../.claude/rules/agent-routing.md) — Team RAM roster, routing, tool restrictions
- [`.claude/rules/_bootstrap.md`](../.claude/rules/_bootstrap.md) — startup protocol, staleness rule
- [`.claude/rules/BROOKS-TRACKING.md`](../.claude/rules/BROOKS-TRACKING.md) — decision trail requirements
- [`.claude/rules/semantic-graph-best-practices.md`](../.claude/rules/semantic-graph-best-practices.md) — supersession, promotion gate
- [`.claude/rules/mcp-integration.md`](../.claude/rules/mcp-integration.md) — MCP access rules
- [`CLAUDE.md`](../CLAUDE.md) — invariants, architecture, commands
