import { describe, expect, it } from "vitest";

/**
 * Health Check Tests
 * 
 * Verify the application health endpoints against a running Next.js server.
 * Run with: NEXT_PUBLIC_APP_URL=http://localhost:3100 bun vitest run --config vitest.config.mcp.ts
 */
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL;
if (!BASE_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL is required for MCP runtime tests");
}

describe("MCP Runtime Health", () => {

  it("should respond to health check endpoint", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty("status");
    expect(data.status).toBe("healthy");
  });

  it("should include system metrics in health check", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    expect(data).toHaveProperty("timestamp");
    expect(data).toHaveProperty("version");
  });
});
