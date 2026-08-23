// @allura/types — shared types for the Allura Hosted Platform.
//
// Tenancy model (ADR-001): the ORGANIZATION is the only tenant boundary and owns
// the `group_id`. A WORKSPACE is a `workspace_id` sub-scope WITHIN a `group_id`;
// it is isolated at the API/CHECK layer, never by minting a new `group_id`.
// `allura-system` is platform-tier only.

/** Organization tenant scope key. Pattern: ^allura-[a-z0-9-]+$ (e.g. allura-faithmeats). */
export type GroupId = `allura-${string}`;
/** Sub-scope within a group_id (a workspace). */
export type WorkspaceId = string;
export type ActorId = string;
export type RequestId = string;

export const GROUP_ID_PATTERN = /^allura-[a-z0-9-]+$/;

export function isGroupId(value: string): value is GroupId {
  return GROUP_ID_PATTERN.test(value);
}

export type Role =
  | "owner"
  | "admin"
  | "reviewer"
  | "employee"
  | "viewer"
  | "auditor"
  | "agent";

export type Scope =
  | "memory:read"
  | "memory:write"
  | "memory:delete"
  | "memory:forget"
  | "memory:promote"
  | "review:read"
  | "review:approve"
  | "review:reject"
  | "receipt:create"
  | "audit:read"
  | "audit:export"
  | "agents:create"
  | "agents:revoke"
  | "tokens:create"
  | "tokens:rotate"
  | "workspace:lock"
  | "admin:users"
  | "admin:roles"
  | "admin:budget"
  | "admin:budget:global";

export type LockMode =
  | "normal"
  | "read_only"
  | "no_agent_writes"
  | "no_promotions"
  | "full_lockdown";

export type MemoryLayer = "episodic" | "semantic";

export type MemoryStatus =
  | "raw"
  | "proposed"
  | "approved"
  | "superseded"
  | "deprecated"
  | "deleted";

/**
 * Scope context carried by every governed operation.
 * `group_id` = org (the tenant boundary); `workspace_id` = sub-scope (ADR-001).
 * `group_id` and `workspace_id` are server-derived authority values; callers
 * cannot select either. This shared type requires the workspace boundary, but
 * runtime routes must opt into the workspace-aware transaction/RLS path before
 * application enforcement can be claimed.
 */
export interface AlluraScope {
  group_id: GroupId;
  workspace_id: WorkspaceId;
  actor_id: ActorId;
  request_id: RequestId;
  scopes: Scope[];
}

export interface MCPTokenMeta {
  token_prefix: string;
  agent_name: string;
  group_id: GroupId;
  workspace_id: WorkspaceId;
  scopes: Scope[];
  expires_at: string;
  revoked: boolean;
}

export interface Provenance {
  provenance_ids: string[];
}
