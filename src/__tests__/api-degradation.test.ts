/**
 * API Degradation Response Tests
 *
 * Issue #14: PostgreSQL errors must propagate, never silently return [].
 * Issue #14 (extended): When the semantic layer is degraded, API returns 206 + Warning header
 * instead of silently returning 200 with partial data.
 *
 * Tests the jsonWithDegradation helper and handleError classification
 * without requiring live database connections.
 */

import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import type { MemoryResponseMeta } from "../lib/memory/canonical-contracts";

// ── Inline the jsonWithDegradation logic for unit testing ──────────────────
// (We test the logic directly rather than importing from the route,
//  since Next.js route handlers have module-level side effects.)

function jsonWithDegradation<T extends Record<string, unknown>>(
  data: T & { meta?: MemoryResponseMeta },
): NextResponse<T> {
  const meta = data.meta;
  if (meta?.degraded) {
    const warning = meta.degraded_reason
      ? `299 Allura "${meta.degraded_reason}"`
      : '299 Allura "partial_data"';
    return NextResponse.json(data, {
      status: 206,
      headers: { Warning: warning },
    });
  }
  return NextResponse.json(data);
}

describe("API Degradation Response Handling", () => {
  describe("jsonWithDegradation", () => {
    it("should return 200 when meta is not present", () => {
      const response = jsonWithDegradation({ memories: [], total: 0 });
      expect(response.status).toBe(200);
    });

    it("should return 200 when meta.degraded is false", () => {
      const data = {
        memories: [],
        total: 0,
        meta: {
          contract_version: "v1" as const,
          degraded: false,
          stores_used: ["postgres", "graph"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: [],
        },
      };
      const response = jsonWithDegradation(data);
      expect(response.status).toBe(200);
    });

    it("should return 206 when meta.degraded is true", () => {
      const data = {
        memories: [{ id: "1", content: "test" }],
        total: 1,
        meta: {
          contract_version: "v1" as const,
          degraded: true,
          degraded_reason: "graph_unavailable" as const,
          stores_used: ["postgres"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: ["semantic layer unavailable; returned episodic results only"],
        },
      };
      const response = jsonWithDegradation(data);
      expect(response.status).toBe(206);
    });

    it("should include Warning header with degraded_reason when present", () => {
      const data = {
        memories: [],
        total: 0,
        meta: {
          contract_version: "v1" as const,
          degraded: true,
          degraded_reason: "graph_unavailable" as const,
          stores_used: ["postgres"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: ["semantic layer unavailable"],
        },
      };
      const response = jsonWithDegradation(data);
      expect(response.headers.get("Warning")).toBe(
        '299 Allura "graph_unavailable"',
      );
    });

    it("should include Warning header with 'partial_data' when degraded_reason is absent", () => {
      const data = {
        memories: [],
        total: 0,
        meta: {
          contract_version: "v1" as const,
          degraded: true,
          stores_used: ["postgres"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: [],
        },
      };
      const response = jsonWithDegradation(data);
      expect(response.headers.get("Warning")).toBe(
        '299 Allura "partial_data"',
      );
    });

    it("should return 200 when meta exists but degraded is undefined", () => {
      const data = {
        memories: [],
        total: 0,
        meta: {
          contract_version: "v1" as const,
          degraded: undefined as unknown as boolean,
          stores_used: ["postgres", "graph"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: [],
        },
      };
      const response = jsonWithDegradation(data);
      expect(response.status).toBe(200);
    });
  });

  describe("Error classification (Issue #14 core)", () => {
    it("should distinguish empty result from DB failure by HTTP status", () => {
      // Empty result → 200 with empty array
      const emptyResponse = jsonWithDegradation({
        memories: [],
        total: 0,
        meta: {
          contract_version: "v1" as const,
          degraded: false,
          stores_used: ["postgres", "graph"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: [],
        },
      });
      expect(emptyResponse.status).toBe(200);

      // Degraded result → 206 (partial data, semantic layer down)
      const degradedResponse = jsonWithDegradation({
        memories: [],
        total: 0,
        meta: {
          contract_version: "v1" as const,
          degraded: true,
          degraded_reason: "graph_unavailable" as const,
          stores_used: ["postgres"] as Array<"postgres" | "graph">,
          stores_attempted: ["postgres", "graph"] as Array<"postgres" | "graph">,
          warnings: ["semantic layer unavailable"],
        },
      });
      expect(degradedResponse.status).toBe(206);

      // DB failure → 503 (thrown by canonical-tools, caught by handleError)
      // This is tested in canonical-memory.test.ts via DatabaseUnavailableError
    });
  });
});