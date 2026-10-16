/**
 * Server-Side SDK Client Factory
 *
 * Creates a pre-configured AlluraClient for use in server-side code
 * (API routes, server actions, MCP gateway). Reads configuration from
 * environment variables with sensible defaults for local development.
 *
 * Usage:
 *   import { createServerClient } from "@/lib/sdk/server-client";
 *
 *   const client = createServerClient();
 *   const result = await client.memory.add({ ... });
 *
 * Environment variables:
 *   ALLURA_MCP_BASE_URL   — Base URL of the MCP HTTP gateway (default: http://localhost:3201)
 *   ALLURA_MCP_AUTH_TOKEN — Bearer token for authentication (default: empty = dev mode)
 *   ALLURA_MCP_TIMEOUT_MS — Request timeout in milliseconds (default: 5000)
 *   ALLURA_MCP_RETRIES    — Number of retry attempts (default: 3)
 */

import { AlluraClient } from "./index";
import { resolveMcpBaseUrl } from "@/lib/config/mcp-url";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ServerClientConfig {
  /** Override base URL (defaults to ALLURA_MCP_BASE_URL env var or http://localhost:3201) */
  baseUrl?: string;
  /** Override auth token (defaults to ALLURA_MCP_AUTH_TOKEN env var or empty) */
  authToken?: string;
  /** Override timeout in ms (defaults to ALLURA_MCP_TIMEOUT_MS env var or 5000) */
  timeout?: number;
  /** Override retry count (defaults to ALLURA_MCP_RETRIES env var or 3) */
  retries?: number;
}

// ── Server Guard ─────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error("This module can only be used server-side");
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a server-side AlluraClient configured from environment variables.
 *
 * This is the primary way to get an SDK client in API routes, server
 * actions, and the MCP gateway. The client is configured with:
 * - Base URL from ALLURA_MCP_BASE_URL (or http://localhost:3201)
 * - Auth token from ALLURA_MCP_AUTH_TOKEN (or empty for dev mode)
 * - Timeout from ALLURA_MCP_TIMEOUT_MS (or 5000ms)
 * - Retries from ALLURA_MCP_RETRIES (or 3)
 *
 * @param overrides - Optional config overrides for testing or specific use cases
 * @returns Configured AlluraClient instance
 */
export function createServerClient(overrides?: ServerClientConfig): AlluraClient {
  const baseUrl = resolveMcpBaseUrl(overrides?.baseUrl);

  const authToken = overrides?.authToken
    ?? process.env.ALLURA_MCP_AUTH_TOKEN
    ?? "";

  const timeout = overrides?.timeout
    ?? (process.env.ALLURA_MCP_TIMEOUT_MS
      ? parseInt(process.env.ALLURA_MCP_TIMEOUT_MS, 10)
      : 5000);

  const retries = overrides?.retries
    ?? (process.env.ALLURA_MCP_RETRIES
      ? parseInt(process.env.ALLURA_MCP_RETRIES, 10)
      : 3);

  return new AlluraClient({
    baseUrl,
    authToken: authToken || undefined,
    timeout,
    retries,
  });
}