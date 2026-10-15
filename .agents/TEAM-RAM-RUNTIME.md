# Team RAM Runtime Contract

> [!NOTE]
> **AI-Assisted Documentation**
> Drafted with AI assistance (Claude Code) on 2026-08-21 and not yet fully reviewed.
> Where it conflicts with the source code, schemas, or tests, defer to those.

The ten canonical Team RAM role definitions mirrored into `.claude/agents/`
close with the same Claude Bridge sentence:

> For Allura project work, follow `.agents/TEAM-RAM-RUNTIME.md`: Scout hydrates
> context and Allura Brain before build or status answers, then outcomes are
> logged to Allura Brain.

This file did not exist. Every agent pointed at a missing contract, so the rule
each of them cited could not be read. This document is that contract.

**It consolidates rules already written elsewhere in the repo.** It is an index
and a reconciliation, not new policy. Each section names its source. Where this
file and its source disagree, the source wins.

## Canonical ten-role team

Team RAM is exactly: Brooks, Jobs, Woz, Bellard, Carmack, Scout, Pike, Fowler,
Knuth, and Hightower. Scout is a utility recon role rather than a historical
persona. Ralph is a bounded validation loop, not an agent or roster member.

---

## 1. Hydrate before answering

Scout hydrates before any implementation, status, or architecture answer. The
default Allura task packet combines relevant local repository/code/board evidence
with one focused Brain `memory_search` using `group_id: allura-system` and
normally `limit: 5`.

*Source: `.claude/rules/_bootstrap.md` (Startup Protocol), `.claude/agents/brooks.md` (Startup Protocol).*

Summarize both sources into one ContextPacket and reuse it across specialists.
Brain supplements local truth; current code, schemas, tests, approved decisions,
board state, and the user's request remain authoritative. If Brain is unavailable
or irrelevant, report that plainly and continue with verified local evidence.

Health and audit retrieval are task-specific, not a startup batch. Use them only
for an operational/status question when they materially change the answer and
the authorized scope permits it. Emit a compact hydration receipt; do not write
session-start chatter or repeat the same Brain query per specialist.

---

## 2. Identity on every memory operation

The authenticated transport owns persisted `user_id`. Omit it unless the
verified principal is known and the tool explicitly requires that assertion.
Never send a persona name as `user_id`; a mismatch is rejected with
`ACTOR_MISMATCH`.

Persona attribution is optional and goes in `metadata.agent_id`, subject to
verified workspace validation:

```js
memory_add({
  group_id: "allura-system",
  content:  "...",
  metadata: { source: "conversation" },
})
```

Add `metadata.agent_id` only after that attribution has been accepted by the
verified workspace. If the workspace rejects it, omit the field, report the
rejection, and do not retry with a guessed identity.

`group_id` is required on every read and write and must match
`^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.
`allura-system` is the active repository tenant. `allura-roninmemory` and
`allura-team-ram` are retired and must never be used for active operations.

*Source: `src/lib/auth/principal-context.ts`, `CLAUDE.md` (Non-Negotiable Invariants),
`.claude/rules/semantic-graph-best-practices.md`.*

The `memory_add` metadata contract accepts only `source`, `conversation_id`, and
optional validated `agent_id`. Put principles, reasoning, alternatives,
tradeoffs, validation, and confidence in `content`.

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

After substantive work, write one outcome trace to Allura Brain: what was done,
what was found, validation, and what to watch for. Record architectural
decisions with the principle applied, alternatives considered, and tradeoffs in
the outcome content.

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

Allura is reached by remote agents through the protected public MCP endpoint at
`https://mcp.faithmeats.org/mcp`. The endpoint is a Cloudflare tunnel to the
operator-hosted service; the canonical PostgreSQL instance is not a managed
cloud database.

A workstation may run a container named `knowledge-postgres`, but its role cannot
be inferred from the container name. Verify the declared infrastructure target
before treating any local database as canonical. A "0 results" or "0 processed"
reading from an unverified target is not evidence that the canonical queue is
empty.

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
