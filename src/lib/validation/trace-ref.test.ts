import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createArtifactTraceRef,
  createEventTraceRef,
  extractTraceRefs,
  formatTraceRef,
  getTraceRefId,
  getTraceRefTable,
  isTraceRefFormat,
  parseTraceRef,
  SUPPORTED_TRACE_TABLES,
  TraceRefValidationError,
  validateTraceRefFormat,
  validateTraceRefs,
  verifyTraceRefExists,
} from "./trace-ref";
import { closePool } from "../postgres/connection";
import { insertEvent } from "../postgres/queries/insert-trace";

import { freshFixtureScope, requireDisposableFixture } from "../../../tests/fixtures/disposable-postgres";

let guard: Promise<() => void> | undefined;
async function requireLiveFixture(): Promise<void> {
  guard ??= requireDisposableFixture("src/lib/validation/trace-ref.test.ts");
  (await guard)();
}

describe("trace-ref validation", () => {
  afterAll(async () => { await closePool(); });

  // =========================================================================
  // parseTraceRef Tests
  // =========================================================================

  describe("parseTraceRef", () => {
    it("should parse valid trace_ref", () => {
      const result = parseTraceRef("events:12345");
      expect(result.table).toBe("events");
      expect(result.id).toBe(12345);
      expect(result.raw).toBe("events:12345");
    });

    it("should normalize table name to lowercase", () => {
      const result = parseTraceRef("EVENTS:12345");
      expect(result.table).toBe("events");
    });

    it("should parse artifacts trace_ref", () => {
      const result = parseTraceRef("artifacts:67890");
      expect(result.table).toBe("artifacts");
      expect(result.id).toBe(67890);
    });

    it("should reject empty string", () => {
      expect(() => parseTraceRef("")).toThrow(TraceRefValidationError);
      expect(() => parseTraceRef("")).toThrow("non-empty string");
    });

    it("should reject null or undefined", () => {
      expect(() => parseTraceRef(null as unknown as string)).toThrow(TraceRefValidationError);
      expect(() => parseTraceRef(undefined as unknown as string)).toThrow(TraceRefValidationError);
    });

    it("should reject missing colon separator", () => {
      expect(() => parseTraceRef("events12345")).toThrow("format 'table:id'");
    });

    it("should reject multiple colons", () => {
      expect(() => parseTraceRef("events:123:456")).toThrow("exactly one ':'");
    });

    it("should reject non-numeric id", () => {
      expect(() => parseTraceRef("events:abc")).toThrow("must be a number");
    });

    it("should reject negative id", () => {
      expect(() => parseTraceRef("events:-123")).toThrow("must be positive");
    });

    it("should reject zero id", () => {
      expect(() => parseTraceRef("events:0")).toThrow("must be positive");
    });

    it("should trim whitespace", () => {
      const result = parseTraceRef("  events:12345  ");
      expect(result.table).toBe("events");
      expect(result.id).toBe(12345);
    });
  });

  // =========================================================================
  // formatTraceRef Tests
  // =========================================================================

  describe("formatTraceRef", () => {
    it("should format trace_ref from components", () => {
      expect(formatTraceRef("events", 12345)).toBe("events:12345");
      expect(formatTraceRef("EVENTS", 12345)).toBe("events:12345");
      expect(formatTraceRef("artifacts", "abc-123")).toBe("artifacts:abc-123");
    });
  });

  // =========================================================================
  // validateTraceRefFormat Tests
  // =========================================================================

  describe("validateTraceRefFormat", () => {
    it("should validate correct format", () => {
      const result = validateTraceRefFormat("events:12345");
      expect(result.valid).toBe(true);
      expect(result.trace_ref?.table).toBe("events");
      expect(result.trace_ref?.id).toBe(12345);
    });

    it("should reject unsupported table", () => {
      const result = validateTraceRefFormat("unknown_table:12345");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported table");
    });

    it("should reject invalid format", () => {
      const result = validateTraceRefFormat("invalid");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("format 'table:id'");
    });

    it("should accept all supported tables", () => {
      for (const table of SUPPORTED_TRACE_TABLES) {
        const result = validateTraceRefFormat(`${table}:1`);
        expect(result.valid).toBe(true);
      }
    });
  });

  // =========================================================================
  // verifyTraceRefExists Tests
  // =========================================================================

  describe("verifyTraceRefExists", () => {
    let testGroupId: string;
    beforeEach(async () => {
      await requireLiveFixture();
      testGroupId = freshFixtureScope().groupId;
    });

    it("should return exists=true for existing event", async () => {
      // Insert a test event
      const event = await insertEvent({
        group_id: testGroupId,
        event_type: "test-event",
        agent_id: "test-agent",
      });

      const result = await verifyTraceRefExists(`events:${event.id}`);

      expect(result.valid).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.trace_ref?.table).toBe("events");
      expect(result.trace_ref?.id).toBe(Number(event.id));
    });

    it("should return exists=false for non-existent event", async () => {
      const result = await verifyTraceRefExists("events:999999999");

      expect(result.valid).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.error).toContain("No record found");
    });

    it("should reject invalid format", async () => {
      const result = await verifyTraceRefExists("invalid");

      expect(result.valid).toBe(false);
      expect(result.trace_ref).toBeNull();
    });

    it("should reject unsupported table", async () => {
      const result = await verifyTraceRefExists("unknown_table:123");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported table");
    });
  });

  // =========================================================================
  // validateTraceRefs Tests
  // =========================================================================

  describe("validateTraceRefs", () => {
    let testGroupId: string;
    beforeEach(async () => {
      await requireLiveFixture();
      testGroupId = freshFixtureScope().groupId;
    });

    it("should validate multiple trace_refs", async () => {
      // Insert a test event
      const event = await insertEvent({
        group_id: testGroupId,
        event_type: "batch-test",
        agent_id: "test-agent",
      });

      const results = await validateTraceRefs([
        `events:${event.id}`,
        "events:999999999",
        "invalid",
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[0].exists).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[1].exists).toBe(false);
      expect(results[2].valid).toBe(false);
    });
  });

  // =========================================================================
  // extractTraceRefs Tests
  // =========================================================================

  describe("extractTraceRefs", () => {
    it("should extract trace_refs from text", () => {
      const text = "Based on events:123 and artifacts:456, we found...";
      const refs = extractTraceRefs(text);

      expect(refs).toHaveLength(2);
      expect(refs).toContain("events:123");
      expect(refs).toContain("artifacts:456");
    });

    it("should handle case-insensitive extraction", () => {
      const text = "EVENTS:123 and Events:456";
      const refs = extractTraceRefs(text);

      expect(refs).toHaveLength(2);
      expect(refs).toContain("events:123");
      expect(refs).toContain("events:456");
    });

    it("should deduplicate refs", () => {
      const text = "events:123 events:123 events:123";
      const refs = extractTraceRefs(text);

      expect(refs).toHaveLength(1);
      expect(refs[0]).toBe("events:123");
    });

    it("should return empty array for no refs", () => {
      const text = "No trace references here";
      const refs = extractTraceRefs(text);

      expect(refs).toHaveLength(0);
    });
  });

  // =========================================================================
  // Helper Function Tests
  // =========================================================================

  describe("createEventTraceRef", () => {
    it("should create events trace_ref", () => {
      expect(createEventTraceRef(12345)).toBe("events:12345");
    });
  });

  describe("createArtifactTraceRef", () => {
    it("should create artifacts trace_ref", () => {
      expect(createArtifactTraceRef("abc-123")).toBe("artifacts:abc-123");
    });
  });

  describe("isTraceRefFormat", () => {
    it("should return true for valid format", () => {
      expect(isTraceRefFormat("events:12345")).toBe(true);
      expect(isTraceRefFormat("artifacts:67890")).toBe(true);
    });

    it("should return false for invalid format", () => {
      expect(isTraceRefFormat("invalid")).toBe(false);
      expect(isTraceRefFormat("")).toBe(false);
      expect(isTraceRefFormat(null)).toBe(false);
      expect(isTraceRefFormat(12345)).toBe(false);
    });
  });

  describe("getTraceRefTable", () => {
    it("should extract table name", () => {
      expect(getTraceRefTable("events:12345")).toBe("events");
      expect(getTraceRefTable("artifacts:67890")).toBe("artifacts");
    });

    it("should return null for invalid format", () => {
      expect(getTraceRefTable("invalid")).toBeNull();
    });
  });

  describe("getTraceRefId", () => {
    it("should extract ID", () => {
      expect(getTraceRefId("events:12345")).toBe(12345);
      expect(getTraceRefId("artifacts:67890")).toBe(67890);
    });

    it("should return null for invalid format", () => {
      expect(getTraceRefId("invalid")).toBeNull();
    });
  });
});