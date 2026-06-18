# @allura/rbac

Shared role → scope mapping and permission checks for the Allura Hosted Platform.

- `scopesForRole(role)` — canonical scopes per role (owner/admin/reviewer/employee/viewer/auditor/agent).
- `hasScope(granted, required)` — exact scope check.
- `canApprove(role, granted)` — enforces **AD-04**: agents can never approve, regardless of granted scopes.

Status: **scaffold stub.** Pure logic, no I/O. Consumes types from
[`@allura/types`](../types) (type-only import). See
[`docs/allura-hosted/DESIGN-GUARD.md`](../../docs/allura-hosted/DESIGN-GUARD.md).

```bash
bun test
```
