import { afterEach, describe, expect, it, vi } from "vitest";
import { BrainClient } from "./client";

describe("BrainClient benchmark authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BENCHMARK_AUTH_TOKEN;
  });

  it("sends the configured bearer credential on initialize and tool calls", async () => {
    process.env.BENCHMARK_AUTH_TOKEN = "benchmark-secret-token";
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      requests.push(init ?? {});
      const body = JSON.parse(String(init?.body));
      const isInit = body.method === "initialize";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [] } }), {
        status: 200,
        headers: isInit ? { "mcp-session-id": "session-1" } : {},
      });
    }));

    const client = new BrainClient({ url: "http://gateway.test/mcp" });
    await client.tryCall("memory_search", { group_id: "allura-system", query: "x" });

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect((request.headers as Record<string, string>).Authorization).toBe("Bearer benchmark-secret-token");
    }
  });

  it("does not send Authorization when no benchmark credential is configured", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      requests.push(init ?? {});
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [] } }), {
        status: 200,
        headers: body.method === "initialize" ? { "mcp-session-id": "session-2" } : {},
      });
    }));

    const client = new BrainClient({ url: "http://gateway.test/mcp" });
    await client.tryCall("memory_search", { group_id: "allura-system", query: "x" });

    for (const request of requests) {
      expect(request.headers).not.toHaveProperty("Authorization");
    }
  });

  it("never includes the bearer credential in client diagnostics", async () => {
    process.env.BENCHMARK_AUTH_TOKEN = "benchmark-secret-token";
    const stderr = vi.spyOn(process, "stderr", "get");
    const client = new BrainClient({ url: "http://gateway.test/mcp" });
    expect(client.endpoint).not.toContain("benchmark-secret-token");
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("benchmark-secret-token"));
  });
});
