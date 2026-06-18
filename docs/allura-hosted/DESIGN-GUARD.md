# DESIGN-GUARD — Security Gateway

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Anchor: [BLUEPRINT.md](./BLUEPRINT.md) (F6–F12). Related: [DESIGN-MCP-GATEWAY.md](./DESIGN-MCP-GATEWAY.md), [DESIGN-AUDIT.md](./DESIGN-AUDIT.md), [SECURITY.md](./SECURITY.md), [THREAT-MODEL.md](./THREAT-MODEL.md).

## Overview

Allura Guard is the **single policy gate** (AD-07) in front of all MCP and API actions. It authenticates, injects `group_id`, checks scopes and rate limits, enforces lock modes, scans for secrets, and audits every decision.

## Functional Requirements

| ID | Implementation detail |
|----|-----------------------|
| F6 | Inject org `group_id` + `workspace_id` from the authenticated principal; reject any client-supplied scope. Workspace isolation is enforced at the API/CHECK layer (ADR-001). |
| F7 | Validate MCP tokens / API keys: hash compare, expiry, revoked flag; update `last_used_at`. |
| F8 | Enforce scope check against the action's required scope. |
| F9 | Apply rate limits per token/user/workspace/agent. |
| F10 | Run secret scan on inbound memory content before storage. |
| F11 | Enforce workspace lock modes. |
| F12 | Write an audit event for every permit and deny. |

## API Reference (token & lock management)

| Method | Path | Body | Response | Errors |
|--------|------|------|----------|--------|
| POST | `/tokens` | `{workspace_id, agent_name, scopes, expires_at}` | `{raw_token (once), prefix, id}` | 401, 403 |
| POST | `/tokens/:id/rotate` | — | `{raw_token (once), prefix}` | 401, 403, 404 |
| POST | `/tokens/:id/revoke` | — | `{revoked:true}` | 401, 403, 404 |
| POST | `/workspaces/:id/lock` | `{lock_mode}` | `{lock_mode}` | 401, 403 |

## Decision Chain

```mermaid
flowchart TD
  A[Inbound action] --> B{Token/session valid?}
  B -- no --> D[Deny + audit]
  B -- yes --> C{Expired/revoked?}
  C -- yes --> D
  C -- no --> E{Workspace + group_id resolved?}
  E -- no --> D
  E -- yes --> F{Scope allows action?}
  F -- no --> D
  F -- yes --> G{Rate limit ok?}
  G -- no --> D
  G -- yes --> H{Lock mode permits?}
  H -- no --> D
  H -- yes --> I{Secret scan clean? (writes)}
  I -- no --> D
  I -- yes --> J[Permit + execute + audit]
```

## Business Rules / Constraints

- `group_id` (org) and `workspace_id` are **always** injected server-side; a request carrying its own scope is rejected (RK-01). Cross-workspace reads within the same org are blocked at the API/CHECK layer.
- Token comparison is hash-based; raw tokens never logged (AD-03, RK-03).
- A `deny` is as auditable as a `permit` (F12, RK-06).
- Lock mode `no_agent_writes` denies agent writes while permitting human writes.
- Rate-limit breach returns 429 and is audited (RK-04).

## Use Cases

- **AG-UC1:** Agent calls `memory_add`; Allura Guard injects `group_id`, checks `memory:write`, permits, audits.
- **AG-UC2:** Revoked token used → deny + audit.
- **AG-UC3:** Memory content with an API key triggers secret scan → write denied (RK-08).
- **AG-UC4:** Workspace in `full_lockdown` → all non-admin actions denied.

## Important Constraints

- Allura Guard is on the request hot path; checks must be O(1)/indexed lookups.
- Fail closed: any uncertainty resolves to deny + audit.
