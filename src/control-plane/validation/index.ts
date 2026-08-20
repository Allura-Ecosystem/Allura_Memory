/**
 * RuVix ControlPlane Phase 3 - Validation Suite
 *
 * Unified validation API for controlPlane enforcement.
 * Provides comprehensive protection against bypass attempts.
 *
 * VALIDATION LAYERS:
 * 1. Direct Access Blocker - Prevents raw DB connections
 * 2. MCP Interceptor - Validates proof on MCP calls
 * 3. Bypass Detector - Monitors for circumvention patterns
 *
 * USAGE:
 * ```typescript
 * import { initializeValidation, validateOperation } from '@/control-plane/validation';
 *
 * // Initialize at app startup
 * initializeValidation();
 *
 * // Validate any operation
 * const result = validateOperation('db_query', caller, context);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import {
  BypassAttempt,
  BypassDetectedError,
  BypassDetector,
  bypassDetector,
  clearBypassDetectionHistory,
  detectEnvironmentManipulation,
  DetectionResult,
  detectLegacyImports,
  detectModuleTampering,
  detectPolicyCircumvention,
  disableBypassDetector,
  enableBypassDetector,
  generateBypassMigrationReport,
  getBypassDetections,
  getCriticalBypassDetections,
  getMigrationPath,
  isLegacyImport,
  scanCodeForBypasses,
} from "./bypass-detector";
import {
  assertControlPlaneBacked,
  clearDirectAccessHistory,
  DirectAccessAttempt,
  DirectAccessBlockedError,
  DirectAccessBlocker,
  directAccessBlocker,
  disableDirectAccessBlocker,
  enableDirectAccessBlocker,
  getDirectAccessAttempts,
  isControlPlaneOnlyPath,
  validateDatabaseAccess,
} from "./direct-access-blocker";

import {
  clearMcpInterceptionHistory,
  disableMcpInterceptor,
  enableMcpInterceptor,
  getMcpInterceptions,
  getMcpRejectionCount,
  McpInterception,
  McpInterceptor,
  mcpInterceptor,
  McpProofRejectedError,
  wouldMcpCallBeAllowed,
  wrapMcpCallWithProof,
} from "./mcp-interceptor";


// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validation suite configuration
 */
export interface ValidationConfig {
  /** Enable all validation layers */
  enabled: boolean;

  /** Direct access blocker config */
  directAccess?: {
    enabled?: boolean;
    logAttempts?: boolean;
    autoRedirect?: boolean;
    throwOnViolation?: boolean;
    allowlist?: string[];
  };

  /** MCP interceptor config */
  mcpInterceptor?: {
    enabled?: boolean;
    logCalls?: boolean;
    logRejections?: boolean;
    rejectWithoutProof?: boolean;
    allowlist?: string[];
  };

  /** Bypass detector config */
  bypassDetector?: {
    enabled?: boolean;
    logDetections?: boolean;
    blockCritical?: boolean;
    alertThreshold?: number;
    allowlist?: string[];
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors (if any) */
  errors: ValidationError[];

  /** Which layers were checked */
  layers: ValidationLayerResult[];

  /** Timestamp of validation */
  timestamp: number;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Layer where error occurred */
  layer: string;

  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Severity */
  severity: "critical" | "high" | "medium" | "low";

  /** Suggested fix */
  suggestion?: string;
}

/**
 * Individual layer validation result
 */
export interface ValidationLayerResult {
  /** Layer name */
  name: string;

  /** Whether layer passed */
  passed: boolean;

  /** Time taken to validate */
  durationMs: number;

  /** Errors from this layer */
  errors: ValidationError[];
}

/**
 * Validation health status
 */
export interface ValidationHealth {
  /** Overall status */
  status: "healthy" | "degraded" | "failing";

  /** Validation layers status */
  layers: {
    directAccess: "active" | "disabled" | "error";
    mcpInterceptor: "active" | "disabled" | "error";
    bypassDetector: "active" | "disabled" | "error";
  };

  /** Violation statistics */
  stats: {
    directAccessAttempts: number;
    mcpRejections: number;
    bypassDetections: number;
    totalViolations: number;
  };

  /** Last check timestamp */
  lastCheck: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ValidationConfig = {
  enabled: true,
  directAccess: {
    enabled: true,
    logAttempts: true,
    autoRedirect: true,
    throwOnViolation: true,
    allowlist: [],
  },
  mcpInterceptor: {
    enabled: true,
    logCalls: true,
    logRejections: true,
    rejectWithoutProof: true,
    allowlist: [],
  },
  bypassDetector: {
    enabled: true,
    logDetections: true,
    blockCritical: true,
    alertThreshold: 1,
    allowlist: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION SUITE
// ─────────────────────────────────────────────────────────────────────────────

class ValidationSuite {
  private config: ValidationConfig;
  private initialized: boolean = false;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = this.mergeConfig(config);
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(userConfig: Partial<ValidationConfig>): ValidationConfig {
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      directAccess: { ...DEFAULT_CONFIG.directAccess, ...userConfig.directAccess },
      mcpInterceptor: { ...DEFAULT_CONFIG.mcpInterceptor, ...userConfig.mcpInterceptor },
      bypassDetector: { ...DEFAULT_CONFIG.bypassDetector, ...userConfig.bypassDetector },
    };
  }

  /**
   * Initialize all validation layers
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[ValidationSuite] Validation disabled, skipping initialization");
      return;
    }

    // Initialize direct access blocker
    if (this.config.directAccess?.enabled) {
      enableDirectAccessBlocker(this.config.directAccess);
    }

    // Initialize MCP interceptor
    if (this.config.mcpInterceptor?.enabled) {
      enableMcpInterceptor(this.config.mcpInterceptor);
    }

    // Initialize bypass detector
    if (this.config.bypassDetector?.enabled) {
      enableBypassDetector(this.config.bypassDetector);
    }

    this.initialized = true;

    console.log("[ValidationSuite] All validation layers initialized");
  }

  /**
   * Validate an operation through all layers
   */
  validate(
    operation: string,
    caller: string,
    context?: Record<string, unknown>
  ): ValidationResult {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const layers: ValidationLayerResult[] = [];

    // Layer 1: Direct Access Blocker
    const directAccessStart = Date.now();
    const directAccessErrors: ValidationError[] = [];

    if (this.config.directAccess?.enabled) {
      try {
        const result = validateDatabaseAccess(operation, caller, context);
        if (!result.allowed) {
          directAccessErrors.push({
            layer: "directAccess",
            code: "DIRECT_ACCESS_BLOCKED",
            message: result.reason || "Direct database access not permitted",
            severity: "critical",
            suggestion: result.redirect
              ? `Use ${result.redirect} instead`
              : "Route through RuVix controlPlane",
          });
        }
      } catch (error) {
        if (error instanceof DirectAccessBlockedError) {
          directAccessErrors.push({
            layer: "directAccess",
            code: error.code,
            message: error.message,
            severity: "critical",
            suggestion: `Use ${error.attempt.redirectTarget || "RuVixControlPlane.syscall"}`,
          });
        } else {
          directAccessErrors.push({
            layer: "directAccess",
            code: "VALIDATION_ERROR",
            message: error instanceof Error ? error.message : String(error),
            severity: "high",
          });
        }
      }
    }

    layers.push({
      name: "directAccess",
      passed: directAccessErrors.length === 0,
      durationMs: Date.now() - directAccessStart,
      errors: directAccessErrors,
    });

    errors.push(...directAccessErrors);

    // Layer 2: MCP Interceptor (for MCP operations)
    const mcpStart = Date.now();
    const mcpErrors: ValidationError[] = [];

    if (this.config.mcpInterceptor?.enabled && operation.startsWith("mcp.")) {
      const toolName = operation.replace("mcp.", "");
      const args = context?.args as Record<string, unknown> || {};

      const result = wouldMcpCallBeAllowed(toolName, args, caller);

      if (!result.allowed) {
        mcpErrors.push({
          layer: "mcpInterceptor",
          code: "MCP_PROOF_REJECTED",
          message: result.reason || "MCP call rejected",
          severity: "critical",
          suggestion: "Attach valid proof-of-intent to MCP calls",
        });
      }
    }

    layers.push({
      name: "mcpInterceptor",
      passed: mcpErrors.length === 0,
      durationMs: Date.now() - mcpStart,
      errors: mcpErrors,
    });

    errors.push(...mcpErrors);

    // Layer 3: Bypass Detector
    const bypassStart = Date.now();
    const bypassErrors: ValidationError[] = [];

    if (this.config.bypassDetector?.enabled) {
      // Check for policy circumvention
      const policyResult = detectPolicyCircumvention(operation, { caller });
      if (policyResult.detected && policyResult.bypass) {
        bypassErrors.push({
          layer: "bypassDetector",
          code: "BYPASS_DETECTED",
          message: `${policyResult.bypass.type} detected`,
          severity: policyResult.bypass.severity,
          suggestion: policyResult.bypass.suggestion,
        });
      }

      // Check for environment manipulation
      const envResult = detectEnvironmentManipulation(operation);
      if (envResult.detected && envResult.bypass) {
        bypassErrors.push({
          layer: "bypassDetector",
          code: "ENV_MANIPULATION",
          message: "Environment manipulation detected",
          severity: "critical",
          suggestion: envResult.bypass.suggestion,
        });
      }
    }

    layers.push({
      name: "bypassDetector",
      passed: bypassErrors.length === 0,
      durationMs: Date.now() - bypassStart,
      errors: bypassErrors,
    });

    errors.push(...bypassErrors);

    return {
      valid: errors.length === 0,
      errors,
      layers,
      timestamp: Date.now(),
    };
  }

  /**
   * Get validation health status
   */
  getHealth(): ValidationHealth {
    const directAccessAttempts = getDirectAccessAttempts().length;
    const mcpRejections = getMcpRejectionCount();
    const bypassDetections = getBypassDetections().length;
    const totalViolations = directAccessAttempts + mcpRejections + bypassDetections;

    // Determine status
    let status: ValidationHealth["status"] = "healthy";
    if (totalViolations > 10) {
      status = "failing";
    } else if (totalViolations > 0) {
      status = "degraded";
    }

    return {
      status,
      layers: {
        directAccess: this.config.directAccess?.enabled ? "active" : "disabled",
        mcpInterceptor: this.config.mcpInterceptor?.enabled ? "active" : "disabled",
        bypassDetector: this.config.bypassDetector?.enabled ? "active" : "disabled",
      },
      stats: {
        directAccessAttempts,
        mcpRejections,
        bypassDetections,
        totalViolations,
      },
      lastCheck: Date.now(),
    };
  }

  /**
   * Check if validation is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidationConfig>): void {
    this.config = this.mergeConfig(config);
  }

  /**
   * Shutdown all validation layers
   */
  shutdown(): void {
    disableDirectAccessBlocker();
    disableMcpInterceptor();
    disableBypassDetector();
    this.initialized = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global validation suite instance
 */
export const validationSuite = new ValidationSuite();

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS - Core API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the validation suite
 */
export function initializeValidation(config?: Partial<ValidationConfig>): void {
  if (config) {
    validationSuite.updateConfig(config);
  }
  validationSuite.initialize();
}

/**
 * Validate an operation
 */
export function validateOperation(
  operation: string,
  caller: string,
  context?: Record<string, unknown>
): ValidationResult {
  return validationSuite.validate(operation, caller, context);
}

/**
 * Get validation health status
 */
export function getValidationHealth(): ValidationHealth {
  return validationSuite.getHealth();
}

/**
 * Shutdown validation
 */
export function shutdownValidation(): void {
  validationSuite.shutdown();
}

/**
 * Check if validation is healthy
 */
export function isValidationHealthy(): boolean {
  const health = validationSuite.getHealth();
  return health.status === "healthy";
}

/**
 * Assert that operation is valid
 */
export function assertValidOperation(
  operation: string,
  caller: string,
  context?: Record<string, unknown>
): void {
  const result = validateOperation(operation, caller, context);

  if (!result.valid) {
    const messages = result.errors.map((e) => `[${e.layer}] ${e.message}`).join("; ");
    throw new Error(`Validation failed: ${messages}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default validationSuite;
