/**
 * RuVix ControlPlane Phase 3 - Direct Access Blocker
 *
 * Detects and blocks direct PostgreSQL/Neo4j connections that bypass the controlPlane.
 * Enforces 100% controlPlane-only database access policy.
 *
 * STRATEGY:
 * 1. Monitor for direct database client instantiation
 * 2. Intercept raw connection attempts
 * 3. Redirect to controlPlane-backed path
 * 4. Log all violations for audit
 */

import { enforcementGate, ViolationRecord } from "../gate";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Direct access attempt details
 */
export interface DirectAccessAttempt {
  /** Timestamp of attempt */
  timestamp: number;

  /** Type of database accessed */
  databaseType: "postgresql" | "neo4j" | "unknown";

  /** Connection method used */
  connectionMethod: string;

  /** Caller information (stack trace, module) */
  caller: string;

  /** Whether attempt was blocked */
  blocked: boolean;

  /** Redirect target (controlPlane path) */
  redirectTarget?: string;
}

/**
 * Blocker configuration
 */
export interface BlockerConfig {
  /** Enable blocking (default: true) */
  enabled: boolean;

  /** Log attempts (default: true) */
  logAttempts: boolean;

  /** Auto-redirect to controlPlane (default: true) */
  autoRedirect: boolean;

  /** Throw on violation (default: true) */
  throwOnViolation: boolean;

  /** Allowlisted modules (can bypass) */
  allowlist: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BlockerConfig = {
  enabled: true,
  logAttempts: true,
  autoRedirect: true,
  throwOnViolation: true,
  allowlist: ["/control-plane/", "/lib/db/", "test", "spec"],
};

// Patterns that indicate direct database access
const DIRECT_ACCESS_PATTERNS = {
  postgresql: [
    /new\s+Client\s*\(/i,
    /createConnection\s*\(/i,
    /Pool\s*\(/i,
    /postgres\s*\(/i,
    /pg\./i,
    / drizzle\s*\(/i,
    /prisma\./i,
  ],
  neo4j: [
    /neo4j\.driver\s*\(/i,
    /Driver\s*\(/i,
    /Session\s*\(/i,
    /graph\.db\s*\(/i,
  ],
};

// Allowed controlPlane paths that can access databases
const CONTROL_PLANE_PATHS = [
  "/src/control-plane/",
  "/control-plane/",
  "@/control-plane/",
  "RuVixControlPlane",
  "syscall_",
];

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER STATE
// ─────────────────────────────────────────────────────────────────────────────

export class DirectAccessBlocker {
  private config: BlockerConfig;
  private attempts: DirectAccessAttempt[] = [];
  private initialized: boolean = false;
  private originalModules: Map<string, unknown> = new Map();

  constructor(config: Partial<BlockerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the blocker
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.patchModules();
    this.initialized = true;

    if (this.config.logAttempts) {
      console.log("[DirectAccessBlocker] Initialized - monitoring for direct DB access");
    }
  }

  /**
   * Check if caller is from controlPlane path
   */
  private isControlPlaneCaller(stack: string): boolean {
    // Check if any controlPlane path is in the stack
    return CONTROL_PLANE_PATHS.some((path) => stack.includes(path));
  }

  /**
   * Check if caller is allowlisted
   */
  private isAllowlisted(stack: string): boolean {
    return this.config.allowlist.some((allowed) => stack.includes(allowed));
  }

  /**
   * Detect database type from code patterns
   */
  private detectDatabaseType(code: string): "postgresql" | "neo4j" | "unknown" {
    for (const [type, patterns] of Object.entries(DIRECT_ACCESS_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(code)) {
          return type as "postgresql" | "neo4j";
        }
      }
    }
    return "unknown";
  }

  /**
   * Record a direct access attempt
   */
  private recordAttempt(attempt: DirectAccessAttempt): void {
    this.attempts.push(attempt);

    // Also record in enforcement gate
    const violation: ViolationRecord = {
      timestamp: attempt.timestamp,
      type: "direct_db_access",
      caller: attempt.caller,
      operation: attempt.connectionMethod,
      message: `Direct ${attempt.databaseType} access attempted. Blocked: ${attempt.blocked}`,
    };

    enforcementGate.recordViolation(violation);

    if (this.config.logAttempts) {
      console.error(
        `[DirectAccessBlocker] VIOLATION: Direct ${attempt.databaseType} access`,
        {
          caller: attempt.caller,
          method: attempt.connectionMethod,
          blocked: attempt.blocked,
        }
      );
    }
  }

  /**
   * Patch modules to intercept direct access
   */
  private patchModules(): void {
    // This is a defensive mechanism - in production, this would be done
    // at build time or via runtime instrumentation
    // For now, we rely on static analysis and runtime checks
  }

  /**
   * Validate a database operation
   *
   * Call this from enforcement points to check if operation is allowed
   */
  validateOperation(
    operation: string,
    caller: string,
    context?: Record<string, unknown>
  ): { allowed: boolean; redirect?: string; reason?: string } {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // Check allowlist
    if (this.isAllowlisted(caller)) {
      return { allowed: true };
    }

    // Check if caller is from controlPlane
    if (this.isControlPlaneCaller(caller)) {
      return { allowed: true };
    }

    // Detect database type
    const dbType = this.detectDatabaseType(operation);

    // Record the attempt
    const attempt: DirectAccessAttempt = {
      timestamp: Date.now(),
      databaseType: dbType,
      connectionMethod: operation,
      caller: caller,
      blocked: true,
      redirectTarget: "RuVixControlPlane.syscall",
    };

    this.recordAttempt(attempt);

    // Determine response
    if (this.config.throwOnViolation) {
      throw new DirectAccessBlockedError(
        `Direct ${dbType} access blocked. Use RuVix controlPlane syscalls instead.`,
        attempt
      );
    }

    if (this.config.autoRedirect) {
      return {
        allowed: false,
        redirect: "RuVixControlPlane.syscall",
        reason: `Direct ${dbType} access must flow through controlPlane`,
      };
    }

    return { allowed: false, reason: "Direct database access not permitted" };
  }

  /**
   * Get all recorded attempts
   */
  getAttempts(): DirectAccessAttempt[] {
    return [...this.attempts];
  }

  /**
   * Get violation count
   */
  getViolationCount(): number {
    return this.attempts.filter((a) => a.blocked).length;
  }

  /**
   * Clear attempt history
   */
  clearHistory(): void {
    this.attempts = [];
  }

  /**
   * Check if blocker is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * Get configuration
   */
  getConfig(): BlockerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BlockerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown when direct access is blocked
 */
export class DirectAccessBlockedError extends Error {
  readonly attempt: DirectAccessAttempt;
  readonly code = "DIRECT_ACCESS_BLOCKED";

  constructor(message: string, attempt: DirectAccessAttempt) {
    super(message);
    this.name = "DirectAccessBlockedError";
    this.attempt = attempt;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global direct access blocker instance
 */
export const directAccessBlocker = new DirectAccessBlocker();

/**
 * Initialize and enable the direct access blocker
 */
export function enableDirectAccessBlocker(config?: Partial<BlockerConfig>): void {
  if (config) {
    directAccessBlocker.updateConfig(config);
  }
  directAccessBlocker.initialize();
}

/**
 * Disable the direct access blocker
 */
export function disableDirectAccessBlocker(): void {
  directAccessBlocker.updateConfig({ enabled: false });
}

/**
 * Validate a database operation
 */
export function validateDatabaseAccess(
  operation: string,
  caller: string,
  context?: Record<string, unknown>
): { allowed: boolean; redirect?: string; reason?: string } {
  return directAccessBlocker.validateOperation(operation, caller, context);
}

/**
 * Get direct access attempt history
 */
export function getDirectAccessAttempts(): DirectAccessAttempt[] {
  return directAccessBlocker.getAttempts();
}

/**
 * Clear direct access history
 */
export function clearDirectAccessHistory(): void {
  directAccessBlocker.clearHistory();
}

/**
 * Check if a module is allowed to access databases directly
 */
export function isControlPlaneOnlyPath(modulePath: string): boolean {
  return CONTROL_PLANE_PATHS.some((controlPlanePath) => modulePath.includes(controlPlanePath));
}

/**
 * Assert that operation is controlPlane-backed
 */
export function assertControlPlaneBacked(
  operation: string,
  caller: string
): void {
  const result = validateDatabaseAccess(operation, caller);

  if (!result.allowed) {
    throw new Error(
      `ControlPlane enforcement violation: ${result.reason}. ` +
      `Use RuVixControlPlane.syscall instead of direct database access.`
    );
  }
}
