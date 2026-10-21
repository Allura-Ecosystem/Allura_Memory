# Retrieve a decision in another session

This developer example uses the public `@allura/sdk` package to save a PostgreSQL decision, start a new client session, and search for the exact saved record.

Use the [shared getting-started guide](../../docs/user-guide/getting-started.md) first. You need an existing authenticated gateway and an authorized tenant/workspace. This example does not install the service or create credentials.

From the repository root:

```bash
bun install
(cd packages/sdk && bun run build)
```

Supply `ALLURA_BASE_URL`, `ALLURA_AUTH_TOKEN`, and `ALLURA_GROUP_ID` through your approved local secret/environment tooling. Use the gateway's base origin, such as `http://localhost:6477` only when an operator has actually provisioned it there. The token must already bind an authorized principal and workspace. A valid group name alone grants no access.

Run:

```bash
bun run examples/quickstart/index.ts --allow-write
```

The example appends one record and does not automatically retry the save. It fails unless the later session retrieves the same ID and content. A successful run prints the saved ID, reported pending-review value, retrieval source and provenance. An omitted review value remains `not_reported`; neither storage location nor search score is approval.

For a sanitized machine-readable receipt and explicit MCP session checks, use the [first-use runner](../../scripts/first-use-memory.ts) described in the shared guide.

Status: source and offline contract checks are available. A successful live run, independent human-review demonstration, clean installation and human usability study require their own evidence.

*AI-assisted correction, 2026-10-20; no live success is implied by this example.*
