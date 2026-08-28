# Minimal Allura integration example
# Story 24.7 AC-6: smallest supported integration

This example uses the **public** `@allura/sdk` contract (Story 24.7 AC-1):
typed clients for health/readiness and governed memory, without importing any
server internals.

```typescript
import { AlluraClient } from "@allura/sdk";

// The SDK client is configured with a config object (baseUrl + optional auth).
const client = new AlluraClient({
  baseUrl: "http://localhost:3201",
  authToken: process.env.ALLURA_AUTH_TOKEN, // optional in dev mode
});

// Health / readiness (read-only)
const health = await client.health();
console.log("Allura ready:", health.status, "mode:", health.mode);

// Add a governed memory
const added = await client.memory.add({
  group_id: "allura-my-project",
  user_id: "developer",
  content: "Project started with Allura SDK",
});
console.log("Stored memory id:", added.id);

// Search governed memories
const results = await client.memory.search({
  group_id: "allura-my-project",
  query: "project",
  include_global: false,
  limit: 10,
});
console.log(`Found ${results.results.length} memories`);
```

## Running it

From the repo root:

```bash
bun install
bun run build --filter @allura/sdk   # or: cd packages/sdk && bun run build
bun run examples/quickstart/index.ts
```

> The SDK must be built first (`packages/sdk/dist`) so the package `exports`
> resolve to the compiled ESM/CJS output.
