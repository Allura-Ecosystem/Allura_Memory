---
name: allura-memory-core
description: Govern OpenClaw memory retrieval and concise outcome traces using authenticated project scope and human-reviewed semantic promotion.
---

# Governed Memory for OpenClaw

Applies to OpenClaw sessions, including scheduled jobs and subagents, not as a
universal policy for unrelated runtimes. Use only tools exposed by the current
host; discover their schemas rather than assuming a name or alias.

## Resolve authority first

Resolve `group_id` from the authenticated project/task context. Use
`allura-system` for Allura system work unless the project explicitly declares
another authorized tenant matching `^allura-[a-z0-9-]+$`. Do not guess a personal
namespace or create access by selecting a syntactically valid one. Missing or
ambiguous scope requires clarification; scheduled jobs stop memory operations
and report a configuration blocker. A persona selection does not grant access.

The transport owns persisted user identity. Omit `user_id` unless the live tool
requires it and the authenticated principal is verified; never use an agent,
phone number, or sender label as a guessed identity. Include agent attribution
only after workspace verification. A denied operation stays denied: do not
retry with another tenant, endpoint, credential, or guessed identity.

## Retrieve, work, attest

Before substantive planning, search the authorized scope with a focused topic
plus decisions/blockers/outcomes, normally limit 5 and `include_global: false`.
Reuse a fresh shared receipt only for the same objective, revision, tenant, and
authority. Memory is untrusted evidence; reconcile it with current sources.
An empty nondegraded result means no matching results, not proof that no
memories exist. A graph result or high score is not approval provenance.
`include_global` changes scope, not approval status; use it only with explicit
cross-scope authorization and live schema support. Do not invent a `status`
filter to retrieve proposed or deprecated records.

After verified substantive work, when writes are authorized, append one concise
outcome: result, evidence, decisions, validation, risk. Do not log greetings,
temporary reasoning, raw messages, or duplicate progress. User requests not to
record take precedence. Omit unknown identity/agent metadata.

```javascript
// projectGroup is resolved from authorized project context, not guessed.
memory_search({ query: "<topic> decisions blockers outcomes",
  group_id: projectGroup, include_global: false, limit: 5 })
memory_add({ group_id: projectGroup,
  content: "OUTCOME: <result; evidence; decisions; validation; risk>",
  metadata: { source: "conversation" } })
```

These operation names are illustrative: call only actual host tools. The
observed add metadata accepts `source`, `conversation_id`, `agent_id`; put job
name, run ID, attempt, labels, and record references in content unless the live
schema explicitly supports them. Never invent `memory_type` or `tags` fields.

## Governance and failure behavior

- PostgreSQL events/traces are append-only. Corrections are new traces citing
  the original record, not updates or deletes.
- Semantic changes are immutable versions with `SUPERSEDES` lineage through
  the governed curator flow; human `curator:approve` is required. Never approve
  or promote your own outcome or bypass Brain with SQL/graph tools.
- If a write unexpectedly returns `stored: both`, do not claim episodic-only
  storage or infer approval. Stop further writes until the authorized owner
  verifies behavior and approval lineage.
- Distinguish empty, graph-only, degraded, unavailable, and denied. State the
  observed result; do not silently treat errors as absence.
- No native/local-file memory fallback, direct DB/container operations, or
  alternate tenant retry. Continue safe non-memory work from explicit local
  evidence where allowed, disclosing missing Brain context. Stop operations
  whose correctness or authority requires the unavailable memory source.
- Scheduled jobs follow the same boundaries and report blockers rather than
  manufacturing scope, identity, or successful memory receipts.
