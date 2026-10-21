# @allura/sdk

For TypeScript developers connecting an agent or application to an existing Allura Memory gateway. The client exposes memory operations, scenario-harness operations, and governed lanes through MCP Streamable HTTP.

**Start with the shared [first-use guide](../../docs/user-guide/getting-started.md).** It explains the authorized endpoint, credential and workspace prerequisites, plus the save-and-retrieve demonstration. A token's authenticated scope supplies authority; choosing a group name does not grant access.

## Use the client

The [client configuration](src/types.ts) uses `baseUrl` and `authToken`. Supply your provisioned gateway base URL and credential; do not copy a fictional user or tenant identity. Fresh saved evidence requires an explicit search mode that includes it; the canonical default is approved knowledge. Inspect the returned source and available review state rather than treating a successful save as approval.

The [quickstart source](../../examples/quickstart/index.ts) and its [instructions](../../examples/quickstart/README.md) are the maintained example. Their live execution state is recorded separately from source and contract checks.

## Choose an operation

| Task | Source |
|---|---|
| Save, search, inspect or list memories | [Memory operations](src/memory.ts) and [public types](src/types.ts) |
| Run or replay a scenario; inspect evaluation evidence | [Harness operations](src/harness.ts) |
| Open a lane, submit a snapshot or request lane review | [Lane operations](src/lanes.ts) |
| Understand transport, session and error handling | [Client](src/client.ts) and [errors](src/errors.ts) |

Lane review and memory promotion are different operations. Client code cannot grant itself a reviewer role or establish a human decision.

## Development

From this package directory, use Bun to install dependencies and run the scripts defined in [package.json](package.json):

```bash
bun install
bun run build
bun run typecheck
bun run test
```

The package declares ESM/CJS exports and declaration files. [Contract tests](test/contract.test.ts) and [consumer tests](test/dist-consumer.test.ts) check their specific package contracts; a passing package test is not a live persistence or usability result. Registry publication and a clean installation of the current package require their own evidence.

*AI-assisted editorial revision, 2026-10-20. Read the current source and validation receipts before relying on a capability claim.*
