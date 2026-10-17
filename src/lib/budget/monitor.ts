/**
 * Real-Time Budget Monitor
 * Story 3.2: Track tokens, tool calls, time, and cost in real-time
 */

import type {
  BudgetConfig,
  BudgetConsumption,
  BudgetLimits,
  BudgetStatus,
  SessionId,
  SessionState,
  TokenUsage,
  ToolCallRecord,
  WarningThresholds,
} from "./types";
import {
  calculateUtilization,
  createEmptyConsumption,
  createSessionState,
  DEFAULT_BUDGET_CONFIG,
  estimateCost,
  isThresholdBreached,
} from "./types";

/**
 * Budget warning callback
 */
export type WarningCallback = (
  sessionId: SessionId,
  category: string,
  utilization: number,
  threshold: number,
) => void;

/**
 * Budget breach callback
 */
export type BreachCallback = (
  sessionId: SessionId,
  category: string,
  consumed: number,
  limit: number,
) => void;

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  /** Budget configuration */
  budgetConfig: BudgetConfig;
  /** Callback for soft warnings (80%, 90%) */
  onWarning?: WarningCallback;
  /** Callback for hard limit breaches */
  onBreach?: BreachCallback;
  /** Enable time-based tracking */
  trackTime: boolean;
  /** Wall-clock by default; MCP accounts only recorded operation durations. */
  timeAccounting?: "wall-clock" | "recorded-duration";
  /** Interval for time updates (ms) */
  timeUpdateIntervalMs: number;
}

/**
 * Active session tracking
 */
interface ActiveSession {
  state: SessionState;
  startTime: number;
  toolCallCounts: Record<string, number>;
  timeBreakdown: Record<string, number>;
  modelCosts: Record<string, number>;
  intervals: ReturnType<typeof setInterval>[];
}

/**
 * Budget Monitor - Real-time resource tracking
 * Tracks tokens, tool calls, execution time, and cost
 */
export class BudgetMonitor {
  private config: MonitorConfig;
  private sessions: Map<string, ActiveSession> = new Map();
  private pricing: Map<string, { input: number; output: number }> = new Map();

  constructor(config?: Partial<MonitorConfig>) {
    const budgetConfig = config?.budgetConfig ?? DEFAULT_BUDGET_CONFIG;

    this.config = {
      budgetConfig,
      onWarning: config?.onWarning,
      onBreach: config?.onBreach,
      trackTime: config?.trackTime ?? true,
      timeAccounting: config?.timeAccounting ?? "wall-clock",
      timeUpdateIntervalMs: config?.timeUpdateIntervalMs ?? 1000,
    };

    // Index pricing by model
    for (const pricing of budgetConfig.pricing) {
      this.pricing.set(pricing.model, {
        input: pricing.inputCostPer1k,
        output: pricing.outputCostPer1k,
      });
    }
  }

  /**
   * Start a new session with budget tracking
   */
  startSession(
    sessionId: SessionId,
    limits?: BudgetLimits,
  ): SessionState {
    const key = this.sessionKey(sessionId);
    if (this.sessions.has(key)) {
      throw new Error(`Session ${key} already exists`);
    }

    const actualLimits = limits ?? this.config.budgetConfig.defaults;
    const state = createSessionState(sessionId, actualLimits);

    const session: ActiveSession = {
      state,
      startTime: Date.now(),
      toolCallCounts: {},
      timeBreakdown: {},
      modelCosts: {},
      intervals: [],
    };

    // Start time tracking if enabled
    if (this.config.trackTime && this.config.timeAccounting === "wall-clock") {
      const interval = setInterval(() => {
        this.updateTime(sessionId);
      }, this.config.timeUpdateIntervalMs);
      session.intervals.push(interval);
    }

    this.sessions.set(key, session);
    return state;
  }

  /**
   * End a session and clean up resources
   */
  endSession(sessionId: SessionId): SessionState | null {
    const key = this.sessionKey(sessionId);
    const session = this.sessions.get(key);
    if (!session) return null;

    // Clean up intervals
    for (const interval of session.intervals) {
      clearInterval(interval);
    }

    // Final time update
    if (this.config.timeAccounting === "wall-clock") {
      session.state.budgetStatus.consumption.timeMs = Date.now() - session.startTime;
    }
    session.state.haltedAt = new Date();

    const finalState = session.state;
    this.sessions.delete(key);
    return finalState;
  }

  /**
   * Track token usage from LLM response
   */
  trackTokens(sessionId: SessionId, usage: TokenUsage): BudgetStatus {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${this.sessionKey(sessionId)} not found`);
    }

    const cost = estimateCost(usage, this.config.budgetConfig.pricing);
    const state = session.state;

    // Update consumption
    state.budgetStatus.consumption.tokens += usage.inputTokens + usage.outputTokens;
    state.budgetStatus.consumption.costUsd += cost;

    // Track costs by model for reporting
    session.modelCosts[usage.model] = (session.modelCosts[usage.model] ?? 0) + cost;

    // Update utilization
    this.updateUtilization(state);

    // Check thresholds
    this.checkThresholds(sessionId, "tokens", state);

    return state.budgetStatus;
  }

  /**
   * Track a tool call
   */
  trackToolCall(
    sessionId: SessionId,
    record: ToolCallRecord,
  ): BudgetStatus {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${this.sessionKey(sessionId)} not found`);
    }

    const state = session.state;

    // Update consumption
    state.budgetStatus.consumption.toolCalls += 1;
    state.toolCallHistory.push(record);

    // Track by tool name for reporting
    session.toolCallCounts[record.toolName] = (session.toolCallCounts[record.toolName] ?? 0) + 1;

    // Update time breakdown
    const phase = `tool_${record.toolName}`;
    session.timeBreakdown[phase] = (session.timeBreakdown[phase] ?? 0) + record.durationMs;

    // Update utilization
    this.updateUtilization(state);

    // Check thresholds
    this.checkThresholds(sessionId, "toolCalls", state);

    return state.budgetStatus;
  }

  /**
   * Increment step counter (Kmax tracking)
   */
  incrementStep(sessionId: SessionId): BudgetStatus {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${this.sessionKey(sessionId)} not found`);
    }

    const state = session.state;
    state.currentStep++;
    state.budgetStatus.consumption.steps = state.currentStep;

    // Update utilization
    this.updateUtilization(state);

    // Check thresholds
    this.checkThresholds(sessionId, "steps", state);

    return state.budgetStatus;
  }

  /**
   * Get current budget status for a session
   */
  getStatus(sessionId: SessionId): BudgetStatus | null {
    const session = this.getSession(sessionId);
    return session?.state.budgetStatus ?? null;
  }

  /**
   * Get full session state
   */
  getSessionState(sessionId: SessionId): SessionState | null {
    return this.getSession(sessionId)?.state ?? null;
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: SessionId): boolean {
    return this.sessions.has(this.sessionKey(sessionId));
  }

  getSessionIds(): SessionId[] {
    return Array.from(this.sessions.values(), ({ state }) => ({ ...state.id }));
  }

  /** Reset time accounting only. Histories and all non-time counters survive. */
  resetTimeBudget(sessionId: SessionId): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;
    session.startTime = Date.now();
    session.state.budgetStatus.consumption.timeMs = 0;
    session.state.budgetStatus.utilization.timeMs = 0;
    session.state.budgetStatus.warnings.timeMs = { warning80: false, warning90: false };
    return true;
  }

  /**
   * Get current budget consumption
   */
  getConsumption(sessionId: SessionId): BudgetConsumption | null {
    return this.getSession(sessionId)?.state.budgetStatus.consumption ?? null;
  }

  /**
   * Add reasoning step to history
   */
  addReasoningStep(
    sessionId: SessionId,
    thought: string,
    decision?: string,
  ): void {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.state.reasoningHistory.push({
      step: session.state.currentStep,
      thought,
      decision,
      timestamp: new Date(),
    });

    // Keep only last 100 reasoning steps
    if (session.state.reasoningHistory.length > 100) {
      session.state.reasoningHistory = session.state.reasoningHistory.slice(-100);
    }
  }

  /**
   * Record an error in the session
   */
  recordError(
    sessionId: SessionId,
    error: Error,
    recoverable: boolean,
  ): void {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.state.lastError = {
      step: session.state.currentStep,
      message: error.message,
      stack: error.stack,
      timestamp: new Date(),
      recoverable,
    };
  }

  /**
   * Check all limits and return true if any breached
   */
  hasBreachedLimit(sessionId: SessionId): { breached: boolean; categories: string[] } {
    const status = this.getStatus(sessionId);
    if (!status) {
      return { breached: false, categories: [] };
    }

    const breaches: string[] = [];

    if (status.consumption.tokens >= status.limits.maxTokens) {
      breaches.push("tokens");
    }
    if (status.consumption.toolCalls >= status.limits.maxToolCalls) {
      breaches.push("tool_calls");
    }
    if (status.consumption.timeMs >= status.limits.maxTimeMs) {
      breaches.push("time_ms");
    }
    if (status.consumption.costUsd >= status.limits.maxCostUsd) {
      breaches.push("cost_usd");
    }
    if (status.consumption.steps >= status.limits.maxSteps) {
      breaches.push("steps");
    }

    return {
      breached: breaches.length > 0,
      categories: breaches,
    };
  }

  /**
   * Get tool call breakdown for reporting
   */
  getToolCallBreakdown(sessionId: SessionId): Record<string, number> {
    const session = this.getSession(sessionId);
    return session?.toolCallCounts ?? {};
  }

  /**
   * Get time breakdown for reporting
   */
  getTimeBreakdown(sessionId: SessionId): Record<string, number> {
    const session = this.getSession(sessionId);
    return session?.timeBreakdown ?? {};
  }

  // Private methods

  private sessionKey(sessionId: SessionId): string {
    return `${sessionId.groupId}:${sessionId.agentId}:${sessionId.sessionId}`;
  }

  private getSession(sessionId: SessionId): ActiveSession | undefined {
    return this.sessions.get(this.sessionKey(sessionId));
  }

  private updateTime(sessionId: SessionId): void {
    if (this.config.timeAccounting !== "wall-clock") return;
    const session = this.getSession(sessionId);
    if (!session) return;

    session.state.budgetStatus.consumption.timeMs = Date.now() - session.startTime;
    this.updateUtilization(session.state);
    this.checkThresholds(sessionId, "timeMs", session.state);
  }

  private updateUtilization(state: SessionState): void {
    const { limits, consumption } = state.budgetStatus;
    state.budgetStatus.utilization = {
      tokens: calculateUtilization(consumption.tokens, limits.maxTokens),
      toolCalls: calculateUtilization(consumption.toolCalls, limits.maxToolCalls),
      timeMs: calculateUtilization(consumption.timeMs, limits.maxTimeMs),
      costUsd: calculateUtilization(consumption.costUsd, limits.maxCostUsd),
      steps: calculateUtilization(consumption.steps, limits.maxSteps),
    };
  }

  private checkThresholds(
    sessionId: SessionId,
    category: string,
    state: SessionState,
  ): void {
    if (!this.config.budgetConfig.enableWarnings) return;

    const { limits, consumption } = state.budgetStatus;
    const { warningThresholds } = this.config.budgetConfig;

    let consumed: number;
    let limit: number;

    switch (category) {
      case "tokens":
        consumed = consumption.tokens;
        limit = limits.maxTokens;
        break;
      case "toolCalls":
        consumed = consumption.toolCalls;
        limit = limits.maxToolCalls;
        break;
      case "timeMs":
        consumed = consumption.timeMs;
        limit = limits.maxTimeMs;
        break;
      case "costUsd":
        consumed = consumption.costUsd;
        limit = limits.maxCostUsd;
        break;
      case "steps":
        consumed = consumption.steps;
        limit = limits.maxSteps;
        break;
      default:
        return;
    }

    const utilizationPercent = (consumed / limit) * 100;

    // Check 80% threshold
    if (!state.budgetStatus.warnings[category as keyof typeof state.budgetStatus.warnings].warning80) {
      if (isThresholdBreached(consumed, limit, warningThresholds.warning80)) {
        state.budgetStatus.warnings[category as keyof typeof state.budgetStatus.warnings].warning80 = true;
        this.config.onWarning?.(sessionId, category, utilizationPercent, 80);
      }
    }

    // Check 90% threshold
    if (!state.budgetStatus.warnings[category as keyof typeof state.budgetStatus.warnings].warning90) {
      if (isThresholdBreached(consumed, limit, warningThresholds.warning90)) {
        state.budgetStatus.warnings[category as keyof typeof state.budgetStatus.warnings].warning90 = true;
        this.config.onWarning?.(sessionId, category, utilizationPercent, 90);
      }
    }

    // Check hard limit (100%)
    if (consumed >= limit) {
      this.config.onBreach?.(sessionId, category, consumed, limit);
    }
  }
}

/**
 * Create a budget monitor instance
 */
export function createBudgetMonitor(config?: Partial<MonitorConfig>): BudgetMonitor {
  return new BudgetMonitor(config);
}
