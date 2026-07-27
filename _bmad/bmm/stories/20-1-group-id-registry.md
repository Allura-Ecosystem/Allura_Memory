# Story 20.1 — Create group_id Registry

**Status:** done
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 20

## User Story

As the Allura architect, I need a config file that maps each agent to its default tenant `group_id`, so that agents automatically use the correct tenant namespace without manually passing `group_id` on every call.

## Context

- The kernel (`src/kernel/syscalls.ts`) enforces `group_id` on every read/write via CHECK constraint `^allura-[a-z0-9-]+$`
- Hermes config has `inherit_mcp_toolsets: true` in delegation settings — children inherit parent's MCP tools
- Docker MCP profiles created: `openclaw`, `faithmeats`, `difference-driven`, `coding`
- No registry exists today — `DEFAULT_GROUP_ID` is set via env var only

## Acceptance Criteria

- [ ] AC-1: A YAML file exists at `.opencode/config/group-id-registry.yaml` mapping agent names to `default_group_id` and optional `allowed_group_ids`
- [ ] AC-2: Registry includes entries for: Gilliam (`allura-system`), Troy (`allura-system` with cross-tenant access), OpenWork (`allura-system`), nonprofit agents (`allura-difference-driven` only)
- [ ] AC-3: A TypeScript loader (`src/lib/config/group-id-registry.ts`) reads the YAML and exposes `getDefaultGroupId(agentId)` and `getAllowedGroupIds(agentId)`
- [ ] AC-4: The loader validates every `group_id` in the registry matches `^allura-[a-z0-9-]+$` at startup — fail closed on invalid format
- [ ] AC-5: Unit tests verify: valid registry loads, invalid group_id rejected, missing agent returns `allura-system` fallback, cross-tenant agent returns all allowed tenants

## Tasks

1. Create `.opencode/config/group-id-registry.yaml` with agent entries
2. Create `src/lib/config/group-id-registry.ts` loader
3. Create `src/__tests__/group-id-registry.test.ts`
4. Run `bun run typecheck && bun test`

## File List

- `.opencode/config/group-id-registry.yaml` (NEW)
- `src/lib/config/group-id-registry.ts` (NEW)
- `src/__tests__/group-id-registry.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |