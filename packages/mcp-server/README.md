# @allura/mcp-server

MCP Gateway tool registry (scaffold stub) for the Allura Hosted Platform.

The full gateway validates a bearer MCP token via Allura Guard, injects the org
`group_id` + `workspace_id` server-side (ADR-001), checks scopes, executes the
memory tool, and writes an audit event. This stub provides the tool registry and
scope-gated exposure only.

Status: **scaffold stub.** See
[`docs/allura-hosted/DESIGN-MCP-GATEWAY.md`](../../docs/allura-hosted/DESIGN-MCP-GATEWAY.md).

```bash
bun test
```
