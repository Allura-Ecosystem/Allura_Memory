// Policy guard — every ruvector-adapter call passes through here.
// Enforces ADR-001 scope (org group_id + workspace_id) + audit context.
// RuVector accelerates search; Allura Guard owns tenancy, scope, and audit (AD-09).

import type { AlluraScope } from "@allura/types";

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

const GROUP_ID_PATTERN = /^allura-[a-z0-9-]+$/;

/**
 * Assert a fully-formed scope context. Throws PolicyError on any missing field.
 * group_id = organization (the tenant boundary); workspace_id = sub-scope (ADR-001).
 */
export function assertScope(
  scope: Partial<AlluraScope> | undefined,
): asserts scope is AlluraScope {
  if (!scope) throw new PolicyError("missing scope context");
  const { group_id, workspace_id, actor_id, request_id } = scope as AlluraScope;
  if (!group_id || !GROUP_ID_PATTERN.test(group_id)) {
    throw new PolicyError("invalid or missing group_id (org tenant boundary)");
  }
  if (!workspace_id) throw new PolicyError("missing workspace_id (sub-scope)");
  if (!actor_id) throw new PolicyError("missing actor_id");
  if (!request_id) throw new PolicyError("missing request_id");
}

/** Audit record emitted alongside every adapter result. */
export interface AuditContext {
  group_id: string;
  workspace_id: string;
  actor_id: string;
  request_id: string;
  action: string;
  at: string;
}

export function auditContext(scope: AlluraScope, action: string): AuditContext {
  assertScope(scope);
  return {
    group_id: scope.group_id,
    workspace_id: scope.workspace_id,
    actor_id: scope.actor_id,
    request_id: scope.request_id,
    action,
    at: new Date().toISOString(),
  };
}
