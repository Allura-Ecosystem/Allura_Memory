# Minimal Allura integration example
# Story 24.7 AC-6: smallest supported integration

```typescript
import { AlluraClient } from "@allura/sdk";

const client = new AlluraClient("http://localhost:6477/mcp");

// Check health
const health = await client.health();
console.log("Allura ready:", health.ready);

// Add a memory
const { id } = await client.addMemory({
  group_id: "allura-my-project",
  user_id: "developer",
  content: "Project started with Allura SDK",
});

// Search memories
const results = await client.searchMemory({
  group_id: "allura-my-project",
  query: "project",
  include_global: false,
  limit: 10,
});

console.log(`Found ${results.results.length} memories`);
```