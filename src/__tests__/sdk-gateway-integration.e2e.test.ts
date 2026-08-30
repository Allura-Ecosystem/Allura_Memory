/**
 * SDK ↔ canonical gateway integration test (Story 24.7 AC-2, follow-up item 17)
 *
 * Exercises the @allura/sdk AlluraClient against the REAL canonical HTTP/MCP
 * gateway — not injected fetch mocks. This is the AC-2 contract test the
 * hermetic unit tests cannot provide: if the gateway's /health shape or
 * /mcp tools/call envelope drifts, this test fails.
 *
 * Gated on RUN_E2E_TESTS=true (joins the live-DB e2e lane, which starts the
 * stack). Usage: RUN_E2E_TESTS=true bun vitest run src/__tests__/sdk-gateway-integration.e2e.test.ts
 */

import { AlluraClient } from "@allura/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const GATEWAY_URL = process.env.ALLURA_MCP_HTTP_URL || "http://localhost:5888";
const AUTH_TOKEN = process.env.ALLURA_AUTH_TOKEN || "test-bearer-token-allura-2026";

const shouldRun = process.env.RUN_E2E_TESTS === "true";
const describeIf = shouldRun ? describe : describe.skip;

describeIf("SDK ↔ canonical gateway integration (AC-2)", () => {
  let client: AlluraClient;

  beforeAll(() => {
    client = new AlluraClient({
      baseUrl: GATEWAY_URL,
      authToken: AUTH_TOKEN,
      retries: 0,
    });
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it("health() parses the real gateway /health response", async () => {
    const health = await client.health();
    expect(health.status).toBeDefined();
    // The canonical gateway reports interface: "mcp-http" (not "rest").
    expect(health.interface).toBe("mcp-http");
  });

  it("memory.search sends a tools/call envelope the gateway accepts", async () => {
    // A search against a fresh tenant returns an empty result set — the
    // envelope round-trip is what matters here, not the data.
    const result = await client.memory.search({
      group_id: "allura-sdk-gateway-e2e",
      query: "integration test",
      limit: 5,
    });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("harness.inspect round-trips through the gateway", async () => {
    const result = await client.harness.inspect();
    expect(Array.isArray(result.receipts)).toBe(true);
    expect(Array.isArray(result.artifacts)).toBe(true);
  });
});
