/**
 * Story 2.3: Self-Healing (Auto-Recovery) — Unit Tests
 * ============================================================================
 * Tests the recovery decision logic, health check functions, and recovery
 * action execution. All external dependencies (exec, DB, network) are mocked.
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

vi.mock("@/kernel/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "test-audit-id" },
  }),
}));

// ── Import after mocking ──────────────────────────────────────────────────────

import {
  checkDiskSpace,
  checkMemoryUsage,
  checkMcpContainer,
  checkPostgres,
  clearStaleConnections,
  createDefaultDeps,
  decideRecoveryAction,
  executeRecovery,
  MAX_RECOVERY_ATTEMPTS,
  runHealthChecks,
  restartMcpContainer,
  runBrainRecover,
  runRecoveryCycle,
  type HealthCheckResult,
  type RecoveryDeps,
} from "@/lib/healing/auto-recovery";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeHealthyResult(component: string): HealthCheckResult {
  return {
    component: component as HealthCheckResult["component"],
    healthy: true,
    message: "OK",
  };
}

function makeUnhealthyResult(component: string): HealthCheckResult {
  return {
    component: component as HealthCheckResult["component"],
    healthy: false,
    message: "Unhealthy",
  };
}

function makeWarningResult(component: string): HealthCheckResult {
  return {
    component: component as HealthCheckResult["component"],
    healthy: true,
    warning: true,
    message: "Warning",
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
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Story 2.3: Self-Healing — Auto-Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Recovery decision logic ──────────────────────────────────────────────

  describe("decideRecoveryAction — decision logic", () => {
    it("returns no-action when component is healthy", () => {
      const health = makeHealthyResult("mcp-container");
      const decision = decideRecoveryAction(health, 0);

      expect(decision.action).toBe("no-action");
      expect(decision.shouldAlert).toBe(false);
      expect(decision.attemptCount).toBe(0);
    });

    it("returns restart-mcp when MCP container is unhealthy (attempt 1)", () => {
      const health = makeUnhealthyResult("mcp-container");
      const decision = decideRecoveryAction(health, 0);

      expect(decision.action).toBe("restart-mcp");
      expect(decision.shouldAlert).toBe(false);
      expect(decision.attemptCount).toBe(1);
      expect(decision.component).toBe("mcp-container");
    });

    it("returns brain-recover when PostgreSQL is unhealthy", () => {
      const health = makeUnhealthyResult("postgres");
      const decision = decideRecoveryAction(health, 0);

      expect(decision.action).toBe("brain-recover");
      expect(decision.shouldAlert).toBe(false);
      expect(decision.attemptCount).toBe(1);
    });

    it("returns clear-stale-connections when memory is in warning", () => {
      const health = makeWarningResult("memory");
      const decision = decideRecoveryAction(health, 0);

      expect(decision.action).toBe("clear-stale-connections");
      expect(decision.shouldAlert).toBe(false);
    });

    it("returns no-action for disk warning (cannot auto-recover disk)", () => {
      const health = makeWarningResult("disk");
      const decision = decideRecoveryAction(health, 0);

      expect(decision.action).toBe("no-action");
      expect(decision.shouldAlert).toBe(false);
    });

    it("alerts after MAX_RECOVERY_ATTEMPTS for MCP container", () => {
      const health = makeUnhealthyResult("mcp-container");
      const decision = decideRecoveryAction(health, MAX_RECOVERY_ATTEMPTS);

      expect(decision.action).toBe("alert");
      expect(decision.shouldAlert).toBe(true);
    });

    it("alerts after MAX_RECOVERY_ATTEMPTS for PostgreSQL", () => {
      const health = makeUnhealthyResult("postgres");
      const decision = decideRecoveryAction(health, MAX_RECOVERY_ATTEMPTS);

      expect(decision.action).toBe("alert");
      expect(decision.shouldAlert).toBe(true);
    });

    it("does not alert before MAX_RECOVERY_ATTEMPTS", () => {
      const health = makeUnhealthyResult("mcp-container");
      const decision = decideRecoveryAction(health, MAX_RECOVERY_ATTEMPTS - 1);

      expect(decision.action).not.toBe("alert");
      expect(decision.shouldAlert).toBe(false);
      expect(decision.attemptCount).toBe(MAX_RECOVERY_ATTEMPTS);
    });

    it("alerts at exactly MAX_RECOVERY_ATTEMPTS boundary", () => {
      const health = makeUnhealthyResult("mcp-container");
      const decision = decideRecoveryAction(health, MAX_RECOVERY_ATTEMPTS);

      expect(decision.shouldAlert).toBe(true);
      expect(decision.attemptCount).toBe(MAX_RECOVERY_ATTEMPTS);
    });

    it("alerts when attempts exceed MAX_RECOVERY_ATTEMPTS", () => {
      const health = makeUnhealthyResult("postgres");
      const decision = decideRecoveryAction(health, MAX_RECOVERY_ATTEMPTS + 5);

      expect(decision.action).toBe("alert");
      expect(decision.shouldAlert).toBe(true);
    });
  });

  // ── Health checks ────────────────────────────────────────────────────────

  describe("checkPostgres", () => {
    it("returns healthy when pgIsReady returns true", async () => {
      const deps = makeMockDeps({ pgIsReady: vi.fn().mockResolvedValue(true) });
      const result = await checkPostgres(deps);

      expect(result.healthy).toBe(true);
      expect(result.component).toBe("postgres");
    });

    it("returns unhealthy when pgIsReady returns false", async () => {
      const deps = makeMockDeps({ pgIsReady: vi.fn().mockResolvedValue(false) });
      const result = await checkPostgres(deps);

      expect(result.healthy).toBe(false);
      expect(result.component).toBe("postgres");
    });

    it("returns unhealthy when pgIsReady throws", async () => {
      const deps = makeMockDeps({
        pgIsReady: vi.fn().mockRejectedValue(new Error("connection refused")),
      });
      const result = await checkPostgres(deps);

      expect(result.healthy).toBe(false);
      expect(result.message).toContain("connection refused");
    });
  });

  describe("checkMcpContainer", () => {
    it("returns healthy when mcpHealthCheck returns true", async () => {
      const deps = makeMockDeps({ mcpHealthCheck: vi.fn().mockResolvedValue(true) });
      const result = await checkMcpContainer(deps);

      expect(result.healthy).toBe(true);
      expect(result.component).toBe("mcp-container");
    });

    it("returns unhealthy when mcpHealthCheck returns false", async () => {
      const deps = makeMockDeps({ mcpHealthCheck: vi.fn().mockResolvedValue(false) });
      const result = await checkMcpContainer(deps);

      expect(result.healthy).toBe(false);
      expect(result.component).toBe("mcp-container");
    });
  });

  describe("checkDiskSpace", () => {
    it("returns healthy when disk usage is below threshold", async () => {
      const deps = makeMockDeps({
        getDiskUsage: vi.fn().mockResolvedValue({ usedPercent: 50, mount: "/" }),
      });
      const result = await checkDiskSpace(deps);

      expect(result.healthy).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("returns warning when disk usage exceeds 90%", async () => {
      const deps = makeMockDeps({
        getDiskUsage: vi.fn().mockResolvedValue({ usedPercent: 95, mount: "/" }),
      });
      const result = await checkDiskSpace(deps);

      expect(result.healthy).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.message).toContain("95%");
    });
  });

  describe("checkMemoryUsage", () => {
    it("returns healthy when memory is plentiful", async () => {
      const deps = makeMockDeps({
        getMemoryUsage: vi.fn().mockResolvedValue({ availableMB: 8192, totalMB: 16384 }),
      });
      const result = await checkMemoryUsage(deps);

      expect(result.healthy).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("returns warning when available memory is low", async () => {
      const deps = makeMockDeps({
        getMemoryUsage: vi.fn().mockResolvedValue({ availableMB: 128, totalMB: 16384 }),
      });
      const result = await checkMemoryUsage(deps);

      expect(result.healthy).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.message).toContain("Low memory");
    });
  });

  describe("runHealthChecks", () => {
    it("returns healthy when all components are healthy", async () => {
      const deps = makeMockDeps();
      const report = await runHealthChecks(deps);

      expect(report.overall).toBe("healthy");
      expect(report.checks).toHaveLength(4);
    });

    it("returns degraded when any component has a warning", async () => {
      const deps = makeMockDeps({
        getDiskUsage: vi.fn().mockResolvedValue({ usedPercent: 95, mount: "/" }),
      });
      const report = await runHealthChecks(deps);

      expect(report.overall).toBe("degraded");
    });

    it("returns unhealthy when any component is unhealthy", async () => {
      const deps = makeMockDeps({
        mcpHealthCheck: vi.fn().mockResolvedValue(false),
      });
      const report = await runHealthChecks(deps);

      expect(report.overall).toBe("unhealthy");
    });
  });

  // ── Recovery actions ──────────────────────────────────────────────────────

  describe("restartMcpContainer", () => {
    it("succeeds when exec succeeds", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockResolvedValue({ stdout: "restarted", stderr: "" }),
      });
      const result = await restartMcpContainer(deps);

      expect(result.success).toBe(true);
    });

    it("fails when exec throws", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockRejectedValue(new Error("container not found")),
      });
      const result = await restartMcpContainer(deps);

      expect(result.success).toBe(false);
      expect(result.error).toContain("container not found");
    });
  });

  describe("runBrainRecover", () => {
    it("succeeds when script runs successfully", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockResolvedValue({ stdout: "recovered", stderr: "" }),
      });
      const result = await runBrainRecover(deps);

      expect(result.success).toBe(true);
    });

    it("fails when script throws", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockRejectedValue(new Error("script failed")),
      });
      const result = await runBrainRecover(deps);

      expect(result.success).toBe(false);
    });
  });

  describe("clearStaleConnections", () => {
    it("succeeds when psql runs successfully", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const result = await clearStaleConnections(deps);

      expect(result.success).toBe(true);
    });

    it("fails when psql throws", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockRejectedValue(new Error("psql not found")),
      });
      const result = await clearStaleConnections(deps);

      expect(result.success).toBe(false);
    });
  });

  // ── executeRecovery ──────────────────────────────────────────────────────

  describe("executeRecovery", () => {
    it("returns success with no-action when action is no-action", async () => {
      const deps = makeMockDeps();
      const decision = {
        component: "disk" as const,
        health: makeWarningResult("disk"),
        action: "no-action" as const,
        shouldAlert: false,
        attemptCount: 1,
      };
      const result = await executeRecovery(decision, deps);

      expect(result.success).toBe(true);
      expect(result.action).toBe("no-action");
      expect(deps.logRecoveryEvent).not.toHaveBeenCalled();
    });

    it("calls sendAlert when action is alert", async () => {
      const deps = makeMockDeps();
      const decision = {
        component: "mcp-container" as const,
        health: makeUnhealthyResult("mcp-container"),
        action: "alert" as const,
        shouldAlert: true,
        attemptCount: MAX_RECOVERY_ATTEMPTS,
      };
      const result = await executeRecovery(decision, deps);

      expect(result.success).toBe(true);
      expect(deps.sendAlert).toHaveBeenCalledWith("mcp-container", "Unhealthy");
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "mcp-container",
        "alert",
        true,
        "Unhealthy",
      );
    });

    it("executes restart-mcp and logs the event", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const decision = {
        component: "mcp-container" as const,
        health: makeUnhealthyResult("mcp-container"),
        action: "restart-mcp" as const,
        shouldAlert: false,
        attemptCount: 1,
      };
      const result = await executeRecovery(decision, deps);

      expect(result.success).toBe(true);
      expect(deps.execCmd).toHaveBeenCalledTimes(1);
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "mcp-container",
        "restart-mcp",
        true,
        undefined,
      );
    });

    it("logs failure when recovery action fails", async () => {
      const deps = makeMockDeps({
        execCmd: vi.fn().mockRejectedValue(new Error("docker error")),
      });
      const decision = {
        component: "mcp-container" as const,
        health: makeUnhealthyResult("mcp-container"),
        action: "restart-mcp" as const,
        shouldAlert: false,
        attemptCount: 1,
      };
      const result = await executeRecovery(decision, deps);

      expect(result.success).toBe(false);
      expect(deps.logRecoveryEvent).toHaveBeenCalledWith(
        "mcp-container",
        "restart-mcp",
        false,
        expect.stringContaining("docker error"),
      );
    });
  });

  // ── Full recovery cycle ───────────────────────────────────────────────────

  describe("runRecoveryCycle", () => {
    it("returns empty recovery log when everything is healthy", async () => {
      const deps = makeMockDeps();
      const { healthReport, recoveryLog } = await runRecoveryCycle(deps);

      expect(healthReport.overall).toBe("healthy");
      expect(recoveryLog).toHaveLength(0);
    });

    it("triggers restart-mcp when MCP container is unhealthy", async () => {
      const deps = makeMockDeps({
        mcpHealthCheck: vi.fn().mockResolvedValue(false),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const { healthReport, recoveryLog } = await runRecoveryCycle(deps);

      expect(healthReport.overall).toBe("unhealthy");
      expect(recoveryLog).toHaveLength(1);
      expect(recoveryLog[0].component).toBe("mcp-container");
      expect(recoveryLog[0].action).toBe("restart-mcp");
      expect(recoveryLog[0].success).toBe(true);
    });

    it("alerts when MCP has already had MAX_RECOVERY_ATTEMPTS", async () => {
      const deps = makeMockDeps({
        mcpHealthCheck: vi.fn().mockResolvedValue(false),
        getRecentAttemptCount: vi.fn().mockResolvedValue(MAX_RECOVERY_ATTEMPTS),
        sendAlert: vi.fn().mockResolvedValue(undefined),
      });
      const { recoveryLog } = await runRecoveryCycle(deps);

      expect(recoveryLog).toHaveLength(1);
      expect(recoveryLog[0].action).toBe("alert");
      expect(deps.sendAlert).toHaveBeenCalledTimes(1);
    });

    it("processes multiple unhealthy components", async () => {
      const deps = makeMockDeps({
        pgIsReady: vi.fn().mockResolvedValue(false),
        mcpHealthCheck: vi.fn().mockResolvedValue(false),
        getRecentAttemptCount: vi.fn().mockResolvedValue(0),
        execCmd: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
      });
      const { healthReport, recoveryLog } = await runRecoveryCycle(deps);

      expect(healthReport.overall).toBe("unhealthy");
      expect(recoveryLog).toHaveLength(2);
      const components = recoveryLog.map((r) => r.component).sort();
      expect(components).toEqual(["mcp-container", "postgres"]);
    });
  });

  // ── createDefaultDeps ────────────────────────────────────────────────────

  describe("createDefaultDeps", () => {
    it("returns all required functions", () => {
      const deps = createDefaultDeps();
      expect(typeof deps.execCmd).toBe("function");
      expect(typeof deps.pgIsReady).toBe("function");
      expect(typeof deps.mcpHealthCheck).toBe("function");
      expect(typeof deps.getDiskUsage).toBe("function");
      expect(typeof deps.getMemoryUsage).toBe("function");
      expect(typeof deps.logRecoveryEvent).toBe("function");
      expect(typeof deps.getRecentAttemptCount).toBe("function");
      expect(typeof deps.sendAlert).toBe("function");
    });

    it("allows overriding individual functions", () => {
      const customExec = vi.fn().mockResolvedValue({ stdout: "custom", stderr: "" });
      const deps = createDefaultDeps({ execCmd: customExec });

      expect(deps.execCmd).toBe(customExec);
    });
  });

  // ── Max attempts boundary ──────────────────────────────────────────────────

  describe("MAX_RECOVERY_ATTEMPTS constant", () => {
    it("is set to 3", () => {
      expect(MAX_RECOVERY_ATTEMPTS).toBe(3);
    });
  });
});