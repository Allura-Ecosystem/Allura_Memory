import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({
  isPoolHealthy: vi.fn(async () => true),
}));

import { GET as getHealthReady } from "@/app/api/health/ready/route";
import { GET as getReady } from "@/app/api/ready/route";
import { checkLiveness, checkReadiness } from "@/lib/health/probes";
import { isPoolHealthy } from "@/lib/postgres/connection";
import { createServerClient } from "@/lib/sdk/server-client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ALLURA_MCP_BASE_URL", "http://allura-memory-mcp:3201");
  vi.stubEnv("ALLURA_MCP_AUTH_TOKEN", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(isPoolHealthy).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("MCP origin resolution", () => {
  it("requires explicit production configuration but keeps the development-only loopback default", () => {
    vi.stubEnv("ALLURA_MCP_BASE_URL", "");
    expect(() => createServerClient({ authToken: "" })).toThrow(/ALLURA_MCP_BASE_URL/);

    vi.stubEnv("NODE_ENV", "development");
    expect(() => createServerClient({ authToken: "" })).not.toThrow();
  });

  it.each([
    "ftp://mcp.example.test",
    "https://user:password@mcp.example.test",
    "https://mcp.example.test?token=secret",
    "https://mcp.example.test#fragment",
    "https://mcp.example.test/mcp",
    "https://mcp.example.test//",
    "https://mcp.example.test/./",
    "https://mcp.example.test/mcp/..",
    "not a URL",
  ])("rejects non-origin MCP base URL %s", (baseUrl) => {
    expect(() => createServerClient({ baseUrl, authToken: "" })).toThrow(/HTTP\(S\) origin/);
  });

  it("normalizes an origin and lets the real SDK compose the canonical /mcp endpoint", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: { "mcp-session-id": "test-session" },
      }))
      .mockResolvedValueOnce(Response.json({
        jsonrpc: "2.0",
        id: "test-response",
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({ memories: [], total: 0, has_more: false }),
          }],
        },
      }));

    const client = createServerClient({
      baseUrl: "https://mcp.faithmeats.org:443",
      authToken: "",
      retries: 0,
    });
    await client.memory.list({ group_id: "allura-test", user_id: "test-user" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://mcp.faithmeats.org/mcp",
      "https://mcp.faithmeats.org/mcp",
    ]);
  });
});

describe("MCP readiness consumer", () => {
  it("fails closed without an explicit production origin", async () => {
    vi.stubEnv("ALLURA_MCP_BASE_URL", "");
    const result = await checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks.mcp.error).toBe("MCP readiness check failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let liveness mask a wrong topology or connection failure", async () => {
    vi.stubEnv("ALLURA_MCP_BASE_URL", "http://localhost:3201");
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    expect((await checkReadiness()).ready).toBe(false);
    expect(checkLiveness().alive).toBe(true);
  });

  it.each([
    [503, '{"ready":true}'],
    [302, ""],
    [200, "<html>login</html>"],
    [200, "{}"],
    [200, '{"ready":false}'],
    [200, '{"ready":"true"}'],
    [200, "null"],
  ])("rejects MCP status %s with body %s", async (status, body) => {
    fetchMock.mockResolvedValue(new Response(body, { status }));
    expect((await checkReadiness()).ready).toBe(false);
  });

  it("requests fresh readiness without redirects and accepts only ready true", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ready: true }));

    expect((await checkReadiness()).ready).toBe(false);
    expect((await checkReadiness()).ready).toBe(true);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://allura-memory-mcp:3201/ready");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      redirect: "error",
      cache: "no-store",
    });
  });

  it("runs dependency checks in parallel under one deadline and clears wrapper timers", async () => {
    vi.useFakeTimers();
    vi.mocked(isPoolHealthy).mockImplementation(() => new Promise(() => {}));
    fetchMock.mockImplementation(() => new Promise(() => {}));

    let result: Awaited<ReturnType<typeof checkReadiness>> | undefined;
    const pending = checkReadiness().then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(4501);

    expect(result?.ready).toBe(false);
    expect(result?.checks.postgres.healthy).toBe(false);
    expect(result?.checks.mcp.healthy).toBe(false);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe.each([
  ["/api/ready", getReady],
  ["/api/health/ready", getHealthReady],
])("public readiness response %s", (_path, get) => {
  it("redacts malformed upstream response content", async () => {
    const marker = "TOPSECRET_7c2d_material";
    fetchMock.mockResolvedValue(new Response(`not-json-${marker}`, { status: 200 }));

    const response = await get();
    const serialized = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(serialized).checks.mcp.error).toBe("MCP readiness check failed");
    expect(serialized).not.toContain(marker);
  });

  it("redacts upstream transport locations", async () => {
    const marker = "url-secret-7c2d";
    vi.stubEnv("ALLURA_MCP_BASE_URL", `http://${marker}.invalid:3201`);
    fetchMock.mockRejectedValue(new Error(`fetch failed for http://${marker}.invalid:3201/ready`));

    const response = await get();
    const serialized = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(serialized).checks.mcp.error).toBe("MCP readiness check failed");
    expect(serialized).not.toContain(marker);
  });
});
