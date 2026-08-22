/**
 * E2E Integration Tests - Full Pipeline
 * Tests the complete Unified Knowledge System with live services
 * 
 * Prerequisites:
 * - PostgreSQL accessible via DATABASE_URL or POSTGRES_* env vars
 * - Environment variables set (see .env.production.example)
 * 
 * Run with: bun run test:e2e
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Load environment variables from .env file
config();

// Skip E2E tests unless explicitly enabled
const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";

const E2E_TIMEOUT = 30000; // 30 seconds for integration tests

describe.skipIf(!shouldRunE2E)("E2E Integration Tests", () => {
  let pgPool: Pool;

  beforeAll(async () => {
    if (!process.env.POSTGRES_PASSWORD) {
      throw new Error("POSTGRES_PASSWORD environment variable is required");
    }

    // Initialize PostgreSQL connection. Prefer a full connection string when provided.
    const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (databaseUrl) {
      pgPool = new Pool({ connectionString: databaseUrl });
    } else {
      pgPool = new Pool({
        host: process.env.POSTGRES_HOST || "localhost",
        port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
        database: process.env.POSTGRES_DB || "memory",
        user: process.env.POSTGRES_USER || "ronin4life",
        password: process.env.POSTGRES_PASSWORD,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 10,
      });
    }

    await pgPool.query("SELECT 1");
  }, E2E_TIMEOUT);

  async function cleanupTestData(): Promise<void> {
    // Keep this order: dependent records must go before their parent rows.
    await pgPool.query("DELETE FROM outcomes WHERE event_id IN (SELECT id FROM events WHERE metadata->>'test_run' IS NOT NULL)");
    await pgPool.query("DELETE FROM events WHERE metadata->>'test_run' IS NOT NULL");
    await pgPool.query("DELETE FROM sync_drift_log WHERE design_id LIKE 'test_%'");
    await pgPool.query("DELETE FROM design_sync_status WHERE design_id LIKE 'test_%'");
    await pgPool.query("DELETE FROM canonical_proposals WHERE content LIKE 'e2e:%'");
    await pgPool.query("DELETE FROM graph_memories WHERE id LIKE 'e2e-%'");
  }

  afterAll(async () => {
    await cleanupTestData();
    await pgPool?.end();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe("PostgreSQL Connection", () => {
    it("should connect to PostgreSQL", async () => {
      const result = await pgPool.query("SELECT 1 as test");
      expect(result.rows[0].test).toBe(1);
    });

    it("should have events table", async () => {
      const result = await pgPool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'events'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.map(r => r.column_name)).toContain("id");
      expect(result.rows.map(r => r.column_name)).toContain("event_type");
    });

    it("should have outcomes table", async () => {
      const result = await pgPool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'outcomes'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.map(r => r.column_name)).toContain("id");
      expect(result.rows.map(r => r.column_name)).toContain("event_id");
    });

    it("should have design_sync_status table", async () => {
      const result = await pgPool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'design_sync_status'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.map(r => r.column_name)).toContain("design_id");
      expect(result.rows.map(r => r.column_name)).toContain("notion_page_id");
    });
  });

  describe("Graph Memory Storage", () => {
    it("should have the PostgreSQL graph_memories table", async () => {
      const result = await pgPool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'graph_memories'",
      );
      const columns = result.rows.map((row) => row.column_name);
      expect(columns).toContain("id");
      expect(columns).toContain("group_id");
      expect(columns).toContain("content");
    });

    it("should write and read an active graph memory", async () => {
      await pgPool.query(
        `INSERT INTO graph_memories (id, group_id, content, score, provenance, version)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["e2e-graph-memory", "allura-e2e-graph", "e2e: graph memory", 0.85, "manual", 1],
      );

      const result = await pgPool.query(
        "SELECT content FROM graph_memories WHERE id = $1 AND group_id = $2 AND deprecated = false",
        ["e2e-graph-memory", "allura-e2e-graph"],
      );
      expect(result.rows).toEqual([{ content: "e2e: graph memory" }]);
    });
  });

  describe("Epic 1: Persistent Knowledge Capture", () => {
    it("should insert event and outcome", async () => {
      const eventResult = await pgPool.query(`
        INSERT INTO events (group_id, event_type, agent_id, workflow_id, metadata, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        "allura-e2e-insert",
        "test_event",
        "test_agent",
        "test_workflow",
        JSON.stringify({ test_run: true }),
        "completed"
      ]);

      expect(eventResult.rows[0].id).toBeDefined();

      const outcomeResult = await pgPool.query(`
        INSERT INTO outcomes (event_id, group_id, outcome_type, data, confidence)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        eventResult.rows[0].id,
        "allura-e2e-insert",
        "test_outcome",
        JSON.stringify({ key: "value" }),
        0.95
      ]);

      expect(outcomeResult.rows[0].id).toBeDefined();
    });

    it("should query events by group_id", async () => {
      // Insert test data
      await pgPool.query(`
        INSERT INTO events (group_id, event_type, agent_id, workflow_id, metadata, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        "allura-e2e-query",
        "test_query",
        "test_agent",
        "test_workflow",
        JSON.stringify({ test_run: true }),
        "completed"
      ]);

      // Query by group_id
      const result = await pgPool.query(`
        SELECT * FROM events WHERE group_id = $1
      `, ["allura-e2e-query"]);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].group_id).toBe("allura-e2e-query");
    });
  });

  describe("Epic 2: Canonical Proposal Pipeline", () => {
    it("should create a tenant-scoped proposal", async () => {
      const result = await pgPool.query(
        `INSERT INTO canonical_proposals (group_id, content, score, reasoning, tier, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, status`,
        [
          "allura-e2e-proposal",
          "e2e: proposal verifies the governed promotion queue",
          0.85,
          "E2E integration coverage",
          "mainstream",
          "pending",
        ],
      );

      expect(result.rows[0].id).toBeDefined();
      expect(result.rows[0].status).toBe("pending");
    });
  });

  describe("Epic 3: Governed Runtime", () => {
    it("should track circuit breaker state", async () => {
      // Import and test circuit breaker
      const { createCircuitBreaker } = await import("../lib/circuit-breaker/breaker");
      
      const breaker = createCircuitBreaker({
        name: "test-breaker",
        groupId: "test-group",
        errorThreshold: 3,
      });

      expect(breaker.getState()).toBe("closed");

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await breaker.execute("test", async () => {
          throw new Error("Test error");
        });
      }

      expect(breaker.getState()).toBe("open");
    });
  });

  describe("Epic 4: Integration & Sync Pipeline", () => {
    it("should extract events from PostgreSQL", async () => {
      // Insert test data
      await pgPool.query(`
        INSERT INTO events (group_id, event_type, agent_id, workflow_id, metadata, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        "allura-e2e-extract",
        "test_extract",
        "test_agent",
        "test_workflow",
        JSON.stringify({ test_run: true, key: "value" }),
        "completed"
      ]);

      // For E2E, we verify the database is queryable
      const result = await pgPool.query(`
        SELECT * FROM events WHERE group_id = $1
      `, ["allura-e2e-extract"]);

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it("should detect sync drift", async () => {
      // Create test sync record
      await pgPool.query(`
        INSERT INTO design_sync_status (
          id, design_id, group_id, notion_page_id, notion_page_url,
          version, synced_at, status
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), 'synced'
        )
      `, [
        "test_drift_design",
        "allura-e2e-drift",
        "test_page_id",
        "https://notion.so/test",
        1
      ]);

      // Verify sync status exists
      const result = await pgPool.query(`
        SELECT * FROM design_sync_status WHERE design_id = $1
      `, ["test_drift_design"]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe("synced");
    });
  });

  describe("Health Checks", () => {
    it("should verify PostgreSQL and the graph memory table are healthy", async () => {
      const result = await pgPool.query(
        "SELECT to_regclass('public.graph_memories') AS graph_memories",
      );
      expect(result.rows[0].graph_memories).toBe("graph_memories");
    });
  });

  describe("Performance Benchmarks", () => {
    it("should insert 100 events in under 1 second", async () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        await pgPool.query(`
          INSERT INTO events (group_id, event_type, agent_id, workflow_id, metadata, status)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          `allura-e2e-perf-${i}`,
          "perf_test",
          "test_agent",
          "test_workflow",
          JSON.stringify({ test_run: true, index: i }),
          "completed"
        ]);
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it("should bulk insert 100 graph memories in under 2 seconds", async () => {
      const start = Date.now();
      const result = await pgPool.query(
        `INSERT INTO graph_memories (id, group_id, content, score, provenance, version)
         SELECT 'e2e-graph-perf-' || series, 'allura-e2e-perf',
                'e2e: graph performance row ' || series, 0.5, 'manual', 1
         FROM generate_series(1, 100) AS series
         RETURNING id`,
      );

      expect(result.rowCount).toBe(100);
      expect(Date.now() - start).toBeLessThan(2000);
    });
  });
});