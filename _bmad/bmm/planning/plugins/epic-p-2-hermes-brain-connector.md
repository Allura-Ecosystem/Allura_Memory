# Epic P-2 — Hermes Allura Brain Connector

**Status:** Planned
**Owner:** Brooks (architecture) + Woz (implementation)
**Tenant:** allura-system
**Repo:** `plugins/allura-plugins/plugins/hermes-allura-brain/`

## Goal

Ship a typed, tenant-scoped MCP connector that lets Hermes subagents query Allura Brain before starting work and write outcomes back after completing — with auth, tenant propagation, and degraded-state handling.

## Product Boundary

The connector is a narrow MCP tool surface. It exposes `memory_search` and `memory_add` to subagents. It does not expose governance, curator, or mutation tools. It enforces `group_id` from the delegation context, not from the subagent.

## Current State

- Connector exists in `plugins/hermes-allura-brain/`
- Needs typed contract, auth scoping, and health/retry validation

## Story Map

| Story | Outcome | Dependency | Ship condition |
|---|---|---|---|
| P-2.1 | Connector contract — typed MCP tool surface | — | `memory_search` and `memory_add` are typed, validated, and documented |
| P-2.2 | Auth and tenant scoping — group_id propagation | P-2.1 | group_id inherited from delegation context, not self-asserted; cross-tenant denied |
| P-2.3 | Connection health and retry — degraded state handling | P-2.1 | Brain-down detected, retry with backoff, degraded state surfaced to subagent |

## Dependencies

- Allura Brain MCP server (Allura_Memory)
- Hermes delegation framework

## Rollback

Disable the connector. Subagents fall back to direct MCP calls or no memory access.