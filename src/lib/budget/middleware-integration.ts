/**
 * Budget Middleware Integration Layer
 * Story: Wire Token Budget Pre-Turn Checks into MCP middleware
 * 
 * Provides integration between BudgetEnforcer and MCP TraceMiddleware,
 * enabling pre-turn budget checks before every MCP tool call.
 * 
 * Key Features:
 * - Pre-turn budget validation before MCP calls
 * - Hard stop execution if remaining budget < MIN_TURN_TOKENS
 * - Budget counter updates after each tool call
 * - Graceful user notification when budget exceeded
 * - Configurable MIN_TURN_TOKENS constant
 */

import type { BudgetEnforcer } from "./enforcer";
import type { HaltReason, SessionId } from "./types";

/**
 * Minimum tokens required for a single turn
 * If remaining budget falls below this, execution halts
 * Default: 1000 tokens (covers ~500 tokens input + 500 tokens response)
 */
export const MIN_TURN_TOKENS = 1000;

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  /** Whether execution can proceed */
  allowed: boolean;
  /** Remaining tokens before limit */
  remainingTokens: number;
  /** Whether budget was exceeded */
  exceeded: boolean;
  /** Human-readable reason if blocked */
  reason?: string;
  /** Halt reason for logging */
  haltReason?: HaltReason;
}

/**
 * Tool call metadata for budget tracking
 */
export interface ToolCallMetadata {
  /** Tool name being called */
  toolName: string;
  /** Estimated tokens for this call (input + output) */
  estimatedTokens?: number;
  /** Call duration in ms */
  durationMs: number;
  /** Whether call succeeded */
  success: boolean;
}

/**
 * Budget exceeded handler result
 */
export interface BudgetExceededHandlerResult {
  /** Whether user was notified */
  userNotified: boolean;
  /** Message sent to user */
  notificationMessage?: string;
  /** Whether session was halted */
  sessionHalted: boolean;
}

/**
 * Check budget before MCP tool execution
 * Returns result indicating whether execution should proceed
 */
export function checkBudgetBeforeCall(
  enforcer: BudgetEnforcer,
  sessionId: SessionId,
  estimatedTokenCost: number = MIN_TURN_TOKENS
): BudgetCheckResult {
  // Check if session exists
  const state = enforcer.getSessionState(sessionId);
  if (!state) {
    return {
      allowed: false,
      remainingTokens: 0,
      exceeded: true,
      reason: `Session ${sessionId.sessionId} not found. Cannot proceed without budget tracking.`,
      haltReason: {
        type: "critical_error",
        error: `Session not found: ${sessionId.sessionId}`,
      },
    };
  }

  // Check if already halted
  if (enforcer.isHalted(sessionId)) {
    const haltReason = enforcer.getHaltReason(sessionId);
    return {
      allowed: false,
      remainingTokens: 0,
      exceeded: true,
      reason: `Session already halted: ${haltReason ? JSON.stringify(haltReason) : "unknown reason"}`,
      haltReason,
    };
  }

  // Get remaining budget
  const remaining = enforcer.getRemainingBudget(sessionId);

  // A halt TTL expires only the latch, never consumed capacity. Recheck every
  // dimension synchronously before admitting a tool, including manual updates.
  const { consumption, limits } = state.budgetStatus;
  let exhausted: HaltReason | undefined;
  if (consumption.tokens >= limits.maxTokens) exhausted = { type: "token_limit", consumed: consumption.tokens, limit: limits.maxTokens };
  else if (consumption.toolCalls >= limits.maxToolCalls) exhausted = { type: "tool_call_limit", consumed: consumption.toolCalls, limit: limits.maxToolCalls };
  else if (consumption.timeMs >= limits.maxTimeMs) exhausted = { type: "time_limit", elapsedMs: consumption.timeMs, limitMs: limits.maxTimeMs };
  else if (consumption.costUsd >= limits.maxCostUsd) exhausted = { type: "cost_limit", consumedUsd: consumption.costUsd, limitUsd: limits.maxCostUsd };
  else if (Math.max(consumption.steps, state.currentStep) >= limits.maxSteps) exhausted = { type: "kmax_exceeded", currentStep: Math.max(consumption.steps, state.currentStep), maxSteps: limits.maxSteps };
  if (exhausted) {
    // haltSession sets its latch before invoking any asynchronous callback.
    void enforcer.haltSession(sessionId, exhausted);
    return { allowed: false, remainingTokens: remaining.tokens, exceeded: true,
      reason: `Budget exhausted: ${exhausted.type}. Consumed capacity is not renewed by waiting.`, haltReason: exhausted };
  }

  // Hard stop if remaining < MIN_TURN_TOKENS
  if (remaining.tokens < MIN_TURN_TOKENS) {
    const haltReason: HaltReason = {
      type: "token_limit",
      consumed: state.budgetStatus.consumption.tokens,
      limit: state.budgetStatus.limits.maxTokens,
    };

    // Halt the session
    enforcer.haltSession(sessionId, haltReason);

    return {
      allowed: false,
      remainingTokens: remaining.tokens,
      exceeded: true,
      reason: `Budget exceeded: ${remaining.tokens} tokens remaining, but ${MIN_TURN_TOKENS} required for next turn. Session halted.`,
      haltReason,
    };
  }

  // Check if estimated cost would exceed budget
  if (estimatedTokenCost > remaining.tokens) {
    const haltReason: HaltReason = {
      type: "token_limit",
      consumed: state.budgetStatus.consumption.tokens,
      limit: state.budgetStatus.limits.maxTokens,
    };

    enforcer.haltSession(sessionId, haltReason);

    return {
      allowed: false,
      remainingTokens: remaining.tokens,
      exceeded: true,
      reason: `Insufficient budget for operation: ${remaining.tokens} remaining, but ${estimatedTokenCost} estimated cost. Session halted.`,
      haltReason,
    };
  }

  return {
    allowed: true,
    remainingTokens: remaining.tokens,
    exceeded: false,
  };
}

/**
 * Update budget counters after MCP tool execution
 * Records actual usage from tool call
 */
export function updateBudgetAfterCall(
  enforcer: BudgetEnforcer,
  sessionId: SessionId,
  metadata: ToolCallMetadata
): void {
  // Update tool calls count
  enforcer.updateBudget(sessionId, {
    toolCalls: 1,
    timeMs: metadata.durationMs,
  });

  // Track tokens if provided
  if (metadata.estimatedTokens) {
    enforcer.updateBudget(sessionId, {
      tokens: metadata.estimatedTokens,
    });
  }

  // Note: This doesn't check if budget is now exceeded
  // The next checkBudgetBeforeCall will catch that
}

/**
 * Budget exceeded handler
 * Notifies user gracefully when budget limit is reached
 */
export function handleBudgetExceeded(
  sessionId: SessionId,
  haltReason: HaltReason,
  options?: {
    /** Custom notification message */
    customMessage?: string;
    /** Include budget details in notification */
    includeDetails?: boolean;
    /** Callback for custom notification handling */
    onNotify?: (message: string) => void | Promise<void>;
  }
): BudgetExceededHandlerResult {
  // Build notification message
  let message = options?.customMessage;

  if (!message) {
    switch (haltReason.type) {
      case "token_limit":
        message = `Token budget exceeded: ${haltReason.consumed}/${haltReason.limit} tokens used. Session halted to prevent overspending.`;
        break;
      case "tool_call_limit":
        message = `Tool call limit reached: ${haltReason.consumed}/${haltReason.limit} calls made. Session halted.`;
        break;
      case "time_limit":
        message = `Time limit exceeded: ${haltReason.elapsedMs}ms elapsed (limit: ${haltReason.limitMs}ms). Session halted.`;
        break;
      case "cost_limit":
        message = `Cost budget exceeded: $${haltReason.consumedUsd.toFixed(2)} used (limit: $${haltReason.limitUsd.toFixed(2)}). Session halted.`;
        break;
      case "kmax_exceeded":
        message = `Maximum steps reached: ${haltReason.currentStep}/${haltReason.maxSteps}. Session halted to prevent infinite loops.`;
        break;
      default:
        message = `Budget constraint breached. Session halted: ${haltReason.type}`;
    }
  }

  if (options?.includeDetails !== false) {
    message += `\n\nSession: ${sessionId.sessionId}\nAgent: ${sessionId.agentId}\nGroup: ${sessionId.groupId}`;
  }

  // Log the notification
  console.error(`[BudgetExceeded] ${message}`);

  // Call custom notification handler if provided
  if (options?.onNotify) {
    try {
      const result = options.onNotify(message);
      if (result instanceof Promise) {
        // Fire-and-forget async notification
        result.catch((err) => {
          console.error("[BudgetExceeded] Notification failed:", err);
        });
      }
    } catch (err) {
      console.error("[BudgetExceeded] Notification failed:", err);
    }
  }

  return {
    userNotified: true,
    notificationMessage: message,
    sessionHalted: true,
  };
}

/**
 * Create a budget-aware MCP tool wrapper
 * 
 * Usage:
 * ```typescript
 * const wrappedTool = wrapMcpToolWithBudget(
 *   budgetEnforcer,
 *   sessionId,
 *   'notion-create-pages',
 *   originalToolFunction
 * );
 * 
 * // Now wrappedTool does pre-turn budget check automatically
 * const result = await wrappedTool(args);
 * ```
 */
export function wrapMcpToolWithBudget<
  TArgs extends Record<string, unknown>,
  TResult,
>(
  enforcer: BudgetEnforcer,
  sessionId: SessionId,
  toolName: string,
  toolFn: (args: TArgs) => Promise<TResult>,
  options?: {
    /** Estimated token cost for this tool */
    estimatedTokens?: number;
    /** Custom budget exceeded handler */
    onBudgetExceeded?: (result: BudgetCheckResult) => void | Promise<void>;
    /** Whether to update budget after call */
    trackBudget?: boolean;
  }
): (args: TArgs) => Promise<TResult> {
  return async (args: TArgs): Promise<TResult> => {
    // Pre-turn budget check
    const budgetCheck = checkBudgetBeforeCall(
      enforcer,
      sessionId,
      options?.estimatedTokens ?? MIN_TURN_TOKENS
    );

    if (!budgetCheck.allowed) {
      // Call custom handler if provided
      if (options?.onBudgetExceeded) {
        await Promise.resolve(options.onBudgetExceeded(budgetCheck));
      }

      // Throw error with budget message
      throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
    }

    // Execute the tool call
    const startTime = performance.now();
    let success = false;

    try {
      const result = await toolFn(args);
      success = true;
      return result;
    } finally {
      // Update budget after call
      if (options?.trackBudget !== false) {
        const durationMs = performance.now() - startTime;
        updateBudgetAfterCall(enforcer, sessionId, {
          toolName,
          durationMs,
          success,
          estimatedTokens: options?.estimatedTokens,
        });
      }
    }
  };
}

/**
 * Budget integration configuration
 */
export interface BudgetIntegrationConfig {
  /** Budget enforcer instance */
  enforcer: BudgetEnforcer;
  /** Session ID for tracking */
  sessionId: SessionId;
  /** Minimum tokens per turn (overrides default) */
  minTurnTokens?: number;
  /** Whether to enable budget checking */
  enabled?: boolean;
  /** Whether to update budget after calls */
  trackAfterCalls?: boolean;
  /** Custom budget exceeded handler */
  onBudgetExceeded?: (result: BudgetCheckResult) => void | Promise<void>;
}

/**
 * Create budget integration for TraceMiddleware
 * 
 * Returns methods that can be injected into middleware lifecycle
 */
export function createBudgetIntegration(config: BudgetIntegrationConfig): {
  /**
   * Check budget before tool execution
   * Call this before every MCP tool call
   */
  checkBeforeExecution: () => BudgetCheckResult;
  /**
   * Update budget after tool execution
   * Call this after every MCP tool call
   */
  updateAfterExecution: (metadata: ToolCallMetadata) => void;
  /**
   * Handle budget exceeded gracefully
   * Call this when checkBeforeExecution returns allowed: false
   */
  handleExceeded: (haltReason: HaltReason) => BudgetExceededHandlerResult;
  /**
   * Get current budget status
   */
  getStatus: () => ReturnType<BudgetEnforcer["getStatus"]>;
  /**
   * Whether budget checking is enabled
   */
  isEnabled: boolean;
} {
  const minTurnTokens = config.minTurnTokens ?? MIN_TURN_TOKENS;

  return {
    checkBeforeExecution: () => {
      if (config.enabled === false) {
        return {
          allowed: true,
          remainingTokens: Number.MAX_SAFE_INTEGER,
          exceeded: false,
        };
      }
      return checkBudgetBeforeCall(config.enforcer, config.sessionId, minTurnTokens);
    },

    updateAfterExecution: (metadata: ToolCallMetadata) => {
      if (config.trackAfterCalls !== false && config.enabled !== false) {
        updateBudgetAfterCall(config.enforcer, config.sessionId, metadata);
      }
    },

    handleExceeded: (haltReason: HaltReason) => {
      return handleBudgetExceeded(config.sessionId, haltReason, {
        onNotify: config.onBudgetExceeded
          ? (msg) => {
              // Convert to BudgetCheckResult format
              const result: BudgetCheckResult = {
                allowed: false,
                remainingTokens: 0,
                exceeded: true,
                haltReason,
              };
              void config.onBudgetExceeded!(result);
            }
          : undefined,
      });
    },

    getStatus: () => config.enforcer.getStatus(config.sessionId),

    isEnabled: config.enabled !== false,
  };
}

// Export all types for consumers
export type {
  BudgetEnforcer,
};

/**
 * Session identifier factory
 * Helper to create session IDs for budget tracking
 */
export function createSessionId(
  groupId: string,
  agentId: string,
  sessionId: string
): SessionId {
  return {
    groupId,
    agentId,
    sessionId,
  };
}

/**
 * Error thrown when budget is exceeded
 */
export class BudgetExceededError extends Error {
  public readonly sessionId: SessionId;
  public readonly haltReason: HaltReason;
  public readonly remainingTokens: number;

  constructor(
    sessionId: SessionId,
    haltReason: HaltReason,
    remainingTokens: number,
    message?: string
  ) {
    super(message ?? `Budget exceeded: ${haltReason.type}`);
    this.name = "BudgetExceededError";
    this.sessionId = sessionId;
    this.haltReason = haltReason;
    this.remainingTokens = remainingTokens;
  }
}
