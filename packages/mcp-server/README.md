# @allura/mcp-server

For developers inspecting the hosted-platform tool registry scaffold. This package declares tool policies and filters them by granted scopes; it is not the operational memory server.

**Next step:** inspect [the registry source](src/index.ts). For a connected-agent evaluation, use the shared [first-use guide](../../docs/user-guide/getting-started.md).

The scaffold's `resolveInjectedScope` returns supplied scope context; it does not authenticate a token or prove end-to-end workspace enforcement. The operational gateway and its authorization boundaries are described in [Solution Architecture](../../docs/allura/SOLUTION-ARCHITECTURE.md).

Use the package's source and tests to assess its limited contract. Do not treat a declared policy map as evidence that every production route enforces it.

*AI-assisted editorial revision, 2026-10-20; scaffold boundary retained.*
