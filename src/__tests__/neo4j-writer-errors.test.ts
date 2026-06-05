/**
 * Neo4j Writer Error Handling Tests
 *
 * Issue #13: All Neo4j I/O functions had no try/catch on session.run()
 * and readTransaction(). Raw driver errors propagated with zero context.
 *
 * Fix: writer.ts now uses readTransaction/writeTransaction from
 * src/lib/neo4j/connection.ts, which wraps errors in domain types
 * (Neo4jConnectionError, Neo4jQueryError) with structured logging.
 *
 * These tests verify that writer.ts methods throw domain errors
 * when the underlying Neo4j driver fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Neo4jConnectionError, Neo4jQueryError } from "@/lib/errors/neo4j-errors";

// Bypass kernel to test direct Neo4j error handling
vi.stubEnv("MEMORY_BYPASS_KERNEL", "true");

// Mock the neo4j connection module to simulate driver failures
vi.mock("@/lib/neo4j/connection", () => {
  const ServiceUnavailableError = class extends Error {
    name = "ServiceUnavailableError";
    code = "ServiceUnavailable";
  };

  const SyntaxError = class extends Error {
    name = "Neo4jError";
    code = "Neo.ClientError.Statement.SyntaxError";
  };

  return {
    readTransaction: vi.fn(),
    writeTransaction: vi.fn(),
    ManagedTransaction: class {},
  };
});

// Import after mock setup
import { memory } from "@/lib/memory/writer";
import { readTransaction, writeTransaction } from "@/lib/neo4j/connection";

describe("Neo4j Writer Error Handling (Issue #13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createEntity", () => {
    it("should throw Neo4jConnectionError when driver is unavailable", async () => {
      const driverError = new Error("Connection refused");
      driverError.name = "ServiceUnavailableError";

      (writeTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Neo4jConnectionError(driverError),
      );

      const api = memory();
      await expect(
        api.createEntity({
          label: "Task",
          group_id: "allura-test-writer",
          props: { task_id: "t1", goal: "test" },
        }),
      ).rejects.toThrow(Neo4jConnectionError);
    });

    it("should throw Neo4jQueryError when query has syntax error", async () => {
      const queryError = new Error("Invalid Cypher");
      queryError.name = "Neo4jError";

      (writeTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Neo4jQueryError("createEntity", queryError),
      );

      const api = memory();
      await expect(
        api.createEntity({
          label: "Task",
          group_id: "allura-test-writer",
          props: { task_id: "t1", goal: "test" },
        }),
      ).rejects.toThrow(Neo4jQueryError);
    });
  });

  describe("createRelationship", () => {
    it("should throw Neo4jConnectionError when driver is unavailable", async () => {
      const driverError = new Error("Session expired");
      driverError.name = "SessionExpiredError";

      (writeTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Neo4jConnectionError(driverError),
      );

      const api = memory();
      await expect(
        api.createRelationship({
          fromId: "n1",
          fromLabel: "Task",
          toId: "n2",
          toLabel: "Person",
          type: "CONTRIBUTED",
        }),
      ).rejects.toThrow(Neo4jConnectionError);
    });
  });

  describe("query", () => {
    it("should throw Neo4jConnectionError when driver is unavailable", async () => {
      const driverError = new Error("Connection refused");
      driverError.name = "ServiceUnavailableError";

      (readTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Neo4jConnectionError(driverError),
      );

      const api = memory();
      await expect(
        api.query("MATCH (n) RETURN n LIMIT 1"),
      ).rejects.toThrow(Neo4jConnectionError);
    });

    it("should throw Neo4jQueryError when query fails", async () => {
      const queryError = new Error("Syntax error");
      queryError.name = "Neo4jError";

      (readTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Neo4jQueryError("query", queryError),
      );

      const api = memory();
      await expect(
        api.query("INVALID CYPHER"),
      ).rejects.toThrow(Neo4jQueryError);
    });
  });

  describe("search", () => {
    it("should throw Neo4jConnectionError when driver is unavailable", async () => {
      const driverError = new Error("Connection refused");
      driverError.name = "ServiceUnavailableError";

      (readTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Neo4jConnectionError(driverError),
      );

      const api = memory();
      await expect(
        api.search({
          label: "Task",
          group_id: "allura-test-writer",
          props: { status: "complete" },
        }),
      ).rejects.toThrow(Neo4jConnectionError);
    });
  });

  describe("domain error context", () => {
    it("should preserve error cause chain for debugging", async () => {
      const originalError = new Error("ECONNREFUSED");
      originalError.name = "ServiceUnavailableError";

      const domainError = new Neo4jConnectionError(originalError);

      (writeTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(domainError);

      const api = memory();
      try {
        await api.createEntity({
          label: "Task",
          group_id: "allura-test-writer",
          props: { task_id: "t1" },
        });
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Neo4jConnectionError);
        expect((error as Neo4jConnectionError).cause).toBe(originalError);
        expect((error as Neo4jConnectionError).message).toContain("Failed to connect to Neo4j");
      }
    });
  });
});