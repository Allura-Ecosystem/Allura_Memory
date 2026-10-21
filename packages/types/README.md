# @allura/types

For developers sharing hosted-platform scope and lifecycle types. **Start with [the exported types](src/index.ts).** Types describe a contract; they do not authenticate a request or enforce runtime isolation.

`GroupId` represents an organization tenant key. `WorkspaceId` represents a sub-scope within it. `AlluraScope` carries group, workspace, actor, request and granted-scope fields. Runtime services must derive and verify authority and apply the appropriate scoped transaction path.

The package also declares roles, locks, memory states and token metadata. A string matching the group pattern is a valid format, not an access grant.

See the current [data dictionary](../../docs/allura/DATA-DICTIONARY.md) for persistence and identity semantics. For the practical connected-agent task, use [Getting started](../../docs/user-guide/getting-started.md).

*AI-assisted editorial revision, 2026-10-20.*
