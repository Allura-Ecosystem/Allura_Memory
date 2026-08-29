/**
 * @allura/sdk — public contract tests (Story 24.7 AC-2)
 *
 * Pins the public request/response contract of the SDK against the
 * canonical MCP tools/call envelope. No server is required: fetch is
 * injected, so these are hermetic unit tests.
 */
import { describe, expect, it, vi } from "vitest";
import { AlluraClient } from "../src/client.js";
import {
  AlluraError,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  ValidationError,
} from "../src/errors.js";
import { validateGroupId } from "../src/utils.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(fetchImpl: typeof fetch): AlluraClient {
  return new AlluraClient({
    baseUrl: "http://localhost:3201",
    authToken: "test-token",
    fetch: fetchImpl,
    retries: 0,
  });
}

describe("AlluraClient health contract", () => {
  it("parses a healthy response through the HealthResponse schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "healthy",
        mode: "http",
        interface: "rest",
        transports: ["streamable-http"],
        mcp_endpoint: "/mcp",
        port: 3201,
        port_source: "env",
        auth_enabled: true,
        timestamp: "2026-08-29T00:00:00Z",
      })
    );
    const client = makeClient(fetchMock as unknown as typeof fetch);
    const health = await client.health();
    expect(health.status).toBe("healthy");
    expect(health.mode).toBe("http");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3201/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("maps a 401 to AuthenticationError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: "unauthorized" } }, 401)
    );
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(client.health()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("maps a 404 to NotFoundError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: "missing" } }, 404)
    );
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(client.health()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a network failure to ConnectionError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(client.health()).rejects.toBeInstanceOf(ConnectionError);
  });
});

describe("AlluraClient memory contract", () => {
  const toolResult = (payload: unknown) =>
    jsonResponse({
      jsonrpc: "2.0",
      id: "1",
      result: {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        isError: false,
      },
    });

  it("memory.add sends an MCP tools/call envelope and parses the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      toolResult({
        id: "mem-1",
        stored: "episodic",
        score: 0.9,
        created_at: "2026-08-29T00:00:00Z",
      })
    );
    const client = makeClient(fetchMock as unknown as typeof fetch);
    const result = await client.memory.add({
      group_id: "allura-test",
      user_id: "user-1",
      content: "hello",
    });
    expect(result.id).toBe("mem-1");
    expect(result.stored).toBe("episodic");
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("http://localhost:3201/mcp");
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.method).toBe("tools/call");
    expect(body.params.name).toBe("memory_add");
  });

  it("memory.add rejects an invalid group_id before any request", async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(
      client.memory.add({ group_id: "bad-tenant", user_id: "u", content: "x" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("memory.add rejects empty content", async () => {
    const client = makeClient(vi.fn() as unknown as typeof fetch);
    await expect(
      client.memory.add({ group_id: "allura-test", user_id: "u", content: "  " })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("memory.search rejects an empty query", async () => {
    const client = makeClient(vi.fn() as unknown as typeof fetch);
    await expect(
      client.memory.search({ group_id: "allura-test", query: "" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("memory.search rejects a limit outside 1..100", async () => {
    const client = makeClient(vi.fn() as unknown as typeof fetch);
    await expect(
      client.memory.search({ group_id: "allura-test", query: "q", limit: 0 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("memory.get rejects a missing id", async () => {
    const client = makeClient(vi.fn() as unknown as typeof fetch);
    await expect(
      client.memory.get({ group_id: "allura-test", id: "" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("memory.list rejects a negative offset", async () => {
    const client = makeClient(vi.fn() as unknown as typeof fetch);
    await expect(
      client.memory.list({ group_id: "allura-test", offset: -1 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("memory.delete rejects a missing id", async () => {
    const client = makeClient(vi.fn() as unknown as typeof fetch);
    await expect(
      client.memory.delete({ group_id: "allura-test", id: "", user_id: "u" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces an MCP tool error as AlluraError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        jsonrpc: "2.0",
        id: "1",
        result: {
          content: [{ type: "text", text: JSON.stringify({ error: "denied" }) }],
          isError: true,
        },
      })
    );
    const client = makeClient(fetchMock as unknown as typeof fetch);
    await expect(
      client.memory.add({ group_id: "allura-test", user_id: "u", content: "x" })
    ).rejects.toBeInstanceOf(AlluraError);
  });
});

describe("SDK auth helpers", () => {
  it("resolveAuthToken returns the provided token", async () => {
    const { resolveAuthToken } = await import("../src/auth.js");
    expect(resolveAuthToken("abc")).toBe("abc");
  });

  it("createAuthHeader builds a bearer header value", async () => {
    const { createAuthHeader } = await import("../src/auth.js");
    expect(createAuthHeader("abc")).toBe("Bearer abc");
    expect(createAuthHeader(undefined)).toBeUndefined();
  });
});

describe("SDK group_id validation", () => {
  it("accepts allura- prefixed tenants", () => {
    expect(() => validateGroupId("allura-system")).not.toThrow();
    expect(() => validateGroupId("allura-faithmeats")).not.toThrow();
  });

  it("rejects non-allura tenants", () => {
    expect(() => validateGroupId("other-tenant")).toThrow();
    expect(() => validateGroupId("")).toThrow();
  });
});
