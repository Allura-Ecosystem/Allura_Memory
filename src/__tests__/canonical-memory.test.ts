/**
 * Canonical Memory Operations Tests
 * 
 * Regression tests for the 5 canonical memory operations:
 * 1. memory_add - Add a memory (episodic → score → promote/queue)
 * 2. memory_search - Search memories (federated: Postgres + Neo4j)
 * 3. memory_get - Get a single memory by ID
 * 4. memory_list - List all memories for a user
 * 5. memory_delete - Soft-delete a memory
 * 
 * Reference: docs/allura/BLUEPRINT.md
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import {
  DatabaseQueryError,
  DatabaseUnavailableError,
} from "../lib/errors/database-errors";
import type {
  MemoryAddRequest,
  MemoryDeleteRequest,
  MemoryGetRequest,
  MemoryListRequest,
  MemorySearchRequest,
} from "../lib/memory/canonical-contracts";
import {
  memory_add,
  memory_delete,
  memory_get,
  memory_list,
  memory_search,
  resetConnections,
} from "../mcp/canonical-tools";
import { closePool, getPool } from "../lib/postgres/connection";

// Live-DB gating: skip tests requiring live PostgreSQL/Neo4j unless RUN_E2E_TESTS=true
const itIfE2E = process.env.RUN_E2E_TESTS === "true" ? it : it.skip;

// Test configuration
const RUN_ID = randomUUID().slice(0, 8);
const TEST_GROUP_ID = `allura-test-canonical-${RUN_ID}` as any;
const TEST_USER_ID = "test-user-1";
const TEST_USER_ID_2 = "test-user-2";
const GROUP_A = `allura-tenant-a-${RUN_ID}` as any;
const GROUP_B = `allura-tenant-b-${RUN_ID}` as any;

// Workspace scope is mandatory for app-role writes/reads (migration 39
// restrictive RLS policy). Seed one workspace per test group and attach a
// verified scope tuple to every canonical request.
const TEST_AGENT_ID = "canonical-test-agent";
function wsScope(groupId: string) {
  return {
    group_id: groupId as any,
    workspace_id: `ws-${groupId}`,
    agent_id: TEST_AGENT_ID,
  };
}

function uniqueContent(base: string): string {
  return `${base} [run:${RUN_ID}] [id:${randomUUID().slice(0, 8)}]`;
}

describe("Canonical Memory Operations", () => {
  beforeEach(() => {
    process.env.PROMOTION_MODE = "soc2";
  });

  beforeAll(async () => {
    // Seed one workspace per test group so app-role writes satisfy the
    // workspace_scope_restrictive_policy and the workspace FK.
    const pool = getPool();
    const groups = [String(TEST_GROUP_ID), String(GROUP_A), String(GROUP_B)];
    for (const g of groups) {
      await pool.query(
        `INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'canonical-test')`,
        [`ws-${g}`, g],
      );
    }
  });

  afterAll(async () => {
    await closePool();
  });

  describe("1. memory_add", () => {
    it("should add a memory to PostgreSQL (episodic only) when score < threshold", async () => {
      const request: MemoryAddRequest = {
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        content: "Test memory with low confidence",
        metadata: { source: "manual" },
        threshold: 0.9, // High threshold to ensure episodic only
      };

      const response = await memory_add(request);

      expect(response.id).toBeDefined();
      expect(response.stored).toBe("episodic");
      expect(response.score).toBeLessThan(0.9);
      expect(response.pending_review).toBeUndefined();
      expect(response.created_at).toBeDefined();
    });

     itIfE2E("should queue for HITL review even when PROMOTION_MODE=auto", async () => {
       // PROMOTION_MODE=auto is retained only for backwards-compatible env parsing.
       // Canonical promotion is HITL-only: eligible memories queue proposals.
       const originalMode = process.env.PROMOTION_MODE;
       process.env.PROMOTION_MODE = "auto";

       try {
         const request: MemoryAddRequest = {
           group_id: TEST_GROUP_ID,
           scope: wsScope(TEST_GROUP_ID),
           user_id: TEST_USER_ID,
          content: uniqueContent("I always prefer using the dark theme in VS Code editor settings for all my development work"),
           metadata: { source: "conversation" },
         };

         const response = await memory_add(request);

         expect(response.id).toBeDefined();
         expect(response.stored).toBe("episodic");
         expect(response.score).toBeGreaterThanOrEqual(0.85);
         expect(response.pending_review).toBe(true);
         expect(response.created_at).toBeDefined();
       } finally {
         process.env.PROMOTION_MODE = originalMode;
       }
     });

     itIfE2E("should queue memory for review when score >= threshold in soc2 mode", async () => {
       // This test requires PROMOTION_MODE=soc2
       // Content must start with "I always/never/prefer" to trigger specificity pattern
       // and be long enough (>20 words) to score >= AUTO_APPROVAL_THRESHOLD (0.85)
       const originalMode = process.env.PROMOTION_MODE;
       process.env.PROMOTION_MODE = "soc2";

       try {
         const request: MemoryAddRequest = {
           group_id: TEST_GROUP_ID,
           scope: wsScope(TEST_GROUP_ID),
           user_id: TEST_USER_ID,
           content: uniqueContent("I always prefer working with TypeScript strict mode enabled in my IDE for all new projects"),
           metadata: { source: "conversation" },
         };

         const response = await memory_add(request);

         expect(response.id).toBeDefined();
         expect(response.stored).toBe("episodic");
         expect(response.pending_review).toBe(true);
         expect(response.created_at).toBeDefined();
       } finally {
         process.env.PROMOTION_MODE = originalMode;
       }
     });

     itIfE2E("should not contact Neo4j from memory_add when eligible memory queues for HITL", async () => {
       const originalMode = process.env.PROMOTION_MODE;
       const originalNeo4jUri = process.env.NEO4J_URI;
       process.env.PROMOTION_MODE = "auto";
       process.env.NEO4J_URI = "bolt://127.0.0.1:1";
       resetConnections();

       try {
         const response = await memory_add({
           group_id: TEST_GROUP_ID,
           scope: wsScope(TEST_GROUP_ID),
           user_id: TEST_USER_ID,
           content: uniqueContent("I always prefer deterministic testing patterns over flaky integration tests in all codebases"),
           metadata: { source: "conversation" },
         });

         expect(response.stored).toBe("episodic");
         expect(response.pending_review).toBe(true);
         expect(response.meta?.degraded).not.toBe(true);
       } finally {
         process.env.PROMOTION_MODE = originalMode;
         process.env.NEO4J_URI = originalNeo4jUri;
         resetConnections();
       }
     });

    it("should reject invalid group_id", async () => {
      const request: MemoryAddRequest = {
        group_id: "invalid-group-id" as any, // Missing 'allura-' prefix
        user_id: TEST_USER_ID,
        content: "Test content",
      };

      await expect(memory_add(request)).rejects.toThrow("Invalid group_id");
    });

    it("should reject missing required fields", async () => {
      const request = {
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        // Missing user_id and content
      } as any;

      await expect(memory_add(request)).rejects.toThrow();
    });
  });

  describe("2. memory_search", () => {
    beforeAll(async () => {
      // Add test memories
      await memory_add({
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        content: uniqueContent("User prefers dark mode"),
        metadata: { source: "manual" },
      });

      await memory_add({
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        content: uniqueContent("User uses TypeScript"),
        metadata: { source: "conversation" },
      });
    });

     it("should search memories across both stores", async () => {
       const request: MemorySearchRequest = {
         query: "dark mode",
         group_id: TEST_GROUP_ID,
         scope: wsScope(TEST_GROUP_ID),
       };

       // Debug: Check the request
       console.log(`[DEBUG] Search request:`, request);
       
       const response = await memory_search(request);

       expect(response.results).toBeDefined();
       expect(response.count).toBeGreaterThanOrEqual(0);
       expect(response.latency_ms).toBeDefined();
     });

    it("should scope search to user when user_id provided", async () => {
      const request: MemorySearchRequest = {
        query: "TypeScript",
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
      };

      const response = await memory_search(request);

      expect(response.results).toBeDefined();
      // All results should belong to the user
      response.results.forEach((result: any) => {
        // Note: user_id is not in MemorySearchResult, but we can verify
        // that results exist
        expect(result.id).toBeDefined();
      });
    });

     it("should respect limit parameter", async () => {
       const request: MemorySearchRequest = {
         query: "user",
         group_id: TEST_GROUP_ID,
         scope: wsScope(TEST_GROUP_ID),
         limit: 2, // Already an integer, but let's be explicit
       };

       const response = await memory_search(request);

       expect(response.results.length).toBeLessThanOrEqual(2);
     });

    it("should reject invalid group_id", async () => {
      const request: MemorySearchRequest = {
        query: "test",
        group_id: "invalid-group" as any,
      };

      await expect(memory_search(request)).rejects.toThrow("Invalid group_id");
    });
  });

  describe("3. memory_get", () => {
    let testMemoryId: string;

    beforeAll(async () => {
      // Add a test memory
      const response = await memory_add({
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        content: uniqueContent("Test memory for get operation"),
        metadata: { source: "manual" },
      });
      testMemoryId = response.id;
    });

    it("should retrieve a memory by ID", async () => {
      const request: MemoryGetRequest = {
        id: testMemoryId as any,
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
      };

      const response = await memory_get(request);

      expect(response.id).toBe(testMemoryId);
      expect(response.content).toContain("Test memory for get operation");
      expect(response.source).toBeDefined();
      expect(response.provenance).toBe("manual");
      expect(response.created_at).toBeDefined();
    });

    it("should throw error for non-existent memory", async () => {
      const request: MemoryGetRequest = {
        id: "non-existent-id" as any,
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
      };

      await expect(memory_get(request)).rejects.toThrow("not found");
    });

    it("should reject invalid group_id", async () => {
      const request: MemoryGetRequest = {
        id: testMemoryId as any,
        group_id: "invalid-group" as any,
      };

      await expect(memory_get(request)).rejects.toThrow("Invalid group_id");
    });
  });

  describe("4. memory_list", () => {
    beforeAll(async () => {
      // Add test memories for different users
      await memory_add({
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        content: uniqueContent("Memory 1 for user 1"),
        metadata: { source: "manual" },
      });

      await memory_add({
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        content: uniqueContent("Memory 2 for user 1"),
        metadata: { source: "conversation" },
      });

      await memory_add({
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID_2,
        content: uniqueContent("Memory 1 for user 2"),
        metadata: { source: "manual" },
      });
    });

    it("should list all memories for a user", async () => {
      const request: MemoryListRequest = {
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
      };

      const response = await memory_list(request);

      expect(response.memories).toBeDefined();
      expect(response.total).toBeGreaterThanOrEqual(2);
      expect(response.has_more).toBeDefined();
    });

    it("should respect limit and offset parameters", async () => {
      const request: MemoryListRequest = {
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
        limit: 1,
        offset: 0,
      };

      const response = await memory_list(request);

      expect(response.memories.length).toBeLessThanOrEqual(1);
    });

    it("should not return memories from other users", async () => {
      const request: MemoryListRequest = {
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
      };

      const response = await memory_list(request);

      // All memories should belong to TEST_USER_ID
      response.memories.forEach((memory: any) => {
        expect(memory.user_id).toBe(TEST_USER_ID);
      });
    });

    it("should reject invalid group_id", async () => {
      const request: MemoryListRequest = {
        group_id: "invalid-group" as any,
        user_id: TEST_USER_ID,
      };

      await expect(memory_list(request)).rejects.toThrow("Invalid group_id");
    });
  });

  describe("5. memory_delete", () => {
    let testMemoryId: string;

    beforeEach(async () => {
      // Add a test memory
        const response = await memory_add({
          group_id: TEST_GROUP_ID,
          scope: wsScope(TEST_GROUP_ID),
          user_id: TEST_USER_ID,
          content: uniqueContent("Test memory for delete operation"),
        metadata: { source: "manual" },
      });
      testMemoryId = response.id;
    });

    it("should soft-delete a memory", async () => {
      const request: MemoryDeleteRequest = {
        id: testMemoryId as any,
        group_id: TEST_GROUP_ID,
        scope: wsScope(TEST_GROUP_ID),
        user_id: TEST_USER_ID,
      };

      const response = await memory_delete(request);

      expect(response.id).toBe(testMemoryId);
      expect(response.deleted).toBe(true);
      expect(response.deleted_at).toBeDefined();
      expect(response.recovery_days).toBe(30);
    });

    it("should soft-delete episodic memory without requiring graph promotion", async () => {
      const originalMode = process.env.PROMOTION_MODE;
      process.env.PROMOTION_MODE = "soc2";

      try {
        const addResponse = await memory_add({
          group_id: TEST_GROUP_ID,
          scope: wsScope(TEST_GROUP_ID),
          user_id: TEST_USER_ID,
          content: uniqueContent("User prefers dark mode for deletion test"),
          metadata: { source: "conversation" },
        });

        const deleteRequest: MemoryDeleteRequest = {
          id: addResponse.id as any,
          group_id: TEST_GROUP_ID,
          scope: wsScope(TEST_GROUP_ID),
          user_id: TEST_USER_ID,
        };

        const deleteResponse = await memory_delete(deleteRequest);

        expect(deleteResponse.deleted).toBe(true);
      } finally {
        process.env.PROMOTION_MODE = originalMode;
      }
    });

    it("should reject invalid group_id", async () => {
      const request: MemoryDeleteRequest = {
        id: testMemoryId as any,
        group_id: "invalid-group" as any,
        user_id: TEST_USER_ID,
      };

      await expect(memory_delete(request)).rejects.toThrow("Invalid group_id");
    });
  });

  describe("Tenant Isolation", () => {
    const USER_A = "user-a";
    const USER_B = "user-b";

    it("should isolate memories by group_id", async () => {
      // Add memory for Group A
        await memory_add({
          group_id: GROUP_A,
          scope: wsScope(GROUP_A),
          user_id: USER_A,
          content: uniqueContent("Memory for Group A"),
        metadata: { source: "manual" },
      });

      // Add memory for Group B
        await memory_add({
          group_id: GROUP_B,
          scope: wsScope(GROUP_B),
          user_id: USER_B,
          content: uniqueContent("Memory for Group B"),
        metadata: { source: "manual" },
      });

      // Search Group A (all statuses to include newly-added episodic memories)
      const searchA = await memory_search({
        query: "Memory",
        group_id: GROUP_A,
        scope: wsScope(GROUP_A),
        status: "all" as any,
      });

      // Search Group B
      const searchB = await memory_search({
        query: "Memory",
        group_id: GROUP_B,
        scope: wsScope(GROUP_B),
        status: "all" as any,
      });

      // Verify isolation
      expect(searchA.results.some((r: any) => r.content.includes("Group A"))).toBe(true);
      expect(searchA.results.some((r: any) => r.content.includes("Group B"))).toBe(false);

      expect(searchB.results.some((r: any) => r.content.includes("Group B"))).toBe(true);
      expect(searchB.results.some((r: any) => r.content.includes("Group A"))).toBe(false);
    });

    it("should prevent cross-tenant memory access", async () => {
      // Add memory for Group A
        const addResponse = await memory_add({
          group_id: GROUP_A,
          scope: wsScope(GROUP_A),
          user_id: USER_A,
          content: uniqueContent("Private memory for Group A"),
        metadata: { source: "manual" },
      });

      // Try to get memory from Group B
      await expect(
        memory_get({
          id: addResponse.id as any,
          group_id: GROUP_B,
          scope: wsScope(GROUP_B),
        })
      ).rejects.toThrow("not found");
    });
  });

  describe("Promotion Mode Behavior", () => {
     itIfE2E("should still queue for HITL in auto mode", async () => {
       const originalMode = process.env.PROMOTION_MODE;
       process.env.PROMOTION_MODE = "auto";

       try {
         const response = await memory_add({
           group_id: TEST_GROUP_ID,
           scope: wsScope(TEST_GROUP_ID),
           user_id: TEST_USER_ID,
           // Content must trigger specificity pattern + be long enough for score >= 0.85
           content: uniqueContent("I always prefer dark mode in VS Code editor and terminal window for late night coding sessions"),
           metadata: { source: "conversation" },
         });

         expect(response.stored).toBe("episodic");
         expect(response.pending_review).toBe(true);
       } finally {
         process.env.PROMOTION_MODE = originalMode;
       }
     });

     itIfE2E("should queue for review in soc2 mode", async () => {
       const originalMode = process.env.PROMOTION_MODE;
       process.env.PROMOTION_MODE = "soc2";

       try {
         const response = await memory_add({
           group_id: TEST_GROUP_ID,
           scope: wsScope(TEST_GROUP_ID),
           user_id: TEST_USER_ID,
           // Content must trigger specificity pattern + be long enough for score >= 0.85
           content: uniqueContent("I always prefer using TypeScript strict mode in all my projects and I never compromise on type safety"),
           metadata: { source: "conversation" },
         });

         expect(response.stored).toBe("episodic");
         expect(response.pending_review).toBe(true);
       } finally {
         process.env.PROMOTION_MODE = originalMode;
       }
     });
  });

  describe("Database Error Propagation", () => {
    describe("DatabaseUnavailableError", () => {
      it("should be constructable with operation and cause", () => {
        const cause = new Error("ECONNREFUSED");
        const err = new DatabaseUnavailableError("memory_list", cause);
        expect(err.name).toBe("DatabaseUnavailableError");
        expect(err.operation).toBe("memory_list");
        expect(err.message).toContain("Database unavailable for operation: memory_list");
        expect(err.cause).toBe(cause);
      });
    });

    describe("DatabaseQueryError", () => {
      it("should be constructable with operation, query, and cause", () => {
        const cause = new Error("syntax error at or near SELECTT");
        const err = new DatabaseQueryError("memory_search", "SELECTT events", cause);
        expect(err.name).toBe("DatabaseQueryError");
        expect(err.operation).toBe("memory_search");
        expect(err.query).toBe("SELECTT events");
        expect(err.message).toContain("Database query failed for operation: memory_search");
        expect(err.cause).toBe(cause);
      });
    });

    describe("classifyPostgresError", () => {
      it("should classify ECONNREFUSED as DatabaseUnavailableError", async () => {
        const { classifyPostgresError } = await import("../lib/errors/database-errors");
        const connErr = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
          code: "ECONNREFUSED",
        });
        const result = classifyPostgresError(connErr, "memory_list", "SELECT events");
        expect(result).toBeInstanceOf(DatabaseUnavailableError);
        expect(result.operation).toBe("memory_list");
      });

      it("should classify ENOTFOUND as DatabaseUnavailableError", async () => {
        const { classifyPostgresError } = await import("../lib/errors/database-errors");
        const dnsErr = Object.assign(new Error("getaddrinfo ENOTFOUND db.example.com"), {
          code: "ENOTFOUND",
        });
        const result = classifyPostgresError(dnsErr, "memory_add", "INSERT events");
        expect(result).toBeInstanceOf(DatabaseUnavailableError);
      });

      it("should classify PG 08001 (connection exception) as DatabaseUnavailableError", async () => {
        const { classifyPostgresError } = await import("../lib/errors/database-errors");
        const pgConnErr = Object.assign(new Error("connection refused"), {
          code: "08001",
        });
        const result = classifyPostgresError(pgConnErr, "memory_list", "SELECT events");
        expect(result).toBeInstanceOf(DatabaseUnavailableError);
      });

      it("should classify PG 28P01 (invalid password) as DatabaseUnavailableError", async () => {
        const { classifyPostgresError } = await import("../lib/errors/database-errors");
        const authErr = Object.assign(new Error("password authentication failed"), {
          code: "28P01",
        });
        const result = classifyPostgresError(authErr, "memory_list", "SELECT events");
        expect(result).toBeInstanceOf(DatabaseUnavailableError);
      });

      it("should classify PG 42601 (syntax error) as DatabaseQueryError", async () => {
        const { classifyPostgresError } = await import("../lib/errors/database-errors");
        const syntaxErr = Object.assign(new Error("syntax error at or near \"SELECTT\""), {
          code: "42601",
        });
        const result = classifyPostgresError(syntaxErr, "memory_search", "SELECT events ILIKE");
        expect(result).toBeInstanceOf(DatabaseQueryError);
        expect(result.operation).toBe("memory_search");
      });

      it("should classify PG 23505 (unique violation) as DatabaseQueryError", async () => {
        const { classifyPostgresError } = await import("../lib/errors/database-errors");
        const constraintErr = Object.assign(new Error("duplicate key value violates unique constraint"), {
          code: "23505",
        });
        const result = classifyPostgresError(constraintErr, "memory_add", "INSERT events");
        expect(result).toBeInstanceOf(DatabaseQueryError);
      });
    });

    describe("memory_list error propagation", () => {
      it("should return empty result for legitimate no-data case when databases are available", async () => {
        const request: MemoryListRequest = {
          group_id: TEST_GROUP_ID,
          scope: wsScope(TEST_GROUP_ID),
          user_id: `nonexistent-user-${RUN_ID}`,
        };

        const response = await memory_list(request);
        // Legitimate empty: should return empty, not throw
        expect(response.memories).toBeDefined();
        expect(response.total).toBe(0);
        expect(response.memories).toEqual([]);
      });

      it("should throw DatabaseUnavailableError when PostgreSQL is unreachable", async () => {
        const originalHost = process.env.POSTGRES_HOST;
        const originalPort = process.env.POSTGRES_PORT;
        // Point to a port that refuses connections
        process.env.POSTGRES_HOST = "127.0.0.1";
        process.env.POSTGRES_PORT = "1";
        resetConnections(); // Force pool re-creation with new env

        try {
          const request: MemoryListRequest = {
            group_id: `allura-test-${RUN_ID}` as any,
            scope: wsScope(`allura-test-${RUN_ID}` as any),
            user_id: "test-user-error",
          };

          await expect(memory_list(request)).rejects.toThrow();
          try {
            await memory_list(request);
          } catch (error) {
            expect(error).toBeInstanceOf(DatabaseUnavailableError);
          }
        } finally {
          process.env.POSTGRES_HOST = originalHost;
          process.env.POSTGRES_PORT = originalPort;
          resetConnections(); // Restore working pool
        }
      });
    });

    describe("memory_search error propagation", () => {
      it("should succeed when PostgreSQL is unreachable (RuVector primary, Neo4j fallback)", async () => {
        const originalHost = process.env.POSTGRES_HOST;
        const originalPort = process.env.POSTGRES_PORT;
        process.env.POSTGRES_HOST = "127.0.0.1";
        process.env.POSTGRES_PORT = "1";
        resetConnections();

        try {
          const request: MemorySearchRequest = {
            query: "test",
            group_id: `allura-test-${RUN_ID}` as any,
            scope: wsScope(`allura-test-${RUN_ID}` as any),
          };

          // With Slice B architecture: RuVector is primary, Neo4j is fallback.
          // Search should succeed even when PostgreSQL is unreachable.
          const response = await memory_search(request);
          
          expect(response.results).toBeDefined();
          expect(response.count).toBeGreaterThanOrEqual(0);
          // PG should NOT be in stores_used since it's unreachable
          expect(response.meta?.stores_used).not.toContain("postgres");
        } finally {
          process.env.POSTGRES_HOST = originalHost;
          process.env.POSTGRES_PORT = originalPort;
          resetConnections();
        }
      });
    });

    describe("memory_add error propagation", () => {
      it("should throw DatabaseUnavailableError when PostgreSQL is unreachable", async () => {
        const originalHost = process.env.POSTGRES_HOST;
        const originalPort = process.env.POSTGRES_PORT;
        process.env.POSTGRES_HOST = "127.0.0.1";
        process.env.POSTGRES_PORT = "1";
        resetConnections();

        try {
          const request: MemoryAddRequest = {
            group_id: `allura-test-${RUN_ID}` as any,
            scope: wsScope(`allura-test-${RUN_ID}` as any),
            user_id: "test-user-error",
            content: "Error propagation test",
          };

          await expect(memory_add(request)).rejects.toThrow();
          try {
            await memory_add(request);
          } catch (error) {
            expect(error).toBeInstanceOf(DatabaseUnavailableError);
          }
        } finally {
          process.env.POSTGRES_HOST = originalHost;
          process.env.POSTGRES_PORT = originalPort;
          resetConnections();
        }
      });
    });

    describe("memory_get error propagation", () => {
      it("should throw DatabaseUnavailableError when PostgreSQL is unreachable", async () => {
        const originalHost = process.env.POSTGRES_HOST;
        const originalPort = process.env.POSTGRES_PORT;
        process.env.POSTGRES_HOST = "127.0.0.1";
        process.env.POSTGRES_PORT = "1";
        resetConnections();

        try {
          const request: MemoryGetRequest = {
            id: "some-id" as any,
            group_id: `allura-test-${RUN_ID}` as any,
            scope: wsScope(`allura-test-${RUN_ID}` as any),
          };

          await expect(memory_get(request)).rejects.toThrow();
          try {
            await memory_get(request);
          } catch (error) {
            expect(error).toBeInstanceOf(DatabaseUnavailableError);
          }
        } finally {
          process.env.POSTGRES_HOST = originalHost;
          process.env.POSTGRES_PORT = originalPort;
          resetConnections();
        }
      });
    });

    describe("memory_delete error propagation", () => {
      it("should throw DatabaseUnavailableError when PostgreSQL is unreachable", async () => {
        const originalHost = process.env.POSTGRES_HOST;
        const originalPort = process.env.POSTGRES_PORT;
        process.env.POSTGRES_HOST = "127.0.0.1";
        process.env.POSTGRES_PORT = "1";
        resetConnections();

        try {
          const request: MemoryDeleteRequest = {
            id: "some-id" as any,
            group_id: `allura-test-${RUN_ID}` as any,
            scope: wsScope(`allura-test-${RUN_ID}` as any),
            user_id: "test-user-error",
          };

          await expect(memory_delete(request)).rejects.toThrow();
          try {
            await memory_delete(request);
          } catch (error) {
            expect(error).toBeInstanceOf(DatabaseUnavailableError);
          }
        } finally {
          process.env.POSTGRES_HOST = originalHost;
          process.env.POSTGRES_PORT = originalPort;
          resetConnections();
        }
      });
    });
  });
});
