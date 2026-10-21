# @allura/ruvector-adapter

For developers inspecting an optional governed-search scaffold. It is disabled by default and is distinct from the production PostgreSQL/RuVector graph adapter in the main service.

**Start with [the package design](docs/RUVECTOR-ADAPTER.md)** and [exports](src/index.ts). For the memory service's operating boundary, see [Solution Architecture](../../docs/allura/SOLUTION-ARCHITECTURE.md); for first use, follow [Getting started](../../docs/user-guide/getting-started.md).

## Source contract

| Surface | What this package declares |
|---|---|
| [Policy](src/policy.ts) | Requires scoped context before an operation |
| [Search](src/search.ts) | Checks read scope and supplied hit provenance |
| [Feedback](src/feedback.ts) | Returns a proposal marked as requiring human approval |
| [Snapshot](src/snapshot.ts) | Returns scoped snapshot/restore receipts |
| [Client](src/client.ts) | Explicit opt-in configuration |

These helpers and receipts do not prove live search quality, durable restoration, or a completed human approval. Inspect their implementations and tests before building a deployment claim around them. Preserve [the dependency attribution](LICENSE.NOTICE.md).

*AI-assisted editorial revision, 2026-10-20; scaffold and production adapter kept distinct.*
