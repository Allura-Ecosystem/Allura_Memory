# Story 22.2 — Tenant Onboarding API

**Status:** done
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 22
**status_evidence:** "tenants/route.ts (POST+GET) and tenants/[group_id]/route.ts (GET+PATCH) implemented with admin RBAC, group_id validation, duplicate rejection (409); tenants-api.test.ts (336 lines, 12 tests) verifies create, list, get, update, auth, duplicate rejection"

## User Story

As the Allura admin, I need an API to create and list tenants, so that onboarding a new project or business is a single API call instead of manual database edits.

## Context

- The `tenants` table (Story 22.1) is the source of truth
- Current API routes are in `src/app/api/`
- Admin-only — requires elevated auth (existing RBAC: admin > curator > viewer)
- The API should also create the MCP profile association

## Acceptance Criteria

- [ ] AC-1: `POST /api/tenants` creates a new tenant — accepts `{ group_id, name, description, owner_agent_id }`, validates group_id format, inserts into `tenants` table, returns 201 with tenant config
- [ ] AC-2: `GET /api/tenants` lists all active tenants — returns array of `{ group_id, name, description, owner_agent_id, created_at }`
- [ ] AC-3: `GET /api/tenants/:group_id` returns single tenant details including `config` JSONB
- [ ] AC-4: `PATCH /api/tenants/:group_id` updates tenant config (promotion threshold, auto-approval mode, curator schedule)
- [ ] AC-5: All endpoints require admin role — 403 for non-admin
- [ ] AC-6: Reject duplicate `group_id` with 409 Conflict
- [ ] AC-7: Unit tests verify: create, list, get, update, auth, duplicate rejection

## Tasks

1. Create `src/app/api/tenants/route.ts` (POST + GET)
2. Create `src/app/api/tenants/[group_id]/route.ts` (GET + PATCH)
3. Add RBAC check (admin role required)
4. Create `src/__tests__/tenants-api.test.ts`
5. Run `bun run typecheck && bun test`

## File List

- `src/app/api/tenants/route.ts` (NEW)
- `src/app/api/tenants/[group_id]/route.ts` (NEW)
- `src/__tests__/tenants-api.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |