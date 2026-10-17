/**
 * Budget Enforcer - Hard Limit Enforcement
 * Story 3.2: Enforce Kmax and budget limits with immediate halt
 */

import { BudgetMonitor, createBudgetMonitor } from "./monitor";
import type {
  BudgetBreach,
  BudgetCategory,
  BudgetConfig,
  BudgetLimits,
  HaltReason,
  SessionId,
  SessionState,
} from "./types";
import { DEFAULT_BUDGET_CONFIG } from "./types";

/**
 * Execution loop control interface
 * Integration point for agent execution loops
 */
export interface ExecutionLoop {
  /** Check if loop should continue */
  shouldContinue(): boolean;
  /** Signal halt with reason */
  halt(reason: HaltReason): void;
  /** Get current step number */
  getCurrentStep(): number;
}

/**
 * Enforcer callback types
 */
export type HaltCallback = (sessionId: SessionId, reason: HaltReason, state: SessionState) => Promise<void> | void;
export type PreCheckCallback = (sessionId: SessionId, state: SessionState) => Promise<boolean> | boolean;

/**
 * Enforcer configuration
 */
export interface EnforcerConfig {
  /** Budget configuration */
  budgetConfig: BudgetConfig;
  /** Callback when execution is halted */
  onHalt?: HaltCallback;
  /** Callback before each check (return false to skip) */
  onPreCheck?: PreCheckCallback;
  /** Enable/disable enforcement (default: true) */
  enabled: boolean;
  timeAccounting?: "wall-clock" | "recorded-duration";
}

/**
 * Enforcement result
 */
export interface EnforcementResult {
  /** Whether execution can continue */
  allowed: boolean;
  /** Current budget status */
  status: "ok" | "warning" | "breached" | "halted";
  /** Halt reason if applicable */
  haltReason?: HaltReason;
  /** Categories that are at warning level */
  warnings: BudgetBreach[];
  /** Categories that breached limits */
  breaches: BudgetBreach[];
  /** Current session state */
  state?: SessionState;
}

/**
 * Budget Enforcer - Ensures hard limits are enforced
 * This is the ENFORCEMENT layer - halts execution immediately on breach
 */
/**
 * Default TTL for halted sessions (1 hour)
 * After this time, halted sessions auto-expire and can resume.
 */
const DEFAULT_HALT_TTL_MS = 60 * 60 * 1000; // 1 hour

export class BudgetEnforcer {
  private monitor: BudgetMonitor;
  private config: EnforcerConfig;
  /** Halted session keys mapped to their halt timestamp for TTL expiry */
  private haltedSessions: Map<string, Date> = new Map();
  /** TTL in ms after which halted sessions auto-expire (default: 1 hour) */
  private haltTtlMs: number;

  constructor(config?: Partial<EnforcerConfig> & { haltTtlMs?: number }) {
    this.config = {
      budgetConfig: config?.budgetConfig ?? DEFAULT_BUDGET_CONFIG,
      onHalt: config?.onHalt,
      onPreCheck: config?.onPreCheck,
      enabled: config?.enabled ?? true,
      timeAccounting: config?.timeAccounting ?? "wall-clock",
    };
    this.haltTtlMs = config?.haltTtlMs ?? DEFAULT_HALT_TTL_MS;

    this.monitor = createBudgetMonitor({
      budgetConfig: this.config.budgetConfig,
      timeAccounting: this.config.timeAccounting,
      onBreach: (sessionId, category, consumed, limit) => {
        this.handleBreach(sessionId, category, consumed, limit);
      },
      onWarning: (sessionId, category, utilization, threshold) => {
        this.handleWarning(sessionId, category, utilization, threshold);
      },
    });
  }

  /**
   * Start a new session with enforcement
   */
  startSession(sessionId: SessionId, limits?: BudgetLimits): SessionState {
    const key = this.sessionKey(sessionId);
    this.haltedSessions.delete(key);
    return this.monitor.startSession(sessionId, limits);
  }

  /**
   * Reset only a time-only halt. Non-time consumption and history are preserved;
   * any non-time exhaustion or non-time halt refuses the reset.
   * Returns true only when the session was actually released.
   */
  resetHaltedSession(sessionId: SessionId): boolean {
    const key = this.sessionKey(sessionId);
    const state = this.monitor.getSessionState(sessionId);
    if (!this.haltedSessions.has(key) || !state || state.haltReason?.type !== "time_limit") return false;
    const breaches = this.monitor.hasBreachedLimit(sessionId).categories;
    if (breaches.some((category) => category !== "time_ms") || state.currentStep >= state.budgetStatus.limits.maxSteps) return false;
    if (!this.monitor.resetTimeBudget(sessionId)) return false;
    this.haltedSessions.delete(key);
    state.haltedAt = undefined;
    state.haltReason = undefined;
    return true;
  }

  /**
   * Attempt time-only resets; count only sessions actually released.
   */
  resetAllHaltedSessions(): number {
    let count = 0;
    for (const sessionId of this.monitor.getSessionIds()) {
      if (this.resetHaltedSession(sessionId)) count++;
    }
    return count;
  }

  /**
   * Get all currently halted session keys.
   */
  getHaltedSessionKeys(): string[] {
    return Array.from(this.haltedSessions.keys());
  }

  /**
   * Remove halted sessions that have exceeded the TTL.
   * Returns count of expired sessions removed.
   */
  cleanupExpiredHalts(): number {
    const now = Date.now();
    let expired = 0;
    for (const [key, haltedAt] of this.haltedSessions) {
      if (now - haltedAt.getTime() >= this.haltTtlMs) {
        this.haltedSessions.delete(key);
        expired++;
      }
    }
    return expired;
  }

  /**
   * End a session
   */
  endSession(sessionId: SessionId): SessionState | null {
    return this.monitor.endSession(sessionId);
  }

  /**
   * Pre-execution check - MUST be called before each iteration/step
   * Returns enforcement result indicating if execution can proceed
   */
  async checkBeforeExecution(sessionId: SessionId): Promise<EnforcementResult> {
    // Skip if enforcement disabled
    if (!this.config.enabled) {
      const state = this.monitor.getSessionState(sessionId);
      return {
        allowed: true,
        status: "ok",
        warnings: [],
        breaches: [],
        state: state ?? undefined,
      };
    }

    // Check if session is halted
    if (this.isHalted(sessionId)) {
      const state = this.monitor.getSessionState(sessionId);
      return {
        allowed: false,
        status: "halted",
        haltReason: state?.haltReason,
        warnings: [],
        breaches: [],
        state: state ?? undefined,
      };
    }

    // Run pre-check callback if provided
    if (this.config.onPreCheck) {
      const shouldContinue = await Promise.resolve(this.config.onPreCheck(sessionId, this.monitor.getSessionState(sessionId)!));
      if (!shouldContinue) {
        return {
          allowed: false,
          status: "halted",
          warnings: [],
          breaches: [],
        };
      }
    }

    const state = this.monitor.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${this.sessionKey(sessionId)} not found`);
    }

    const { limits, consumption } = state.budgetStatus;
    const warnings: BudgetBreach[] = [];
    const breaches: BudgetBreach[] = [];

    // Check each category
    this.checkCategory("tokens", consumption.tokens, limits.maxTokens, state, warnings, breaches);
    this.checkCategory("tool_calls", consumption.toolCalls, limits.maxToolCalls, state, warnings, breaches);
    this.checkCategory("time_ms", consumption.timeMs, limits.maxTimeMs, state, warnings, breaches);
    this.checkCategory("cost_usd", consumption.costUsd, limits.maxCostUsd, state, warnings, breaches);

    // Check Kmax (steps)
    const totalSteps = Math.max(state.currentStep, consumption.steps);
    if (totalSteps >= limits.maxSteps) {
      breaches.push({
        category: "steps",
        consumed: totalSteps,
        limit: limits.maxSteps,
        utilizationPercent: (totalSteps / limits.maxSteps) * 100,
        timestamp: new Date(),
      });
    }

    // Determine if we should halt
    if (breaches.length > 0 && this.config.budgetConfig.haltOnBreach) {
      const haltReason = this.createHaltReason(breaches[0], state);
      await this.haltSession(sessionId, haltReason);

      return {
        allowed: false,
        status: "halted",
        haltReason,
        warnings,
        breaches,
        state: this.monitor.getSessionState(sessionId) ?? undefined,
      };
    }

    // Return result
    const status: "ok" | "warning" | "breached" = 
      breaches.length > 0 ? "breached" : warnings.length > 0 ? "warning" : "ok";

    return {
      allowed: true,
      status,
      warnings,
      breaches,
      state,
    };
  }

  /**
   * Post-execution step recording
   * MUST be called after each step/iteration completes
   */
  async recordStep(sessionId: SessionId): Promise<EnforcementResult> {
    // Increment step counter
    this.monitor.incrementStep(sessionId);

    // Check limits after increment
    return this.checkBeforeExecution(sessionId);
  }

  /**
   * Check if an iteration is allowed (simplified check for loop control)
   */
  canContinue(sessionId: SessionId): boolean {
    if (!this.config.enabled) return true;
    if (this.isHalted(sessionId)) return false;

    const state = this.monitor.getSessionState(sessionId);
    if (!state) return false;

    const { limits, consumption } = state.budgetStatus;

    // Quick checks - any breached means no
    if (consumption.tokens >= limits.maxTokens) return false;
    if (consumption.toolCalls >= limits.maxToolCalls) return false;
    if (consumption.timeMs >= limits.maxTimeMs) return false;
    if (consumption.costUsd >= limits.maxCostUsd) return false;
    if (consumption.steps >= limits.maxSteps) return false;

    return true;
  }

  /**
   * Halt a session immediately
   */
  async haltSession(sessionId: SessionId, reason: HaltReason): Promise<void> {
    const key = this.sessionKey(sessionId);
    this.haltedSessions.set(key, new Date());

    const state = this.monitor.getSessionState(sessionId);
    if (state) {
      state.haltedAt = new Date();
      state.haltReason = reason;
    }

    // Call halt callback
    if (this.config.onHalt && state) {
      await Promise.resolve(this.config.onHalt(sessionId, reason, state));
    }
  }

  /**
   * Check if session is halted
   */
  isHalted(sessionId: SessionId): boolean {
    // Auto-expiry: if the halt has exceeded TTL, clear it lazily
    const key = this.sessionKey(sessionId);
    const haltedAt = this.haltedSessions.get(key);
    if (haltedAt && Date.now() - haltedAt.getTime() >= this.haltTtlMs) {
      this.haltedSessions.delete(key);
      return false;
    }
    return this.haltedSessions.has(key);
  }

  /**
   * Get halt reason for a session
   */
  getHaltReason(sessionId: SessionId): HaltReason | undefined {
    const state = this.monitor.getSessionState(sessionId);
    return state?.haltReason;
  }

  /**
   * Get current budget status
   */
  getStatus(sessionId: SessionId) {
    return this.monitor.getStatus(sessionId);
  }

  /**
   * Get full session state
   */
  getSessionState(sessionId: SessionId): SessionState | null {
    return this.monitor.getSessionState(sessionId);
  }

  /**
   * Get remaining budget for all categories
   * Returns the remaining capacity before limits are hit
   */
  getRemainingBudget(sessionId: SessionId): {
    tokens: number;
    toolCalls: number;
    timeMs: number;
    costUsd: number;
    steps: number;
  } {
    const state = this.monitor.getSessionState(sessionId);
    if (!state) {
      const limits = this.config.budgetConfig.defaults;
      return {
        tokens: limits.maxTokens,
        toolCalls: limits.maxToolCalls,
        timeMs: limits.maxTimeMs,
        costUsd: limits.maxCostUsd,
        steps: limits.maxSteps,
      };
    }

    const { limits, consumption } = state.budgetStatus;
    return {
      tokens: Math.max(0, limits.maxTokens - consumption.tokens),
      toolCalls: Math.max(0, limits.maxToolCalls - consumption.toolCalls),
      timeMs: Math.max(0, limits.maxTimeMs - consumption.timeMs),
      costUsd: Math.max(0, limits.maxCostUsd - consumption.costUsd),
      steps: Math.max(0, limits.maxSteps - consumption.steps),
    };
  }

  /**
   * Check if there's sufficient budget for a turn
   * Returns true if remaining budget > minimum required
   */
  hasSufficientBudget(
    sessionId: SessionId,
    requirements: {
      minTokens?: number;
      minToolCalls?: number;
      minTimeMs?: number;
      minCostUsd?: number;
      minSteps?: number;
    } = {}
  ): boolean {
    const remaining = this.getRemainingBudget(sessionId);

    if (requirements.minTokens !== undefined && remaining.tokens < requirements.minTokens) {
      return false;
    }
    if (requirements.minToolCalls !== undefined && remaining.toolCalls < requirements.minToolCalls) {
      return false;
    }
    if (requirements.minTimeMs !== undefined && remaining.timeMs < requirements.minTimeMs) {
      return false;
    }
    if (requirements.minCostUsd !== undefined && remaining.costUsd < requirements.minCostUsd) {
      return false;
    }
    if (requirements.minSteps !== undefined && remaining.steps < requirements.minSteps) {
      return false;
    }

    return true;
  }

  /**
   * Update budget consumption for a category
   * Used by middleware to record actual usage
   */
  updateBudget(
    sessionId: SessionId,
    updates: Partial<{
      tokens: number;
      toolCalls: number;
      timeMs: number;
      costUsd: number;
      steps: number;
    }>
  ): void {
    const state = this.monitor.getSessionState(sessionId);
    if (!state) {
      console.warn(`[BudgetEnforcer] Cannot update budget: session ${this.sessionKey(sessionId)} not found`);
      return;
    }

    if (updates.tokens !== undefined) {
      state.budgetStatus.consumption.tokens += updates.tokens;
      state.budgetStatus.utilization.tokens = (state.budgetStatus.consumption.tokens / state.budgetStatus.limits.maxTokens) * 100;
    }
    if (updates.toolCalls !== undefined) {
      state.budgetStatus.consumption.toolCalls += updates.toolCalls;
      state.budgetStatus.utilization.toolCalls = (state.budgetStatus.consumption.toolCalls / state.budgetStatus.limits.maxToolCalls) * 100;
    }
    if (updates.timeMs !== undefined) {
      state.budgetStatus.consumption.timeMs += updates.timeMs;
      state.budgetStatus.utilization.timeMs = (state.budgetStatus.consumption.timeMs / state.budgetStatus.limits.maxTimeMs) * 100;
    }
    if (updates.costUsd !== undefined) {
      state.budgetStatus.consumption.costUsd += updates.costUsd;
      state.budgetStatus.utilization.costUsd = (state.budgetStatus.consumption.costUsd / state.budgetStatus.limits.maxCostUsd) * 100;
    }
    if (updates.steps !== undefined) {
      state.budgetStatus.consumption.steps += updates.steps;
      state.budgetStatus.utilization.steps = (state.budgetStatus.consumption.steps / state.budgetStatus.limits.maxSteps) * 100;
    }

    // Note: Threshold checking happens automatically in monitor when tracking
    // For manual updates, we rely on the next checkBeforeExecution call
  }

  /**
   * Get underlying monitor for direct operations
   */
  getMonitor(): BudgetMonitor {
    return this.monitor;
  }

  /**
   * Create an execution loop wrapper that enforces budget limits
   */
  wrapExecutionLoop(sessionId: SessionId, loop: ExecutionLoop): ExecutionLoop {
    const self = this;

    return {
      shouldContinue: (): boolean => {
        // First check if halted
        if (self.isHalted(sessionId)) {
          return false;
        }

        // Check budget limits
        if (!self.canContinue(sessionId)) {
          return false;
        }

        // Check original loop condition
        return loop.shouldContinue();
      },

      halt(reason: HaltReason): void {
        self.haltSession(sessionId, reason);
        loop.halt(reason);
      },

      getCurrentStep(): number {
        return self.monitor.getSessionState(sessionId)?.currentStep ?? loop.getCurrentStep();
      },
    };
  }

  // Private methods

  private sessionKey(sessionId: SessionId): string {
    return `${sessionId.groupId}:${sessionId.agentId}:${sessionId.sessionId}`;
  }

  private checkCategory(
    category: BudgetBreach["category"],
    consumed: number,
    limit: number,
    state: SessionState,
    warnings: BudgetBreach[],
    breaches: BudgetBreach[],
  ): void {
    const utilizationPercent = (consumed / limit) * 100;
    const warningThresholds = this.config.budgetConfig.warningThresholds;

    const breach: BudgetBreach = {
      category,
      consumed,
      limit,
      utilizationPercent,
      timestamp: new Date(),
    };

    // Check if at warning level (80% or 90%)
    const warning80 = utilizationPercent >= (warningThresholds.warning80 * 100);
    const warning90 = utilizationPercent >= (warningThresholds.warning90 * 100);
    const breached = consumed >= limit;

    // Track warning status in state
    if (category === "tokens") {
      state.budgetStatus.warnings.tokens.warning80 = warning80 || state.budgetStatus.warnings.tokens.warning80;
      state.budgetStatus.warnings.tokens.warning90 = warning90 || state.budgetStatus.warnings.tokens.warning90;
    }

    if (breached) {
      breaches.push(breach);
    } else if (warning90) {
      warnings.push(breach);
    } else if (warning80) {
      warnings.push(breach);
    }
  }

  private createHaltReason(breach: BudgetBreach, state: SessionState): HaltReason {
    switch (breach.category) {
      case "tokens":
        return { type: "token_limit", consumed: breach.consumed, limit: breach.limit };
      case "tool_calls":
        return { type: "tool_call_limit", consumed: breach.consumed, limit: breach.limit };
      case "time_ms":
        return { type: "time_limit", elapsedMs: breach.consumed, limitMs: breach.limit };
      case "cost_usd":
        return { type: "cost_limit", consumedUsd: breach.consumed, limitUsd: breach.limit };
      case "steps":
        return { type: "kmax_exceeded", currentStep: breach.consumed, maxSteps: breach.limit };
      default:
        return { type: "critical_error", error: `Unknown breach: ${breach.category}` };
    }
  }

  /**
   * Normalize category strings to canonical snake_case.
   * BudgetMonitor.checkThresholds passes camelCase (e.g., "timeMs"),
   * but BudgetCategory type is snake_case (e.g., "time_ms").
   * This mapping ensures consistent halt reasons and logging.
   */
  private static normalizeCategory(category: string): BudgetCategory {
    const aliases: Record<string, BudgetCategory> = {
      toolCalls: "tool_calls",
      timeMs: "time_ms",
      costUsd: "cost_usd",
    };
    return aliases[category] ?? (category as BudgetCategory);
  }

  private handleBreach(
    sessionId: SessionId,
    category: string,
    consumed: number,
    limit: number,
  ): void {
    const normalized = BudgetEnforcer.normalizeCategory(category);
    const key = this.sessionKey(sessionId);
    console.warn(`[BudgetEnforcer] Breach detected for ${key}: ${normalized} at ${consumed}/${limit}`);

    // Auto-halt on breach — prevents ghosted sessions from spamming warnings.
    // Must be synchronous: this is called from the monitor's synchronous
    // checkThresholds path. An async halt would create a race where
    // checkBeforeExecution runs before the halt completes.
    if (this.config.budgetConfig.haltOnBreach && !this.isHalted(sessionId)) {
      const state = this.monitor.getSessionState(sessionId);
      if (state) {
        const haltReason = this.createHaltReason(
          {
            category: normalized,
            consumed,
            limit,
            utilizationPercent: 100,
            timestamp: new Date(),
          },
          state,
        );
        // Synchronous halt — no async gaps
        this.haltedSessions.set(key, new Date());
        state.haltedAt = new Date();
        state.haltReason = haltReason;
        // Fire async callback without blocking
        if (this.config.onHalt) {
          Promise.resolve(this.config.onHalt(sessionId, haltReason, state)).catch(() => {});
        }
      }
    }
  }

  private handleWarning(
    sessionId: SessionId,
    category: string,
    utilization: number,
    threshold: number,
  ): void {
    console.info(`[BudgetEnforcer] Warning for ${this.sessionKey(sessionId)}: ${category} at ${utilization.toFixed(1)}% (${threshold}% threshold)`);
  }
}

/**
 * Create a budget enforcer instance
 */
export function createBudgetEnforcer(config?: Partial<EnforcerConfig>): BudgetEnforcer {
  return new BudgetEnforcer(config);
}

/**
 * Kmax enforcement helper
 * Simplified interface for step-based limits
 */
export class KmaxEnforcer {
  private maxSteps: number;
  private currentStep: Map<string, number> = new Map();
  private halted: Set<string> = new Set();

  constructor(maxSteps: number) {
    this.maxSteps = maxSteps;
  }

  start(sessionKey: string): void {
    this.currentStep.set(sessionKey, 0);
    this.halted.delete(sessionKey);
  }

  increment(sessionKey: string): { allowed: boolean; step: number; maxSteps: number } {
    if (this.halted.has(sessionKey)) {
      return { allowed: false, step: this.currentStep.get(sessionKey) ?? 0, maxSteps: this.maxSteps };
    }

    const current = this.currentStep.get(sessionKey) ?? 0;
    const next = current + 1;
    this.currentStep.set(sessionKey, next);

    if (next >= this.maxSteps) {
      this.halted.add(sessionKey);
      return { allowed: false, step: next, maxSteps: this.maxSteps };
    }

    return { allowed: true, step: next, maxSteps: this.maxSteps };
  }

  halt(sessionKey: string): void {
    this.halted.add(sessionKey);
  }

  isHalted(sessionKey: string): boolean {
    return this.halted.has(sessionKey);
  }

  getCurrentStep(sessionKey: string): number {
    return this.currentStep.get(sessionKey) ?? 0;
  }
}

/**
 * Create a Kmax enforcer instance
 */
export function createKmaxEnforcer(maxSteps: number): KmaxEnforcer {
  return new KmaxEnforcer(maxSteps);
}
