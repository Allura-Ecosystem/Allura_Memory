<!-- Context: project-intelligence/system-authority | Priority: critical | Version: 1.0 | Updated: 2026-05-16 -->

# System Authority

This repo uses OAC Core plus the Allura Overlay.

## Source of Truth Order

1. Direct user request in the current conversation.
2. Developer/system instructions for the active tool.
3. `.opencode/AGENTS.md`, `.opencode/manifest.json`, and `.opencode/SKILL-OWNERSHIP.md`.
4. `.opencode/context/` files for local project context.
5. Allura Brain memories retrieved through governed MCP tools.
6. Documentation mirrors in `docs/allura/` and `docs/archive/`.

## Memory Rule

All active memory work uses `group_id: allura-system`.

Deprecated or superseded memories may remain for lineage, but normal recall must filter them out.

## Build Rule

Scout before build. Skills before Ralph. Validation before done.
