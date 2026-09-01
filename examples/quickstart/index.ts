/**
 * Allura quickstart example — Story 24.7 AC-6
 *
 * Smallest supported integration using the PUBLIC @allura/sdk contract.
 * Requires the SDK to be built (packages/sdk/dist) and an Allura MCP HTTP
 * gateway reachable at the configured baseUrl.
 *
 * Run from the repo root:
 *   cd packages/sdk && bun run build
 *   bun run examples/quickstart/index.ts
 */
import { AlluraClient } from "@allura/sdk";

const baseUrl = process.env.ALLURA_BASE_URL ?? "http://localhost:5888";

const client = new AlluraClient({
  baseUrl,
  authToken: process.env.ALLURA_AUTH_TOKEN,
});

async function main() {
  // 1. Health / readiness (read-only)
  const health = await client.health();
  console.log("Allura ready:", health.status, "mode:", health.mode);

  // 2. Add a governed memory
  const added = await client.memory.add({
    group_id: "allura-my-project",
    user_id: "developer",
    content: "Project started with Allura SDK",
  });
  console.log("Stored memory id:", added.id);

  // 3. Search governed memories
  const results = await client.memory.search({
    group_id: "allura-my-project",
    query: "project",
    include_global: false,
    limit: 10,
  });
  console.log(`Found ${results.results.length} memories`);
}

main().catch((err) => {
  console.error("Quickstart failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
