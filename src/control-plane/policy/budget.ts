/**
 * RuVix ControlPlane - Budget Enforcement Policy
 * 
 * Migrated from src/lib/budget/enforcer.ts
 * 
 * This module provides budget enforcement through the controlPlane.
 * All operations must stay within configured budget limits.
 * 
 * DEPRECATION: src/lib/budget/enforcer.ts is now deprecated.
 * Use controlPlane syscalls or SDK wrapper instead.
 */

import type { BudgetConsumption, BudgetLimits } from "@/lib/budget/types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Budget policy configuration
 */
export interface BudgetPolicyConfig {
  /** Budget limits */
  limits: BudgetLimits;
  
  /** Warning thresholds (0.0 - 1.0) */
  warningThresholds: {
    warning80: number;
    warning90: number;
  };
  
  /** Halt on breach */
  haltOnBreach: boolean;
}

/**
 * Budget enforcement result
 */
export interface BudgetEnforcementResult {
  /** Whether operation is allowed */
  allowed: boolean;
  
  /** Current status */
  status: "ok" | "warning" | "breached" | "halted";
  
  /** Consumption breakdown */
  consumption: BudgetConsumption;
  
  /** Warnings (categories at 80%+) */
  warnings: BudgetWarning[];
  
  /** Breaches (categories at 100%+) */
  breaches: BudgetBreach[];
}

/**
 * Budget warning
 */
export interface BudgetWarning {
  category: string;
  consumed: number;
  limit: number;
  utilizationPercent: number;
}

/**
 * Budget breach
 */
export interface BudgetBreach {
  category: string;
  consumed: number;
  limit: number;
  utilizationPercent: number;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default budget policy configuration
 */
export const DEFAULT_BUDGET_POLICY: BudgetPolicyConfig = {
  limits: {
    maxTokens: 100000,
    maxToolCalls: 1000,
    maxTimeMs: 300000, // 5 minutes
    maxCostUsd: 10.0,
    maxSteps: 100,
  },
  warningThresholds: {
    warning80: 0.8,
    warning90: 0.9,
  },
  haltOnBreach: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET POLICY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Budget policy engine for controlPlane enforcement
 * 
 * Evaluates budget constraints before allowing controlPlane operations.
 */
export class BudgetPolicyEngine {
  private config: BudgetPolicyConfig;
  private consumption: BudgetConsumption;

  constructor(config: Partial<BudgetPolicyConfig> = {}) {
    this.config = {
      ...DEFAULT_BUDGET_POLICY,
      ...config,
    };
    
    this.consumption = {
      tokens: 0,
      toolCalls: 0,
      timeMs: 0,
      costUsd: 0,
      steps: 0,
    };
  }

  /**
   * Record resource consumption
   */
  recordConsumption(consumption: Partial<BudgetConsumption>): void {
    if (consumption.tokens !== undefined) {
      this.consumption.tokens += consumption.tokens;
    }
    if (consumption.toolCalls !== undefined) {
      this.consumption.toolCalls += consumption.toolCalls;
    }
    if (consumption.timeMs !== undefined) {
      this.consumption.timeMs += consumption.timeMs;
    }
    if (consumption.costUsd !== undefined) {
      this.consumption.costUsd += consumption.costUsd;
    }
    if (consumption.steps !== undefined) {
      this.consumption.steps += consumption.steps;
    }
  }

  /**
   * Check budget before operation
   */
  checkBudget(): BudgetEnforcementResult {
    const warnings: BudgetWarning[] = [];
    const breaches: BudgetBreach[] = [];

    // Check each category
    this.checkCategory("tokens", this.consumption.tokens, this.config.limits.maxTokens, warnings, breaches);
    this.checkCategory("tool_calls", this.consumption.toolCalls, this.config.limits.maxToolCalls, warnings, breaches);
    this.checkCategory("time_ms", this.consumption.timeMs, this.config.limits.maxTimeMs, warnings, breaches);
    this.checkCategory("cost_usd", this.consumption.costUsd, this.config.limits.maxCostUsd, warnings, breaches);
    this.checkCategory("steps", this.consumption.steps, this.config.limits.maxSteps, warnings, breaches);

    // Determine status
    let status: "ok" | "warning" | "breached" | "halted" = "ok";
    
    if (breaches.length > 0) {
      status = this.config.haltOnBreach ? "halted" : "breached";
    } else if (warnings.length > 0) {
      status = "warning";
    }

    return {
      allowed: status === "ok" || status === "warning",
      status,
      consumption: { ...this.consumption },
      warnings,
      breaches,
    };
  }

  /**
   * Get current consumption
   */
  getConsumption(): BudgetConsumption {
    return { ...this.consumption };
  }

  /**
   * Reset consumption
   */
  reset(): void {
    this.consumption = {
      tokens: 0,
      toolCalls: 0,
      timeMs: 0,
      costUsd: 0,
      steps: 0,
    };
  }

  // Private methods

  private checkCategory(
    category: string,
    consumed: number,
    limit: number,
    warnings: BudgetWarning[],
    breaches: BudgetBreach[]
  ): void {
    const utilizationPercent = (consumed / limit) * 100;
    const { warning80, warning90 } = this.config.warningThresholds;

    const breach: BudgetBreach = {
      category,
      consumed,
      limit,
      utilizationPercent,
      timestamp: Date.now(),
    };

    if (consumed >= limit) {
      breaches.push(breach);
    } else if (utilizationPercent >= warning90 * 100) {
      warnings.push({
        category,
        consumed,
        limit,
        utilizationPercent,
      });
    } else if (utilizationPercent >= warning80 * 100) {
      warnings.push({
        category,
        consumed,
        limit,
        utilizationPercent,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE BUDGET SYSCALL INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build budget claims for controlPlane proof
 * 
 * @param estimatedCost - Estimated cost of operation
 * @param budgetContext - Additional budget context
 * @returns Claims object for controlPlane proof
 */
export function buildBudgetClaims(
  estimatedCost?: number,
  budgetContext?: Record<string, unknown>
) {
  return {
    budget_cost: estimatedCost,
    audit_context: {
      budget_context: budgetContext,
    },
  };
}

/**
 * Create budget policy engine with default config
 */
export function createBudgetPolicyEngine(
  config?: Partial<BudgetPolicyConfig>
): BudgetPolicyEngine {
  return new BudgetPolicyEngine(config);
}

// Types are exported inline above
