# Story 22.5 — Profile Export/Import Documentation

**Status:** ready-for-dev
**Owner:** Brooks → Fowler
**group_id:** allura-system
**Epic:** 22

## User Story

As the Allura ops lead, I need documented workflows for exporting and importing Docker MCP profiles, so that new machines can be onboarded with the correct tool configuration in minutes.

## Context

- Docker MCP profiles created: `openclaw`, `faithmeats`, `difference-driven`, `coding`
- `docker mcp profile export <id> <file>` and `docker mcp profile import <file>` are available
- No documentation exists for how to use these with Allura
- New machines (laptop, nonprofit team) need to import the right profiles

## Acceptance Criteria

- [ ] AC-1: A README exists at `_bmad/bmm/planning/profiles/README.md` documenting each profile, its tenant, tools, and restrictions
- [ ] AC-2: Export commands are documented: `docker mcp profile export faithmeats ./faithmeats-profile.yaml`
- [ ] AC-3: Import commands are documented: `docker mcp profile import ./faithmeats-profile.yaml`
- [ ] AC-4: Each profile has a YAML file in `_bmad/bmm/planning/profiles/` (exported and committed)
- [ ] AC-5: The README includes a "New Machine Onboarding" section: install Docker → import profile → set `DEFAULT_GROUP_ID` env var → start gateway
- [ ] AC-6: The README cross-references the tenant registry (Story 22.1) and the onboarding API (Story 22.2)

## Tasks

1. Export each profile: `docker mcp profile export openclaw ./_bmad/bmm/planning/profiles/openclaw.yaml` (repeat for each)
2. Create `_bmad/bmm/planning/profiles/README.md`
3. Document each profile's purpose, tenant, tools, and restrictions
4. Write the onboarding section
5. Verify the import workflow on a clean profile list

## File List

- `_bmad/bmm/planning/profiles/README.md` (NEW)
- `_bmad/bmm/planning/profiles/openclaw.yaml` (NEW — exported)
- `_bmad/bmm/planning/profiles/faithmeats.yaml` (NEW — exported)
- `_bmad/bmm/planning/profiles/difference-driven.yaml` (NEW — exported)
- `_bmad/bmm/planning/profiles/coding.yaml` (NEW — exported)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |