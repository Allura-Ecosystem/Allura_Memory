# @allura/rbac

For developers using the hosted-platform role-to-scope helpers. This package is pure permission logic; it does not authenticate callers or apply database access controls.

**Next step:** inspect [the role map and helpers](src/index.ts), using the shared [scope types](../types/src/index.ts).

- `scopesForRole(role)` returns the package's configured role scopes.
- `hasScope(granted, required)` checks membership in a supplied scope list.
- `canApprove(role, granted)` rejects the `agent` role and otherwise requires `review:approve`.

The last helper is not proof of a human identity or a completed human review. Runtime authentication, actor separation and route-level enforcement require their own checks. See [the data contract](../../docs/allura/DATA-DICTIONARY.md) and [requirements](../../docs/allura/REQUIREMENTS-MATRIX.md).

For a memory-service evaluation, use [Getting started](../../docs/user-guide/getting-started.md).

*AI-assisted editorial revision, 2026-10-20; package scope verified against source, live enforcement not established here.*
