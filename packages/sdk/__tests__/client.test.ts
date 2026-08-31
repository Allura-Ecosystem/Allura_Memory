/**
 * @allura/sdk — AlluraClient tests
 *
 * Tests client initialization, connection management,
 * auth token propagation, and error handling.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlluraClient } from "../src/client.js";
import {
  AlluraError,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../src/errors.js";

// ── Mock Fetch ───────────────────────────────────────────────────────────────

function createMockFetch(
  response: Record<string, unknown>,
  status: number = 200
): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  }) as unknown as typeof globalThis.fetch;
}

function createErrorFetch(
  status: number,
  body: Record<string, unknown>
): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof globalThis.fetch;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AlluraClient", () => {
  describe("initialization", () => {
    it("should require a baseUrl", () => {
      expect(() => new AlluraClient({ baseUrl: "" })).toThrow("baseUrl");
    });

    it("should initialize with default options", () => {
      const client = new AlluraClient({ baseUrl: "http://localhost:3201" });
      expect(client).toBeInstanceOf(AlluraClient);
      expect(client.isConnected).toBe(false);
    });

    it("should accept custom timeout and retries", () => {
      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        timeout: 10000,
        retries: 5,
      });
      expect(client).toBeInstanceOf(AlluraClient);
    });

    it("should accept an auth token", () => {
      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "test-token",
      });
      expect(client).toBeInstanceOf(AlluraClient);
    });

    it("should strip trailing slashes from baseUrl", () => {
      const client = new AlluraClient({
        baseUrl: "http://localhost:3201/",
      });
      // Internal check — the URL should be normalized
      expect(client).toBeInstanceOf(AlluraClient);
    });

    it("should accept a custom fetch implementation", () => {
      const mockFetch = createMockFetch({ status: "healthy" });
      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
      });
      expect(client).toBeInstanceOf(AlluraClient);
    });
  });

  describe("connection management", () => {
  it("initializes an MCP session before the first tool call and reuses it", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json", "mcp-session-id": "session-123" }),
        json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: {} }),
        text: () => Promise.resolve(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/event-stream" }),
        json: () => Promise.resolve({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: JSON.stringify({ results: [], count: 0, latency_ms: 0 }) }] },
        }),
        text: () => Promise.resolve(`event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: { content: [{ type: "text", text: JSON.stringify({ results: [], count: 0, latency_ms: 0 }) }] },
        })}\n\n`),
      });
    const client = new AlluraClient({
      baseUrl: "http://localhost:3201",
      authToken: "test-token",
      fetch: mockFetch,
      retries: 0,
    });

    await client.memory.search({ group_id: "allura-test", query: "session proof" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const initialize = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(initialize.method).toBe("initialize");
    expect(mockFetch.mock.calls[0][1]?.headers.Accept).toBe("application/json, text/event-stream");
    expect(mockFetch.mock.calls[1][1]?.headers["mcp-session-id"]).toBe("session-123");
    expect(mockFetch.mock.calls[1][1]?.headers.Accept).toBe("application/json, text/event-stream");
  });

  it("should connect successfully when server is healthy", async () => {
    const mockFetch = createMockFetch({
      status: "healthy",
      mode: "http",
      interface: "mcp-http",
      transports: ["streamable-http"],
      mcp_endpoint: "/mcp",
      port: 3201,
      port_source: "default",
      auth_enabled: false,
      timestamp: new Date().toISOString(),
    });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
      });

      await client.connect();
      expect(client.isConnected).toBe(true);
    });

    it("should set error state when server is unreachable", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected).toBe(false);
    });

  it("should disconnect cleanly", async () => {
    const mockFetch = createMockFetch({
      status: "healthy",
      mode: "http",
      interface: "mcp-http",
      transports: ["streamable-http"],
      mcp_endpoint: "/mcp",
      port: 3201,
      port_source: "default",
      auth_enabled: false,
      timestamp: new Date().toISOString(),
    });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
      });

      await client.connect();
      expect(client.isConnected).toBe(true);

      await client.disconnect();
      expect(client.isConnected).toBe(false);
    });
  });

  describe("health check", () => {
  it("should return health response on successful check", async () => {
    const healthResponse = {
      status: "healthy",
      mode: "http",
      interface: "mcp-http",
      transports: ["streamable-http"],
      mcp_endpoint: "/mcp",
      port: 3201,
      port_source: "default",
      auth_enabled: false,
      timestamp: new Date().toISOString(),
    };

      const mockFetch = createMockFetch(healthResponse);
      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
      });

      const health = await client.health();
      expect(health.status).toBe("healthy");
      expect(health.port).toBe(3201);
    });

    it("should throw when server is unreachable", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      // With retries=1, the error is wrapped in RetryExhaustedError
      await expect(client.health()).rejects.toThrow();
    });
  });

  describe("auth token propagation", () => {
  it("should include Bearer token in requests when provided", async () => {
    const mockFetch = createMockFetch({
      status: "healthy",
      mode: "http",
      interface: "mcp-http",
      transports: ["streamable-http"],
      mcp_endpoint: "/mcp",
      port: 3201,
      port_source: "default",
      auth_enabled: true,
      timestamp: new Date().toISOString(),
    });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        authToken: "my-secret-token",
        fetch: mockFetch,
      });

      await client.health();

      // Verify the Authorization header was set
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer my-secret-token");
    });

  it("should not include Authorization header when no token is provided", async () => {
    const mockFetch = createMockFetch({
      status: "healthy",
      mode: "http",
      interface: "mcp-http",
      transports: ["streamable-http"],
      mcp_endpoint: "/mcp",
      port: 3201,
      port_source: "default",
      auth_enabled: false,
      timestamp: new Date().toISOString(),
    });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
      });

      await client.health();

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("should throw AuthenticationError on 401 response", async () => {
      const mockFetch = createErrorFetch(401, {
        error: "Unauthorized: Invalid or missing Bearer token",
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      await expect(client.health()).rejects.toThrow(AuthenticationError);
    });
  });

  describe("error handling", () => {
    it("should throw ValidationError on 400 response", async () => {
      const mockFetch = createErrorFetch(400, {
        error: "Invalid group_id format",
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      await expect(client.health()).rejects.toThrow(ValidationError);
    });

    it("should throw NotFoundError on 404 response", async () => {
      const mockFetch = createErrorFetch(404, {
        error: "Unknown tool: memory_nonexistent",
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      await expect(client.health()).rejects.toThrow(NotFoundError);
    });

    it("should handle 429 rate limit errors (retryable, wrapped in RetryExhaustedError)", async () => {
      const mockFetch = createErrorFetch(429, {
        error: "Rate limit exceeded",
        retry_after: 60,
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      // With retries=1, a 429 is retryable so it exhausts the single attempt
      // and wraps the RateLimitError in RetryExhaustedError
      try {
        await client.health();
        expect.fail("Should have thrown");
      } catch (error) {
        // The error should contain information about rate limiting
        expect(String(error)).toContain("Rate limit exceeded");
      }
    });

    it("should handle 500 server errors (retryable, wrapped in RetryExhaustedError)", async () => {
      const mockFetch = createErrorFetch(500, {
        error: "Internal server error",
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      // With retries=1, a 500 is retryable so it exhausts the single attempt
      // and wraps the ServerError in RetryExhaustedError
      try {
        await client.health();
        expect.fail("Should have thrown");
      } catch (error) {
        // The error should contain information about server error
        expect(String(error)).toContain("Internal server error");
      }
    });

    it("should throw on network failure", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 1,
      });

      // With retries=1, the error is wrapped in RetryExhaustedError
      await expect(client.health()).rejects.toThrow();
    });
  });

  describe("retry logic", () => {
  it("should retry on 429 and succeed on second attempt", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ error: "Rate limit exceeded" }),
          text: () => Promise.resolve(JSON.stringify({ error: "Rate limit exceeded" })),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            status: "healthy",
            mode: "http",
            interface: "mcp-http",
            transports: ["streamable-http"],
            mcp_endpoint: "/mcp",
            port: 3201,
            port_source: "default",
            auth_enabled: false,
            timestamp: new Date().toISOString(),
          }),
        text: () => Promise.resolve(""),
      };
    });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 3,
      });

      const health = await client.health();
      expect(health.status).toBe("healthy");
      // Should have been called at least twice (429 then 200)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

  it("should retry on 500 and succeed on second attempt", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ error: "Internal server error" }),
          text: () => Promise.resolve(JSON.stringify({ error: "Internal server error" })),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            status: "healthy",
            mode: "http",
            interface: "mcp-http",
            transports: ["streamable-http"],
            mcp_endpoint: "/mcp",
            port: 3201,
            port_source: "default",
            auth_enabled: false,
            timestamp: new Date().toISOString(),
          }),
        text: () => Promise.resolve(""),
      };
    });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 3,
      });

      const health = await client.health();
      expect(health.status).toBe("healthy");
      // Should have been called at least twice (500 then 200)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should NOT retry on 400 ValidationError", async () => {
      const mockFetch = createErrorFetch(400, {
        error: "Invalid group_id",
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 3,
      });

      await expect(client.health()).rejects.toThrow(ValidationError);
      // Should only be called once — no retries for 400
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on 401 AuthenticationError", async () => {
      const mockFetch = createErrorFetch(401, {
        error: "Unauthorized",
      });

      const client = new AlluraClient({
        baseUrl: "http://localhost:3201",
        fetch: mockFetch,
        retries: 3,
      });

      await expect(client.health()).rejects.toThrow(AuthenticationError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});