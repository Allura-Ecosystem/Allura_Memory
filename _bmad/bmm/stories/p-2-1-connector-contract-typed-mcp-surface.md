# Story P-2.1 — Connector Contract — Typed MCP Tool Surface

**Status:** Planned
**Owner:** Brooks + Pike
**Depends on:** —
**Blocks:** P-2.2, P-2.3

## Outcome

`memory_search` and `memory_add` are typed, validated, and documented as a narrow MCP tool surface for Hermes subagents.

## Acceptance Criteria

- [ ] `memory_search` accepts `query`, `group_id`, `limit`, `min_score` — all typed and validated.
- [ ] `memory_add` accepts `content`, `group_id`, `user_id`, `metadata` — all typed and validated.
- [ ] No governance, curator, or mutation tools are exposed.
- [ ] Tool schemas are documented with examples.
- [ ] Invalid input returns typed errors, not generic 500s.

## Evidence

- Tool schema definitions.
- Input validation tests.
- Documentation with examples.

## Rollback

Connector remains untyped. Subagents may send invalid input; errors are generic.