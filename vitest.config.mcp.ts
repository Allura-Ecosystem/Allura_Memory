import { defineConfig } from "vitest/config";

/**
 * MCP runtime lane.
 *
 * This lane runs against a built, running Next.js app. It deliberately excludes
 * mock-only browser-adapter tests: those do not prove a real browser surface.
 */
export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    passWithNoTests: false,
    include: ["tests/mcp/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
