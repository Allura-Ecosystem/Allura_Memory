/**
 * Budget Enforcer Tests
 * Story 3.2: Test hard limit enforcement
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetEnforcer, createBudgetEnforcer, createKmaxEnforcer, KmaxEnforcer } from "./enforcer";
import type { BudgetLimits, HaltReason, SessionId } from "./types";
import { DEFAULT_BUDGET_CONFIG } from "./types";

describe("BudgetEnforcer", () => {
  let enforcer: BudgetEnforcer;
  const sessionId: SessionId = {
    groupId: "test-group",
    agentId: "test-agent",
    sessionId: "session-1",
  };

  beforeEach(() => {
    enforcer = createBudgetEnforcer({
      budgetConfig: DEFAULT_BUDGET_CONFIG,
    });
  });

  describe("session management", () => {
    it("should start a new session", () => {
      const state = enforcer.startSession(sessionId);
      expect(state.id).toBe(sessionId);
      expect(state.currentStep).toBe(0);
    });

    it("should end a session", () => {
      enforcer.startSession(sessionId);
      const finalState = enforcer.endSession(sessionId);
      expect(finalState).not.toBeNull();
      expect(finalState?.haltedAt).toBeInstanceOf(Date);
    });
  });

  describe("pre-execution check", () => {
    beforeEach(() => {
      enforcer.startSession(sessionId);
    });

    it("should allow execution within limits", async () => {
      const result = await enforcer.checkBeforeExecution(sessionId);
      expect(result.allowed).toBe(true);
      expect(result.status).toBe("ok");
    });

    it("should detect warnings at 80%", async () => {
      // Use 80% of tokens (500000 * 0.8 = 400000)
      const monitor = enforcer.getMonitor();
      monitor.trackTokens(sessionId, {
        inputTokens: 400000,
        outputTokens: 0,
        model: "gpt-4o",
      });

      const result = await enforcer.checkBeforeExecution(sessionId);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.status).toBe("warning");
    });

    it("should halt on breach when configured", async () => {
      const haltedReasons: HaltReason[] = [];
      const haltEnforcer = createBudgetEnforcer({
        budgetConfig: {
          ...DEFAULT_BUDGET_CONFIG,
          haltOnBreach: true,
        },
        onHalt: async (_sid, reason) => {
          haltedReasons.push(reason);
        },
      });

      haltEnforcer.startSession(sessionId);
      const monitor = haltEnforcer.getMonitor();

      // Exceed token limit (500000) — monitor auto-halts via onBreach callback
      monitor.trackTokens(sessionId, {
        inputTokens: 500000,
        outputTokens: 0,
        model: "gpt-4o",
      });

      // Halt is synchronous from monitor; checkBeforeExecution confirms it
      const result = await haltEnforcer.checkBeforeExecution(sessionId);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe("halted");
      expect(haltedReasons.length).toBe(1);
      expect(haltedReasons[0].type).toBe("token_limit");
    });
  });

  describe("Kmax (step limit) enforcement", () => {
    beforeEach(() => {
      enforcer.startSession(sessionId);
    });

    it("should allow steps within limit", async () => {
      const result = await enforcer.recordStep(sessionId);
      expect(result.allowed).toBe(true);
      expect(result.status).toBe("ok");
    });

    it("should halt when Kmax reached", async () => {
      // Use custom enforcer with small maxSteps for efficient testing
      const smallEnforcer = createBudgetEnforcer({
        budgetConfig: {
          ...DEFAULT_BUDGET_CONFIG,
          defaults: { ...DEFAULT_BUDGET_CONFIG.defaults, maxSteps: 50 },
        },
      });
      const kmaxSession: SessionId = { groupId: "test-group", agentId: "test-agent", sessionId: "session-kmax" };
      smallEnforcer.startSession(kmaxSession);

      // After 49 steps, we're still within limit
      for (let i = 0; i < 49; i++) {
        const result = await smallEnforcer.recordStep(kmaxSession);
        expect(result.allowed).toBe(true);
      }

      // The 50th step should breach (50 >= 50)
      const result = await smallEnforcer.recordStep(kmaxSession);
      expect(result.allowed).toBe(false);
      expect(result.haltReason?.type).toBe("kmax_exceeded");
    });

    it("should track current step", async () => {
      await enforcer.recordStep(sessionId);
      await enforcer.recordStep(sessionId);

      const state = enforcer.getSessionState(sessionId);
      expect(state?.currentStep).toBe(2);
    });
  });

  describe("canContinue check", () => {
    beforeEach(() => {
      enforcer.startSession(sessionId);
    });

    it("should return true within limits", () => {
      expect(enforcer.canContinue(sessionId)).toBe(true);
    });

    it("should return false when halted", async () => {
      await enforcer.haltSession(sessionId, { type: "critical_error", error: "test" });
      expect(enforcer.canContinue(sessionId)).toBe(false);
    });

    it("should return false when tokens limit reached", () => {
      const monitor = enforcer.getMonitor();
      // Exceed token limit (500000)
      monitor.trackTokens(sessionId, {
        inputTokens: 500000,
        outputTokens: 0,
        model: "gpt-4o",
      });
      expect(enforcer.canContinue(sessionId)).toBe(false);
    });

    it("should return false when steps limit reached", () => {
      // Use custom enforcer with small maxSteps for efficient testing
      const smallEnforcer = createBudgetEnforcer({
        budgetConfig: {
          ...DEFAULT_BUDGET_CONFIG,
          defaults: { ...DEFAULT_BUDGET_CONFIG.defaults, maxSteps: 50 },
        },
      });
      const stepsSession: SessionId = { groupId: "test-group", agentId: "test-agent", sessionId: "session-steps" };
      smallEnforcer.startSession(stepsSession);
      for (let i = 0; i < 50; i++) {
        smallEnforcer.getMonitor().incrementStep(stepsSession);
      }
      expect(smallEnforcer.canContinue(stepsSession)).toBe(false);
    });
  });

  describe("haltSession", () => {
    it("should halt session with reason", async () => {
      enforcer.startSession(sessionId);
      const reason: HaltReason = {
        type: "kmax_exceeded",
        currentStep: 50,
        maxSteps: 50,
      };

      await enforcer.haltSession(sessionId, reason);

      expect(enforcer.isHalted(sessionId)).toBe(true);
      const state = enforcer.getSessionState(sessionId);
      expect(state?.haltReason).toEqual(reason);
      expect(state?.haltedAt).toBeInstanceOf(Date);
    });

    it("should call halt callback", async () => {
      const onHalt = vi.fn();
      const haltEnforcer = createBudgetEnforcer({
        budgetConfig: DEFAULT_BUDGET_CONFIG,
        onHalt,
      });

      haltEnforcer.startSession(sessionId);
      await haltEnforcer.haltSession(sessionId, { type: "critical_error", error: "test" });

      expect(onHalt).toHaveBeenCalled();
    });
  });

  describe("execution loop wrapper", () => {
    it("keeps detached wrapper calls bound to the enforcer and forwards halt with the loop receiver", () => {
      enforcer.startSession(sessionId);
      const loop = {
        running: true,
        receivedReason: undefined as HaltReason | undefined,
        shouldContinue() { return this.running; },
        halt(reason: HaltReason) { this.receivedReason = reason; this.running = false; },
        getCurrentStep() { return 7; },
      };
      const { shouldContinue, halt } = enforcer.wrapExecutionLoop(sessionId, loop);
      expect(shouldContinue()).toBe(true);
      const reason: HaltReason = { type: "critical_error", error: "stop requested" };

      expect(halt(reason)).toBeUndefined();

      expect(loop.receivedReason).toBe(reason);
      expect(loop.running).toBe(false);
      expect(enforcer.isHalted(sessionId)).toBe(true);
      expect(enforcer.getSessionState(sessionId)?.haltReason).toBe(reason);
      expect(shouldContinue()).toBe(false);
    });

    it("reads the monitored step, including zero, without calling the fallback", () => {
      enforcer.startSession(sessionId);
      const loop = { shouldContinue: vi.fn(), halt: vi.fn(), getCurrentStep: vi.fn(() => 99) };
      const { getCurrentStep } = enforcer.wrapExecutionLoop(sessionId, loop);

      expect(getCurrentStep()).toBe(0);
      enforcer.getMonitor().incrementStep(sessionId);
      expect(getCurrentStep()).toBe(1);
      expect(loop.getCurrentStep).not.toHaveBeenCalled();
    });

    it("uses the original loop receiver for the step fallback when no session exists", () => {
      const loop = {
        step: 7,
        shouldContinue: vi.fn(),
        halt: vi.fn(),
        getCurrentStep() { return this.step; },
      };
      const { getCurrentStep } = enforcer.wrapExecutionLoop(sessionId, loop);
      expect(getCurrentStep()).toBe(7);
      loop.step = 8;
      expect(getCurrentStep()).toBe(8);
    });

    it("should wrap execution loop with budget checks", async () => {
      enforcer.startSession(sessionId);

      const mockLoop = {
        shouldContinue: vi.fn().mockReturnValue(true),
        halt: vi.fn(),
        getCurrentStep: vi.fn().mockReturnValue(0),
      };

      const wrapped = enforcer.wrapExecutionLoop(sessionId, mockLoop);

      // Within limits, should delegate to original
      expect(wrapped.shouldContinue()).toBe(true);
      expect(mockLoop.shouldContinue).toHaveBeenCalled();
    });

    it("should override loop when halted", async () => {
      enforcer.startSession(sessionId);

      const mockLoop = {
        shouldContinue: vi.fn().mockReturnValue(true),
        halt: vi.fn(),
        getCurrentStep: vi.fn().mockReturnValue(0),
      };

      const wrapped = enforcer.wrapExecutionLoop(sessionId, mockLoop);
      await enforcer.haltSession(sessionId, { type: "critical_error", error: "test" });

      expect(wrapped.shouldContinue()).toBe(false);
      // Original loop's shouldContinue NOT called because already halted
      expect(mockLoop.shouldContinue).not.toHaveBeenCalled();
    });
  });

  describe("warning and breach tracking", () => {
    it("should track warnings", async () => {
      enforcer.startSession(sessionId);
      const monitor = enforcer.getMonitor();

      // Use 85% of tokens (500000 * 0.85 = 425000)
      monitor.trackTokens(sessionId, {
        inputTokens: 425000,
        outputTokens: 0,
        model: "gpt-4o",
      });

      const result = await enforcer.checkBeforeExecution(sessionId);
      expect(result.warnings.some((w) => w.category === "tokens" || w.category === "cost_usd")).toBe(true);
    });

    it("should track breaches after warning", async () => {
      enforcer.startSession(sessionId);
      const monitor = enforcer.getMonitor();

      // Use 95% of tokens (500000 * 0.95 = 475000)
      monitor.trackTokens(sessionId, {
        inputTokens: 475000,
        outputTokens: 0,
        model: "gpt-4o",
      });

      // Then exceed — monitor auto-halts via onBreach callback
      monitor.trackTokens(sessionId, {
        inputTokens: 50000,
        outputTokens: 0,
        model: "gpt-4o",
      });

      // Session is halted synchronously by the monitor; checkBeforeExecution confirms
      const result = await enforcer.checkBeforeExecution(sessionId);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe("halted");
      expect(result.haltReason?.type).toBe("token_limit");
    });
  });

  describe("disabled enforcement", () => {
    it("should allow all when disabled", async () => {
      const disabledEnforcer = createBudgetEnforcer({
        budgetConfig: DEFAULT_BUDGET_CONFIG,
        enabled: false,
      });

      disabledEnforcer.startSession(sessionId);

      // Exceed all limits
      const monitor = disabledEnforcer.getMonitor();
      monitor.trackTokens(sessionId, {
        inputTokens: 1000000,
        outputTokens: 100000,
        model: "gpt-4o",
      });

      for (let i = 0; i < 100; i++) {
        monitor.incrementStep(sessionId);
      }

      const result = await disabledEnforcer.checkBeforeExecution(sessionId);
      expect(result.allowed).toBe(true);
      expect(result.status).toBe("ok");
    });
  });
});

describe("KmaxEnforcer", () => {
  it("should allow steps within limit", () => {
    const kmax = createKmaxEnforcer(10);
    kmax.start("session-1");

    for (let i = 0; i < 9; i++) {
      const result = kmax.increment("session-1");
      expect(result.allowed).toBe(true);
    }
  });

  it("should halt at Kmax", () => {
    const kmax = createKmaxEnforcer(10);
    kmax.start("session-1");

    // Increment to limit
    for (let i = 0; i < 10; i++) {
      kmax.increment("session-1");
    }

    // Next should not be allowed
    const result = kmax.increment("session-1");
    expect(result.allowed).toBe(false);
    expect(result.step).toBe(10);
    expect(result.maxSteps).toBe(10);
  });

  it("should track multiple sessions independently", () => {
    const kmax = createKmaxEnforcer(5);

    kmax.start("session-1");
    kmax.start("session-2");

    for (let i = 0; i < 5; i++) {
      kmax.increment("session-1");
    }

    expect(kmax.isHalted("session-1")).toBe(true);
    expect(kmax.isHalted("session-2")).toBe(false);

    const result = kmax.increment("session-2");
    expect(result.allowed).toBe(true);
  });

  it("should halt manually", () => {
    const kmax = createKmaxEnforcer(10);
    kmax.start("session-1");

    kmax.increment("session-1");
    kmax.halt("session-1");

    expect(kmax.isHalted("session-1")).toBe(true);
  });

  it("should return current step", () => {
    const kmax = createKmaxEnforcer(10);
    kmax.start("session-1");

    kmax.increment("session-1");
    kmax.increment("session-1");
    kmax.increment("session-1");

    expect(kmax.getCurrentStep("session-1")).toBe(3);
  });
});
