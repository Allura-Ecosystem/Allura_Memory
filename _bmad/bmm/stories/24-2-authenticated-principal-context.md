# Story 24.2 — Authenticated Principal Context

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** ready-for-dev
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Story 24.1

## User Story

As an enterprise platform owner, I need tenant, user, and role authority derived from a verified principal, so that an agent cannot gain access by submitting trusted-looking request fields.

## Context

The HTTP gateway accepts tenant and actor identifiers in tool arguments, and elevated tool gating currently reads a role from request parameters. A shared bearer token may also be optional. Format validation is not authorization. This story establishes one transport-independent principal contract and makes production authentication fail closed.

## Architectural Contract

```ts
type PrincipalContext = {
  principalId: string
  tenantIds: readonly string[]
  roles: readonly ("admin" | "curator" | "viewer")[]
  authMethod: "mcp_token" | "service_identity" | "dev_local"
  sessionId: string
}
```

The exact type may vary, but every trusted field must originate from verified credentials or explicit local-development configuration. Tool arguments are resource selectors, never sources of authority.

## Scope

- Authenticate HTTP requests against hashed, revocable MCP credentials.
- Resolve one `PrincipalContext` at the transport boundary and pass it through tool dispatch, kernel policy, and audit.
- Bind stdio/service operation to an explicit configured service principal and tenant allowlist.
- Reject tenant/user/role argument mismatches before business logic runs.
- Audit authentication and authorization decisions without logging credentials.

## Out of Scope

- Building login UI or selecting an enterprise identity provider.
- Authorization policy beyond the existing admin/curator/viewer model.
- Database row-level security, which is Story 24.3.

## Acceptance Criteria

- [ ] AC-1: Production HTTP startup fails when no supported authentication configuration is present.
- [ ] AC-2: Bearer credentials are compared using a timing-safe method and stored only as hashes where persisted.
- [ ] AC-3: Successful authentication produces a typed `PrincipalContext`; tool handlers cannot construct or override it from arguments.
- [ ] AC-4: `group_id`, `user_id`, `curator_id`, and `role` cannot elevate the principal. A mismatched selector returns a stable authorization error.
- [ ] AC-5: Elevated MCP tools authorize from `PrincipalContext.roles`, never `request.params.role` or another caller-controlled value.
- [ ] AC-6: Stdio/service mode requires an explicit service identity and tenant allowlist; production has no anonymous default.
- [ ] AC-7: Audit events record principal ID, effective tenant, roles used, session ID, tool, decision, and reason code, while excluding raw tokens and sensitive payloads.
- [ ] AC-8: Revoked or expired credentials fail on the next request according to the documented cache policy.
- [ ] AC-9: Adversarial tests cover missing auth, malformed auth, forged role, forged tenant, forged curator ID, revoked token, expired token, and valid least-privilege access.
- [ ] AC-10: Existing authorized memory and curator flows continue to work with principal context injected.

## Implementation Files

- `src/lib/auth/principal-context.ts` — new trusted identity contract.
- `src/lib/auth/mcp-authenticator.ts` — new credential verification and revocation path.
- `src/mcp/canonical-http-gateway.ts` — resolve principal once and remove parameter-derived role authority.
- `src/mcp/memory-server-canonical.ts` — bind service principal for non-HTTP transport.
- `src/kernel/policy.ts` and `src/kernel/proof.ts` — consume trusted principal claims.
- `src/lib/auth/__tests__/principal-context.test.ts` — unit contract tests.
- `src/__tests__/mcp-auth-adversarial.test.ts` — gateway-level adversarial matrix.
- `.env.example` and deployment configuration — secure defaults and explicit local-dev mode.

## Tasks

- [ ] Document current auth entrypoints and all request fields used as authority.
- [ ] Implement credential verification and `PrincipalContext` resolution.
- [ ] Thread principal context through MCP dispatch, canonical tools, policy evaluation, and audit.
- [ ] Replace parameter-derived role and curator authority.
- [ ] Add explicit local development mode that refuses to activate in production.
- [ ] Add credential revocation/expiry behavior and tests.
- [ ] Run existing MCP contract tests plus the new adversarial suite.

## Validation and Evidence

Evidence must include a table of attack case, expected status/reason code, actual result, and audit-event ID. Token values must never appear in logs or artifacts.

## Definition of Done

- No production request reaches a memory or governance handler without a verified principal.
- No caller-controlled field can expand the principal's tenant or role authority.
- Documentation impact is recorded for BLUEPRINT, SOLUTION-ARCHITECTURE, DATA-DICTIONARY, REQUIREMENTS-MATRIX, and RISKS-AND-DECISIONS.

## Dev Agent Record

**Status:** pending

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
