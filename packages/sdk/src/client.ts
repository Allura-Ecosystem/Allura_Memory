/**
 * @allura/sdk — AlluraClient
 *
 * Main client class for interacting with Allura Memory.
 * Uses MCP Streamable HTTP transport via the canonical /mcp endpoint.
 *
 * Usage:
 * ```typescript
 * const client = new AlluraClient({
 *   baseUrl: "http://localhost:3201",
 *   authToken: process.env.ALLURA_AUTH_TOKEN,
 * });
 *
 * // Add a memory
 * const result = await client.memory.add({
 *   group_id: "allura-my-tenant",
 *   user_id: "user-123",
 *   content: "Remember this important fact",
 * });
 *
 * // Search memories
 * const results = await client.memory.search({
 *   query: "important fact",
 *   group_id: "allura-my-tenant",
 * });
 * ```
 */

import { resolveAuthToken } from "./auth.js";
import {
  AlluraError,
  ConnectionError,
  createErrorFromResponse,
} from "./errors.js";
import { HarnessOperations } from "./harness.js";
import { MemoryOperations } from "./memory.js";
import type { AlluraClientConfig, HealthResponse } from "./types.js";
import { HealthResponseSchema } from "./types.js";
import {
  buildHeaders,
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT,
  normalizeBaseUrl,
  withRetry,
} from "./utils.js";

function createRequestId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `allura-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ── Client State ────────────────────────────────────────────────────────────

type ClientState = "disconnected" | "connected" | "error";

// ── AlluraClient ────────────────────────────────────────────────────────────

export class AlluraClient {
  // Configuration
  private readonly baseUrl: string;
  private readonly authToken: string | undefined;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly customFetch: typeof globalThis.fetch | undefined;

  // State
  private state: ClientState = "disconnected";

  // Operations
  public readonly memory: MemoryOperations;
  public readonly harness: HarnessOperations;

  constructor(config: AlluraClientConfig) {
    // Validate required config
    if (!config.baseUrl) {
      throw new Error("AlluraClient requires a baseUrl");
    }

    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.authToken = resolveAuthToken(config.authToken);
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.customFetch = config.fetch;

    // Initialize memory operations with bound request function
    this.memory = new MemoryOperations(this.makeRequest.bind(this));
    this.harness = new HarnessOperations(this.makeRequest.bind(this));
  }

  // ── Connection Management ────────────────────────────────────────────────

  /**
   * Verify connectivity to the Allura Memory server.
   * Calls the /health endpoint and validates the response.
   *
   * @returns Health response from the server
   * @throws {ConnectionError} if the server is unreachable
   * @throws {AlluraError} if the server returns an error
   */
  async health(): Promise<HealthResponse> {
    const fetchFn = this.customFetch ?? globalThis.fetch;
    const url = `${this.baseUrl}/health`;
    const headers = buildHeaders(this.authToken);

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetchFn(url, {
            method: "GET",
            headers,
            signal: controller.signal,
          });

          if (!response.ok) {
            const body = await this.parseResponseBody(response);
            throw createErrorFromResponse(response.status, body);
          }

          const body = await this.parseResponseBody(response);
          return HealthResponseSchema.parse(body);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new ConnectionError(`Request timed out after ${this.timeout}ms`);
          }
          if (error instanceof AlluraError) {
            throw error; // Let withRetry handle retryable errors
          }
          throw new ConnectionError(
            `Failed to connect to Allura Memory at ${this.baseUrl}`,
            error instanceof Error ? error : undefined
          );
        } finally {
          clearTimeout(timeoutId);
        }
      },
      this.retries
    );
  }

  /**
   * Connect to the Allura Memory server.
   * Verifies connectivity by calling the health endpoint.
   *
   * @throws {ConnectionError} if the server is unreachable
   */
  async connect(): Promise<void> {
    try {
      await this.health();
      this.state = "connected";
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }

  /**
   * Disconnect from the server.
   * No-op for HTTP clients (connections are not persistent).
   */
  async disconnect(): Promise<void> {
    this.state = "disconnected";
  }

  /**
   * Get the current connection state.
   */
  getState(): ClientState {
    return this.state;
  }

  /**
   * Check if the client is connected.
   */
  get isConnected(): boolean {
    return this.state === "connected";
  }

  // ── Internal Request Handling ───────────────────────────────────────────

  /**
   * Make a request to the Allura Memory server.
   *
   * Sends an MCP JSON-RPC `tools/call` request to the canonical `/mcp`
   * endpoint and unwraps the tool result payload.
   *
   * @internal
   */
  private async makeRequest<T>(
    method: string,
    params: Record<string, unknown>,
    responseSchema: { parse: (data: unknown) => T }
  ): Promise<T> {
    const fetchFn = this.customFetch ?? globalThis.fetch;

    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const url = `${this.baseUrl}/mcp`;
        const headers = buildHeaders(this.authToken);

        const body = JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: method,
            arguments: params,
          },
          id: createRequestId(),
        });

        const response = await fetchFn(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });

        // Handle non-OK responses
        if (!response.ok) {
          const responseBody = await this.parseResponseBody(response);
          throw createErrorFromResponse(response.status, responseBody);
        }

        const responseBody = await this.parseResponseBody(response);
        const toolResult = this.unwrapToolResult(responseBody);
        const validated = responseSchema.parse(toolResult);
        return validated;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ConnectionError(`Request timed out after ${this.timeout}ms`);
        }
        if (error instanceof AlluraError) {
          throw error;
        }
        if (error instanceof TypeError && error.message.includes("fetch")) {
          throw new ConnectionError(
            `Failed to connect to Allura Memory at ${this.baseUrl}`,
            error
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, this.retries);
  }

  private unwrapToolResult(responseBody: unknown): unknown {
    const rpc = responseBody as {
      result?: {
        content?: Array<{ type?: string; text?: string }>;
        isError?: boolean;
      };
      error?: { message?: string };
    };

    if (rpc.error) {
      throw new AlluraError(rpc.error.message ?? "MCP request failed", "MCP_ERROR", 500, rpc.error);
    }

    const result = rpc.result;
    if (!result) {
      return responseBody;
    }

    if (result.isError) {
      const text = result.content?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string };
          throw new AlluraError(parsed.error ?? text, "MCP_TOOL_ERROR", 500, parsed);
        } catch {
          throw new AlluraError(text, "MCP_TOOL_ERROR", 500, text);
        }
      }
      throw new AlluraError("MCP tool request failed", "MCP_TOOL_ERROR", 500);
    }

    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text) {
      return result;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Parse the response body as JSON.
   * Handles empty responses and non-JSON content types gracefully.
   *
   * @internal
   */
  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        // Empty body or malformed JSON
        return {};
      }
    }

    // Try to parse as text, then JSON
    try {
      const text = await response.text();
      if (!text) return {};
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
}
