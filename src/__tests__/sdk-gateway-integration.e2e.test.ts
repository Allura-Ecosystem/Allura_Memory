/**
 * SDK ↔ canonical gateway integration test (Story 24.7 AC-2, follow-up item 17)
 *
 * Exercises the @allura/sdk AlluraClient against the REAL canonical HTTP/MCP
 * gateway — not injected fetch mocks. This is the AC-2 contract test the
 * hermetic unit tests cannot provide: if the gateway's /health shape or
 * /mcp tools/call envelope drifts, this test fails.
 *
 * The gateway runs in mcp_token mode (ALLURA_MCP_TOKEN_SECRET), so the test
 * mints a real per-caller credential via createToken() — the same path the
 * hosted-mcp e2e uses — and authenticates the SDK with it.
 *
 * Gated on RUN_E2E_TESTS=true (joins the live-DB e2e lane, which starts the
 * stack). Usage: RUN_E2E_TESTS=true bun vitest run src/__tests__/sdk-gateway-integration.e2e.test.ts
 */

process.env.ALLURA_MCP_TOKEN_SECRET ??= "sdk-gateway-e2e-secret-key-0001";

import { AlluraClient } from "@allura/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool } from "@/lib/postgres/connection";
import { createToken } from "@/lib/mcp-token/repository";
import { createWorkspace } from "@/lib/workspace/repository";

const GATEWAY_URL = process.env.ALLURA_MCP_HTTP_URL || "http://localhost:5888";
const GROUP = "allura-sdk-gateway-e2e";

const shouldRun = process.env.RUN_E2E_TESTS === "true";
const describeIf = shouldRun ? describe : describe.skip;

describeIf("SDK ↔ canonical gateway integration (AC-2)", () => {
  let client: AlluraClient;
  let writerClient: AlluraClient;
  let reviewerClient: AlluraClient;
  let rawToken: string;

  beforeAll(async () => {
    const ws = await createWorkspace({ group_id: GROUP, name: "SDK Gateway E2E", created_by: "e2e" });
    rawToken = (
      await createToken({
        group_id: GROUP,
        workspace_id: ws.workspace_id,
        agent_name: "sdk-e2e",
        scopes: ["memory:read", "memory:write", "audit:read"],
      })
    ).raw;

    client = new AlluraClient({
      baseUrl: GATEWAY_URL,
      authToken: rawToken,
      retries: 0,
    });

    const writerToken = await createToken({
      group_id: GROUP,
      workspace_id: ws.workspace_id,
      agent_name: "woz",
      scopes: ["memory:write"],
    });
    const reviewerToken = await createToken({
      group_id: GROUP,
      workspace_id: ws.workspace_id,
      agent_name: "pike",
      scopes: ["review:approve"],
    });
    writerClient = new AlluraClient({ baseUrl: GATEWAY_URL, authToken: writerToken.raw, retries: 0 });
    reviewerClient = new AlluraClient({ baseUrl: GATEWAY_URL, authToken: reviewerToken.raw, retries: 0 });
  });

  afterAll(async () => {
    await Promise.all([client.disconnect(), writerClient.disconnect(), reviewerClient.disconnect()]);
    await closePool();
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
      group_id: GROUP,
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

  it("advertises and executes governed lane open, snapshot, and review through authenticated SDK principals", async () => {
    const init = await fetch(`${GATEWAY_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "lane-list-init",
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "lane-list-e2e", version: "1" } },
      }),
    });
    expect(init.ok).toBe(true);
    const sessionId = init.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    await init.text();
    const listed = await fetch(`${GATEWAY_URL}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "mcp-session-id": sessionId!,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: "lane-list", method: "tools/list", params: {} }),
    });
    const listedText = await listed.text();
    for (const tool of ["governed_lane_open", "governed_lane_snapshot", "governed_lane_review"]) {
      expect(listedText).toContain(`\"name\":\"${tool}\"`);
    }

    await expect(writerClient.lanes.open({
      group_id: GROUP,
      lane_id: "agent-lane-woz",
      base_revision: "sdk-gateway-base-1",
    })).resolves.toMatchObject({ lane_id: "agent-lane-woz", writer_id: "woz", status: "active" });

    const snapshot = await writerClient.lanes.snapshot({
      group_id: GROUP,
      lane_id: "agent-lane-woz",
      base_revision: "sdk-gateway-base-1",
      diff: {
        added: [{ id: "sdk-gateway-memory-1", content: "authenticated production path", score: 0.9, provenance: "manual", tags: ["e2e"] }],
        overridden: [],
        deleted: [],
      },
      evidence_refs: ["sdk-gateway:e2e"],
    });
    expect(snapshot).toMatchObject({ lane_id: "agent-lane-woz", status: "active" });

    await expect(reviewerClient.lanes.review({
      group_id: GROUP,
      lane_id: "agent-lane-woz",
      snapshot_id: snapshot.snapshot_id,
      verdict: "approved",
      reason: "authenticated SDK production-path proof",
    })).resolves.toMatchObject({ approved: true });

    await expect(client.lanes.review({
      group_id: GROUP,
      lane_id: "agent-lane-woz",
      snapshot_id: snapshot.snapshot_id,
      verdict: "approved",
      reason: "unauthorized reviewer must fail",
    })).rejects.toThrow();
  });
});
