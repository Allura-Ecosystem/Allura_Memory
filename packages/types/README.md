# @allura/types

Shared TypeScript types for the Allura Hosted Platform.

**Tenancy (ADR-001):** `GroupId` identifies the **organization** — the only tenant
boundary. `WorkspaceId` is a sub-scope *within* a `group_id`. `AlluraScope` is the
context every governed operation carries (`group_id` + `workspace_id` + `actor_id`
+ `request_id` + `scopes`), all server-injected by Allura Guard.

Status: **scaffold stub** — types only, no runtime. See
[`docs/allura-hosted/DATA-DICTIONARY.md`](../../docs/allura-hosted/DATA-DICTIONARY.md).

```bash
bun test        # type guards
```
