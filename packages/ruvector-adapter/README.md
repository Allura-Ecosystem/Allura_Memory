# @allura/ruvector-adapter

Optional, governed search adapter around **RuVector**.

> RuVector = speed and smart search. Allura = rules, trust, memory, proof.

Every call passes through `assertScope()` (org `group_id` + `workspace_id` +
`actor_id` + `request_id`, ADR-001), returns provenance, and emits an audit
context. Feedback never auto-promotes (AD-04). The adapter is **disabled by
default** so base Allura boot never depends on it (AD-09).

Status: **scaffold stub** — no vendored RuVector source; idea/dependency level.

## Surface

| Function | Guarantee |
|----------|-----------|
| `search(scope, query, hits)` | scoped; requires `memory:read`; rejects provenance-free hits |
| `recordFeedback(scope, id, signal)` | returns a proposal; `requires_human_approval: true` |
| `snapshot(scope)` / `restore(scope, id)` | scoped; returns receipts |

```bash
bun test packages/ruvector-adapter
```

See [`docs/RUVECTOR-ADAPTER.md`](./docs/RUVECTOR-ADAPTER.md),
[`LICENSE.NOTICE.md`](./LICENSE.NOTICE.md), and AD-09 in
[`docs/allura-hosted/RISKS-AND-DECISIONS.md`](../../docs/allura-hosted/RISKS-AND-DECISIONS.md).
