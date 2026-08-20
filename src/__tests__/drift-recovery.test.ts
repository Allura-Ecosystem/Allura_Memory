/**
 * Story 21.4: Drift Alerting + Auto-Recovery Integration — Unit Tests
 * ============================================================================
 * Tests the drift recovery cycle: detection of RETRIEVAL_DRIFT events,
 * classification into drift types, recovery action selection, execution,
 * and the 3-strike escalation limit.
 *
 * These tests run in the unit lane (no DB, no external services).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock external dependencies before importing ───────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
  isPoolHealthy: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock("@/control-plane/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "test-audit-id" },
  }),
}));

// ── Import after mocking ──────────────────────────────────────────────────────

import {
  classifyDriftType,
  createDefaultDeps,
  decideDriftRecoveryAction,
  type DriftAlertEvent,
  type DriftType,
  executeDriftRecovery,
  MAX_RECOVERY_ATTEMPTS,
  type RecoveryDeps,
  runDriftRecoveryCycle,
} from "@/lib/healing/auto-recovery";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeDriftEvent(
  overrides: Partial<DriftAlertEvent> = {},
): DriftAlertEvent {
  return {
    id: 1,
    group_id: "allura-system",
    event_type: "RETRIEVAL_DRIFT",
    created_at: new Date().toISOString(),
    metadata: {
      checks_failed: 1,
      severity: "high",
      details: [],
    },
    ...overrides,
  };
}

function makeMockDeps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
  return {
    execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    pgIsReady: vi.fn().mockResolvedValue(true),
    mcpHealthCheck: vi.fn().mockResolvedValue(true),
    getDiskUsage: vi.fn().mockResolvedValue({ usedPercent: 50, mount: "/" }),
    getMemoryUsage: vi.fn().mockResolvedValue({ availableMB: 8192, totalMB: 16384 }),
    logRecoveryEvent: vi.fn().mockResolvedValue(undefined),
    getRecentAttemptCount: vi.fn().mockResolvedValue(0),
    sendAlert: vi.fn().mockResolvedValue(undefined),
    getDriftAlerts: vi.fn().mockResolvedValue([]),
    sendDriftEscalation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Story 21.4: Drift Alerting + Auto-Recovery Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── classifyDriftType ─────────────────────────────────────────────────────

  describe("classifyDriftType", () => {
    it("classifies index_coverage failure as index_drift", () => {
      const event = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "subsystem_health", passed: true, detail: "OK" },
            { name: "index_coverage", passed: false, detail: "Low coverage" },
          ],
        },
      });
      expect(classifyDriftType(event)).toBe("index_drift");
    });

    it("classifies count_parity failure as missing_promotions", () => {
      const event = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "count_parity", passed: false, detail: "No proposals" },
          ],
        },
      });
      expect(classifyDriftType(event)).toBe("missing_promotions");
    });

    it("classifies reader_writer_parity failure as schema_mismatch", () => {
      const event = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "reader_writer_parity", passed: false, detail: "Missing tables" },
          ],
        },
      });
      expect(classifyDriftType(event)).toBe("schema_mismatch");
    });

    it("classifies unknown failures as unknown", () => {
      const event = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "public_api_roundtrip", passed: false, detail: "Unreachable" },
          ],
        },
      });
      expect(classifyDriftType(event)).toBe("unknown");
    });

    it("classifies event with no details as unknown", () => {
      const event = makeDriftEvent({
        metadata: { checks_failed: 1, severity: "high" },
      });
      expect(classifyDriftType(event)).toBe("unknown");
    });
  });

  // ── decideDriftRecoveryAction ─────────────────────────────────────────────

  describe("decideDriftRecoveryAction", () => {
    it("returns re-index for index_drift", () => {
      expect(decideDriftRecoveryAction("index_drift")).toBe("re-index");
    });

    it("returns trigger-watchdog for missing_promotions", () => {
      expect(decideDriftRecoveryAction("missing_promotions")).toBe("trigger-watchdog");
    });

    it("returns alert for schema_mismatch (no auto-fix)", () => {
      expect(decideDriftRecoveryAction("schema_mismatch")).toBe("alert");
    });

    it("returns alert for unknown drift type", () => {
      expect(decideDriftRecoveryAction("unknown")).toBe("alert");
    });
  });

  // ── executeDriftRecovery ──────────────────────────────────────────────────

  describe("executeDriftRecovery", () => {
    it("executes re-index action successfully", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockResolvedValue({ stdout: "recovered", stderr: "" }),
      });
      const result = await executeDriftRecovery("index_drift", "re-index", deps);

      expect(result.success).toBe(true);
      expect(result.driftType).toBe("index_drift");
      expect(result.action).toBe("re-index");
      expect(deps.execCmd).toHaveBeenCalledTimes(1);
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "drift_audit",
        "re-index",
        true,
      );
    });

    it("logs failure when re-index action fails", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockRejectedValue(new Error("re-index failed")),
      });
      const result = await executeDriftRecovery("index_drift", "re-index", deps);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("re-index failed");
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "drift_audit",
        "re-index",
        false,
        expect.stringContaining("re-index failed"),
      );
    });

    it("executes trigger-watchdog action successfully", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockResolvedValue({ stdout: "watchdog done", stderr: "" }),
      });
      const result = await executeDriftRecovery("missing_promotions", "trigger-watchdog", deps);

      expect(result.success).toBe(true);
      expect(result.driftType).toBe("missing_promotions");
      expect(result.action).toBe("trigger-watchdog");
      expect(deps.execCmd).toHaveBeenCalledTimes(1);
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "drift_audit",
        "trigger-watchdog",
        true,
      );
    });

    it("logs failure when trigger-watchdog action fails", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockRejectedValue(new Error("watchdog crashed")),
      });
      const result = await executeDriftRecovery("missing_promotions", "trigger-watchdog", deps);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("watchdog crashed");
    });

    it("sends escalation for schema_mismatch (alert only, no auto-fix)", async () => {
      const deps = makeMockDeps();
      const result = await executeDriftRecovery("schema_mismatch", "alert", deps);

      expect(result.success).toBe(true);
      expect(result.driftType).toBe("schema_mismatch");
      expect(result.action).toBe("alert");
      expect(deps.sendDriftEscalation).toHaveBeenCalledWith(
        "schema_mismatch",
        expect.stringContaining("schema_mismatch"),
      );
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "drift_audit",
        "alert",
        true,
        expect.stringContaining("schema_mismatch"),
      );
    });
  });

  // ── runDriftRecoveryCycle ──────────────────────────────────────────────────

  describe("runDriftRecoveryCycle", () => {
    it("returns empty array when no drift events found", async () => {
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([]),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(0);
    });

    it("triggers re-index recovery for index_drift event", async () => {
      const driftEvent = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "index_coverage", passed: false, detail: "Low coverage" },
          ],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([driftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(1);
      expect(results[0].driftType).toBe("index_drift");
      expect(results[0].action).toBe("re-index");
      expect(results[0].success).toBe(true);
    });

    it("triggers watchdog for missing_promotions event", async () => {
      const driftEvent = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "count_parity", passed: false, detail: "No proposals" },
          ],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([driftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(1);
      expect(results[0].driftType).toBe("missing_promotions");
      expect(results[0].action).toBe("trigger-watchdog");
    });

    it("sends alert for schema_mismatch (no auto-fix)", async () => {
      const driftEvent = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "reader_writer_parity", passed: false, detail: "Missing tables" },
          ],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([driftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        sendDriftEscalation: vi.fn().mockResolvedValue(undefined),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(1);
      expect(results[0].driftType).toBe("schema_mismatch");
      expect(results[0].action).toBe("alert");
      expect(deps.sendDriftEscalation).toHaveBeenCalledTimes(1);
    });

    it("escalates after 3 failed recovery attempts (3-strike limit)", async () => {
      const driftEvent = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "index_coverage", passed: false, detail: "Low coverage" },
          ],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([driftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(MAX_RECOVERY_ATTEMPTS),
        sendDriftEscalation: vi.fn().mockResolvedValue(undefined),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe("drift-escalation");
      expect(results[0].escalated).toBe(true);
      expect(deps.sendDriftEscalation).toHaveBeenCalledTimes(1);
      expect(deps.sendDriftEscalation).toHaveBeenCalledWith(
        "index_drift",
        expect.stringContaining("3 times"),
      );
    });

    it("does not escalate before 3 attempts", async () => {
      const driftEvent = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [
            { name: "index_coverage", passed: false, detail: "Low coverage" },
          ],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([driftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(MAX_RECOVERY_ATTEMPTS - 1),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(1);
      expect(results[0].action).not.toBe("drift-escalation");
      expect(results[0].escalated).toBe(false);
      expect(deps.sendDriftEscalation).not.toHaveBeenCalled();
    });

    it("processes multiple drift events in one cycle", async () => {
      const indexDriftEvent = makeDriftEvent({
        id: 1,
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [{ name: "index_coverage", passed: false, detail: "Low" }],
        },
      });
      const schemaDriftEvent = makeDriftEvent({
        id: 2,
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [{ name: "reader_writer_parity", passed: false, detail: "Missing" }],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([indexDriftEvent, schemaDriftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
        sendDriftEscalation: vi.fn().mockResolvedValue(undefined),
      });
      const results = await runDriftRecoveryCycle(deps);

      expect(results).toHaveLength(2);
      expect(results[0].driftType).toBe("index_drift");
      expect(results[0].action).toBe("re-index");
      expect(results[1].driftType).toBe("schema_mismatch");
      expect(results[1].action).toBe("alert");
    });

    it("logs recovery events with component=drift_audit", async () => {
      const driftEvent = makeDriftEvent({
        metadata: {
          checks_failed: 1,
          severity: "high",
          details: [{ name: "index_coverage", passed: false, detail: "Low" }],
        },
      });
      const deps = makeMockDeps({
        getDriftAlerts: vi.fn().mockResolvedValue([driftEvent]),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      await runDriftRecoveryCycle(deps);

      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "drift_audit",
        "re-index",
        true,
      );
    });
  });

  // ── createDefaultDeps includes drift deps ──────────────────────────────────

  describe("createDefaultDeps includes drift functions", () => {
    it("returns getDriftAlerts and sendDriftEscalation", () => {
      const deps = createDefaultDeps();
      expect(typeof deps.getDriftAlerts).toBe("function");
      expect(typeof deps.sendDriftEscalation).toBe("function");
    });

    it("allows overriding drift functions", () => {
      const customGetDrift = vi.fn().mockResolvedValue([]);
      const deps = createDefaultDeps({ getDriftAlerts: customGetDrift });
      expect(deps.getDriftAlerts).toBe(customGetDrift);
    });
  });
});