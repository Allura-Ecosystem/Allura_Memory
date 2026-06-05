---
name: allura-scout
description: Use before planning, building, reviewing, or handing off work when token cost or context drift matters. Produces compact evidence-backed ContextPackets from local files, Allura memory, and relevant docs. Read-only by default.
---

# Allura Scout

Use Allura Scout to reduce token cost before expensive agent work.

## When to Use

Use this skill when:

- a task may need repo context or prior decisions;
- an agent is about to read many files;
- memory search could prevent duplicate work;
- a handoff needs a compact packet;
- the user asks to reduce token cost or context load.

## Operating Rule

Scout is read-only by default.

Do not edit files, mutate databases, or mark work done. The only allowed write is an optional closeout receipt after the packet is produced.

## Protocol

1. Restate the user's goal in one sentence.
2. Search Allura memory for prior decisions, blockers, and outcomes.
3. Inspect only files likely to matter.
4. Summarize relevant evidence with reasons.
5. Flag stale, conflicting, or untrusted context.
6. Return a `ContextPacket` under the token budget.
7. Recommend the next route: product, architecture, build, review, validation, or stop.

## Token Budget

Default target: 5,000 context tokens.
Hard ceiling: 8,000 context tokens unless the user explicitly approves more.

Prefer:

- paths over full files;
- snippets over full logs;
- newest episodic traces for recent work;
- canonical docs for architecture truth;
- reasons for inclusion.

Avoid:

- dumping entire files;
- loading irrelevant docs;
- treating raw memory as canonical truth;
- repeating context already known to the receiving agent.

## Output Format

```yaml
goal: "..."
summary: "..."
relevant_files:
  - path: "..."
    reason: "..."
relevant_memories:
  - id: "..."
    reason: "..."
decisions:
  - "..."
risks:
  - "..."
token_budget:
  target_context_tokens: 5000
  hard_limit_tokens: 8000
recommended_route:
  next_agent: "builder | reviewer | architect | product | validation | stop"
  why: "..."
```

## Public Boundary

Public users see Allura Scout as a context-reduction plugin.
Internal Team RAM role names are implementation details, not public product language.
