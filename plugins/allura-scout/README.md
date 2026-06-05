# Allura Scout

Allura Scout is a public plugin package for low-token context discovery.
It helps agents start with a small, evidence-backed context packet instead of
loading an entire repository, memory history, or log stream.

## Promise

Scout does not decide or implement. Scout finds the smallest useful context,
explains why each item matters, and hands a compact packet to the next agent.

## What Users Get

- A read-only context discovery protocol.
- A reusable `ContextPacket` schema.
- A `scout-context` command prompt for producing compact packets.
- Token budget guidance for memory, file, and evidence retrieval.
- Guardrails against dumping whole files, giant logs, or stale memory.

## Default Contract

```text
Input: user goal + optional paths
Output: ContextPacket
Mutation: none by default
Writeback: optional closeout receipt only
```

## Commands

- `scout-context`: search local files and Allura memory, then return a compact packet.

## Context Packet Shape

```yaml
goal: what the user is trying to do
summary: smallest useful briefing
relevant_files:
  - path: README.md
    reason: public onboarding entry point
relevant_memories:
  - id: memory-id
    reason: prior decision or blocker
risks:
  - stale docs or unsupported claim
  target_context_tokens: 5000
  hard_limit_tokens: 8000
recommended_route:
  next_agent: builder | reviewer | architect | product
  why: why this route fits
```

Full schema: [`schemas/context-packet.schema.json`](./schemas/context-packet.schema.json)

## Validation

Run:

```bash
python3 plugins/allura-scout/scripts/validate_plugin.py plugins/allura-scout
```

## Public Language

Use **Allura Scout** or **Context Scout** in public docs.
Do not require public users to know Team RAM's internal Scout role.
