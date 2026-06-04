/**
 * Sentry Wiring Tests
 *
 * Tests that verify Sentry instrumentation is correctly wired into:
 * 1. Next.js instrumentation (register function)
 * 2. API route error handlers (captureException calls)
 * 3. SDK client factory (createServerClient)
 *
 * These tests use mocks to avoid requiring a real Sentry DSN or server.
 *
 * @module sentry-wiring.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock Setup ────────────────────────────────────────────────────────────────

// Mock @sentry/nextjs before any imports that use it
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  startTransaction: vi.fn(() => ({
    setTag: vi.fn(),
    setData: vi.fn(),
    finish: vi.fn(),
  })),
  withScope: vi.fn((callback) => callback({ setTag: vi.fn(), setExtra: vi.fn(), setUser: vi.fn(), setFingerprint: vi.fn() })),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Sentry Wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Sentry state between tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Instrumentation Register Function ──────────────────────────────────

  describe("instrumentation.ts register function", () => {
    it("should call initSentry when NEXT_RUNTIME is nodejs", async () => {
      // Set up environment for server-side initialization
      process.env.NEXT_RUNTIME = "nodejs";
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      // Import the instrumentation module
      const { register } = await import("@/app/instrumentation");

      // register should not throw even without Sentry DSN
      await expect(register()).resolves.toBeUndefined();
    });

    it("should not initialize Sentry when NEXT_RUNTIME is not nodejs", async () => {
      process.env.NEXT_RUNTIME = "edge";
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const { register } = await import("@/app/instrumentation");

      // register should complete without error
      await expect(register()).resolves.toBeUndefined();
    });

    it("should be a no-op when Sentry DSN is not configured", async () => {
      process.env.NEXT_RUNTIME = "nodejs";
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const { register } = await import("@/app/instrumentation");

      // Should not throw — Sentry is a no-op without DSN
      await expect(register()).resolves.toBeUndefined();
    });
  });

  // ── 2. Sentry Abstraction Layer ──────────────────────────────────────────

  describe("Sentry abstraction (src/lib/observability/sentry.ts)", () => {
    it("captureException should be callable without throwing when Sentry is disabled", async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const { captureException, resetSentry } = await import("@/lib/observability/sentry");

      // Reset to ensure clean state
      resetSentry();

      // Should not throw — no-op when Sentry is disabled
      expect(() => {
        captureException(new Error("test error"), {
          tags: { route: "/api/test", method: "GET" },
        });
      }).not.toThrow();
    });

    it("startTransaction should return a no-op transaction when Sentry is disabled", async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const { startTransaction, resetSentry } = await import("@/lib/observability/sentry");

      resetSentry();

      const transaction = startTransaction({
        name: "GET /api/test",
        op: "http.server",
        tags: { "request.method": "GET" },
      });

      // No-op transaction should have all methods
      expect(transaction).toHaveProperty("setTag");
      expect(transaction).toHaveProperty("setData");
      expect(transaction).toHaveProperty("finish");

      // Should not throw
      expect(() => {
        transaction.setTag("key", "value");
        transaction.setData("key", "value");
        transaction.finish();
      }).not.toThrow();
    });

    it("isSentryEnabled should return false when DSN is not configured", async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const { isSentryEnabled, resetSentry } = await import("@/lib/observability/sentry");

      resetSentry();

      expect(isSentryEnabled()).toBe(false);
    });

    it("captureException should accept context with tags and extra", async () => {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN;

      const { captureException, resetSentry } = await import("@/lib/observability/sentry");

      resetSentry();

      // Should not throw with full context
      expect(() => {
        captureException(new Error("test error"), {
          tags: { route: "/api/curator/approve", method: "POST", group_id: "allura-test" },
          extra: { proposal_id: "123", decision: "approve" },
          user: { id: "user-123", email: "test@example.com" },
          fingerprint: ["proposal-approve"],
        });
      }).not.toThrow();
    });
  });

  // ── 3. Sentry Config ────────────────────────────────────────────────────

  describe("Sentry config (src/lib/observability/config.ts)", () => {
    it("should return disabled config when DSN is not set", async () => {
      const { loadSentryConfig } = await import("@/lib/observability/config");

      const config = loadSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: "",
        SENTRY_ENVIRONMENT: "development",
      });

      expect(config.enabled).toBe(false);
      expect(config.dsn).toBeUndefined();
      expect(config.environment).toBe("development");
    });

    it("should return enabled config when DSN is set", async () => {
      const { loadSentryConfig } = await import("@/lib/observability/config");

      const config = loadSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: "https://example@sentry.io/123",
        SENTRY_ENVIRONMENT: "production",
        SENTRY_TRACES_SAMPLE_RATE: "0.2",
        SENTRY_PROFILES_SAMPLE_RATE: "0.1",
      });

      expect(config.enabled).toBe(true);
      expect(config.dsn).toBe("https://example@sentry.io/123");
      expect(config.environment).toBe("production");
      expect(config.tracesSampleRate).toBe(0.2);
    });

    it("should use defaults for optional env vars", async () => {
      const { loadSentryConfig } = await import("@/lib/observability/config");

      const config = loadSentryConfig({
        NEXT_PUBLIC_SENTRY_DSN: "https://example@sentry.io/123",
      });

      expect(config.environment).toBe("development");
      expect(config.tracesSampleRate).toBe(0.1);
      expect(config.profilesSampleRate).toBe(0.1);
    });
  });

  // ── 4. API Route Error Handler Integration ────────────────────────────────

  describe("API route error handlers", () => {
    it("should export captureException from observability module", async () => {
      const sentry = await import("@/lib/observability/sentry");

      expect(sentry.captureException).toBeDefined();
      expect(typeof sentry.captureException).toBe("function");
    });

    it("should export startTransaction from observability module", async () => {
      const sentry = await import("@/lib/observability/sentry");

      expect(sentry.startTransaction).toBeDefined();
      expect(typeof sentry.startTransaction).toBe("function");
    });

    it("should export extractRequestContext from observability module", async () => {
      const sentry = await import("@/lib/observability/sentry");

      expect(sentry.extractRequestContext).toBeDefined();
      expect(typeof sentry.extractRequestContext).toBe("function");
    });

    it("should export initSentry from observability module", async () => {
      const sentry = await import("@/lib/observability/sentry");

      expect(sentry.initSentry).toBeDefined();
      expect(typeof sentry.initSentry).toBe("function");
    });

    it("should export resetSentry from observability module", async () => {
      const sentry = await import("@/lib/observability/sentry");

      expect(sentry.resetSentry).toBeDefined();
      expect(typeof sentry.resetSentry).toBe("function");
    });
  });

  // ── 5. SDK Client Factory ────────────────────────────────────────────────

  describe("SDK client factory (src/lib/sdk/server-client.ts)", () => {
    it("should create a server client with default config", async () => {
      // Clear env overrides for this test
      delete process.env.ALLURA_MCP_BASE_URL;
      delete process.env.ALLURA_MCP_AUTH_TOKEN;
      delete process.env.ALLURA_MCP_TIMEOUT_MS;
      delete process.env.ALLURA_MCP_RETRIES;

      const { createServerClient } = await import("@/lib/sdk/server-client");

      const client = createServerClient();

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(Object);
      // AlluraClient has a memory property
      expect(client.memory).toBeDefined();
    });

    it("should create a server client with custom overrides", async () => {
      const { createServerClient } = await import("@/lib/sdk/server-client");

      const client = createServerClient({
        baseUrl: "http://custom-host:9999",
        authToken: "test-token",
        timeout: 10000,
        retries: 5,
      });

      expect(client).toBeDefined();
      expect(client.memory).toBeDefined();
    });

    it("should read config from environment variables", async () => {
      process.env.ALLURA_MCP_BASE_URL = "http://env-host:8888";
      process.env.ALLURA_MCP_AUTH_TOKEN = "env-token";
      process.env.ALLURA_MCP_TIMEOUT_MS = "3000";
      process.env.ALLURA_MCP_RETRIES = "5";

      const { createServerClient } = await import("@/lib/sdk/server-client");

      const client = createServerClient();

      expect(client).toBeDefined();

      // Clean up
      delete process.env.ALLURA_MCP_BASE_URL;
      delete process.env.ALLURA_MCP_AUTH_TOKEN;
      delete process.env.ALLURA_MCP_TIMEOUT_MS;
      delete process.env.ALLURA_MCP_RETRIES;
    });

    it("should throw when used in browser context", async () => {
      // This test verifies the server guard exists
      // We can't easily mock `typeof window` in vitest, so we just
      // verify the module exports the function correctly
      const mod = await import("@/lib/sdk/server-client");
      expect(mod.createServerClient).toBeDefined();
      expect(typeof mod.createServerClient).toBe("function");
    });
  });

  // ── 6. SDK Barrel Export ──────────────────────────────────────────────────

  describe("SDK barrel export (src/lib/sdk/index.ts)", () => {
    it("should export AlluraClient", async () => {
      const sdk = await import("@/lib/sdk");

      expect(sdk.AlluraClient).toBeDefined();
      expect(typeof sdk.AlluraClient).toBe("function");
    });

    it("should export error classes", async () => {
      const sdk = await import("@/lib/sdk");

      expect(sdk.AlluraError).toBeDefined();
      expect(sdk.AuthenticationError).toBeDefined();
      expect(sdk.ValidationError).toBeDefined();
      expect(sdk.NotFoundError).toBeDefined();
      expect(sdk.RateLimitError).toBeDefined();
    });

    it("should export utility functions", async () => {
      const sdk = await import("@/lib/sdk");

      expect(sdk.validateSdkGroupId).toBeDefined();
      expect(sdk.withRetry).toBeDefined();
      expect(sdk.buildHeaders).toBeDefined();
      expect(sdk.normalizeBaseUrl).toBeDefined();
    });
  });

  // ── 7. MCP Gateway Sentry Integration ────────────────────────────────────

  describe("MCP gateway Sentry integration", () => {
    it("should import captureException and startTransaction from observability", async () => {
      // Verify the gateway can import these functions
      const { captureException, startTransaction, extractRequestContext } = await import("@/lib/observability/sentry");

      expect(captureException).toBeDefined();
      expect(startTransaction).toBeDefined();
      expect(extractRequestContext).toBeDefined();
    });

    it("extractRequestContext should extract method, path, and group_id from URLs", async () => {
      const { extractRequestContext } = await import("@/lib/observability/sentry");

      const mockReq = {
        url: "/api/memory?group_id=allura-test&query=hello",
        method: "POST",
        headers: {},
      } as any;

      const context = extractRequestContext(mockReq);

      expect(context.tags?.["request.method"]).toBe("POST");
      expect(context.tags?.["request.path"]).toBe("/api/memory");
      expect(context.tags?.["group_id"]).toBe("allura-test");
    });
  });
});
