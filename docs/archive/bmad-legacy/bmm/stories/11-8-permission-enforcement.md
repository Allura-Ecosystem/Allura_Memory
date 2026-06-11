# Story 11.8 — Permission Profile Enforcement

**Title:** Wire PermissionProfile to API routes and MCP tools for data isolation
**Priority:** P1-High | **Complexity:** Medium | **Agent:** Woz + Pike
**Traceability:** Epic 11 → NFR1 (tenant isolation), NFR7 (human approval), B21 (RBAC), B28 (controlled APIs) → permission tests → `bun test src/lib/auth/`

## User Story

As an Allura operator,
I want different users, agents, and API keys to see only the data they're permitted to access,
So that vendor contacts can't see each other's memories and agents can't overreach their scope.

## Context

The `PermissionProfile` type already exists in `src/lib/auth/permission-profile.ts` with:
- `role_ids`: admin, approver, auditor, viewer, service_actor, curator
- `allowed_actions`: memory:read, approval:decide, audit:export, etc.
- `memory_scope`: which memory namespaces this profile can access
- `applies_to`: human, service, agent

The gap is **enforcement** — profiles are validated but not checked at query time.

## Acceptance Criteria

### AC1: Query-Level User Scoping

**Given** a viewer-role user calls `GET /api/memory?groupId=allura-system`,
**When** the API processes the request,
**Then** it automatically adds `AND user_id = $callerUserId` to the query.
**And** admin/curator roles see all memories in the group (no user_id filter).
**And** the scope decision is logged as an audit event.

### AC2: PermissionProfile Middleware

**Given** a request to any `/api/memory/*` or `/api/curator/*` route,
**When** the middleware resolves the caller's PermissionProfile,
**Then** it checks `allowed_actions` contains the required action for that route.
**And** returns 403 with `reason` if denied.
**And** the action-to-route mapping is:

| Route | Required Action |
|-------|----------------|
| `GET /api/memory` | `memory:read` |
| `POST /api/memory` | `memory:write` |
| `DELETE /api/memory/[id]` | `memory:delete` |
| `GET /api/memory/search` | `memory:read` |
| `GET /api/memory/graph` | `memory:read` |
| `GET /api/curator/proposals` | `approval:read` |
| `POST /api/curator/approve` | `approval:decide` |
| `POST /api/curator/reject` | `approval:decide` |
| `GET /api/audit/events` | `audit:read` |
| `GET /api/audit/events` (with export) | `audit:export` |

### AC3: Agent MCP Scope Enforcement

**Given** an agent calls `memory_search` via MCP,
**When** the MCP tool handler resolves the agent's PermissionProfile,
**Then** queries are filtered by the agent's `memory_scope` array.
**And** an agent with `memory_scope: ["allura-system"]` cannot search `allura-mortagate` memories.
**And** scope violations are logged as `access_denied` events.

### AC4: API Key Scoping

**Given** an API request authenticated by key (not Clerk JWT),
**When** the key is resolved,
**Then** it maps to a PermissionProfile stored alongside the key.
**And** the profile's `allowed_actions` and `memory_scope` constrain the request.
**And** keys without a profile default to `viewer` with `memory_scope: [key.group_id]`.

### AC5: Dashboard Respects Permissions

**Given** a viewer logs into the dashboard,
**When** they navigate to `/dashboard/search`,
**Then** they see only their own memories (not all users in the group).
**And** `/dashboard/governance` shows read-only view (no approve/reject buttons).
**And** `/dashboard/settings` hides admin-only sections.

### AC6: Export Scoping

**Given** a viewer requests CSV export from `/api/audit/events`,
**When** the export runs,
**Then** it includes only events where `agent_id` or `user_id` matches the caller.
**And** admin export includes all events in the group.

## Implementation Notes

- `src/lib/auth/permission-profile.ts` already has the types and validation — extend with a `resolveProfile(authUser)` function
- Create `src/lib/auth/enforce.ts` with `enforceAction(profile, requiredAction)` and `scopeQuery(profile, baseQuery)`
- Wire into existing API routes as middleware (not per-route inline checks)
- Use existing `group_id` validation as the first gate, permission profile as the second
- Default profiles: admin gets all actions, curator gets memory:read + approval:decide, viewer gets memory:read only
- Font: IBM Plex Sans for any new UI (permission denied pages, scoped views)

## Validation

```bash
bun test src/lib/auth/
bun test src/lib/auth/permission-profile.test.ts
bun test src/lib/auth/enforce.test.ts
bun vitest run -t "should deny viewer access to approve"
bun vitest run -t "should scope viewer queries to own user_id"
```

## Definition of Done

- [ ] Viewer cannot see other users' memories
- [ ] Agent cannot access memories outside its memory_scope
- [ ] API keys are scoped to a PermissionProfile
- [ ] All 403 responses include structured reason
- [ ] Access denied events logged to PostgreSQL (append-only)
- [ ] Dashboard hides actions the user can't perform
- [ ] No regression on existing admin/curator workflows
