/**
 * RuVix ControlPlane - Enforcement Gate
 * 
 * Blocks non-controlPlane access to database operations.
 * This is the "zero-trust" boundary - all operations must flow through the controlPlane.
 * 
 * ENFORCEMENT STRATEGY:
 * 1. Monkey-patch MCP_DOCKER tools to intercept calls
 * 2. Validate that calls have controlPlane proof metadata
 * 3. Block calls that bypass the controlPlane
 * 4. Log violations for audit
 */

import { initializeControlPlane, RuVixControlPlane } from "./ruvix";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gate configuration
 */
export interface GateConfig {
  /** Enable gate enforcement (default: true) */
  enabled: boolean;
  
  /** Log violations (default: true) */
  logViolations: boolean;
  
  /** Throw on violation (default: true) */
  throwOnViolation: boolean;
  
  /** Allowlisted callers (bypass gate) */
  allowlist: string[];
}

/**
 * Violation record
 */
export interface ViolationRecord {
  /** Timestamp of violation */
  timestamp: number;
  
  /** Type of violation */
  type: "direct_db_access" | "missing_proof" | "invalid_proof" | "policy_violation";
  
  /** Caller information */
  caller: string;
  
  /** Operation attempted */
  operation: string;
  
  /** Error message */
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE STATE
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: GateConfig = {
  enabled: true,
  logViolations: true,
  throwOnViolation: true,
  allowlist: [],
};

class EnforcementGate {
  private config: GateConfig;
  private violations: ViolationRecord[] = [];
  private initialized: boolean = false;

  constructor(config: Partial<GateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the enforcement gate
   * 
   * Must be called before enabling enforcement.
   */
  initialize(): void {
    const status = initializeControlPlane();
    
    if (!status.initialized) {
      const error = new Error(
        `ControlPlane initialization failed: ${status.errors.join("; ")}`
      );
      this.recordViolation({
        timestamp: Date.now(),
        type: "invalid_proof",
        caller: "EnforcementGate",
        operation: "initialize",
        message: error.message,
      });
      
      if (this.config.throwOnViolation) {
        throw error;
      }
    }
    
    this.initialized = true;
    
    if (this.config.logViolations) {
      console.log(`[EnforcementGate] Initialized. ControlPlane status:`, status);
    }
  }

  /**
   * Enable enforcement
   * 
   * After this, all DB operations must flow through the controlPlane.
   */
  enable(): void {
    if (!this.initialized) {
      this.initialize();
    }
    
    this.config.enabled = true;
    
    if (this.config.logViolations) {
      console.log("[EnforcementGate] Enforcement ENABLED");
    }
  }

  /**
   * Disable enforcement (for testing/migration)
   */
  disable(): void {
    this.config.enabled = false;
    
    if (this.config.logViolations) {
      console.log("[EnforcementGate] Enforcement DISABLED");
    }
  }

  /**
   * Check if enforcement is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * Record a violation
   */
  recordViolation(violation: ViolationRecord): void {
    this.violations.push(violation);
    
    if (this.config.logViolations) {
      console.error(`[EnforcementGate] VIOLATION: ${violation.type}`, {
        caller: violation.caller,
        operation: violation.operation,
        message: violation.message,
      });
    }
  }

  /**
   * Get violation history
   */
  getViolations(): ViolationRecord[] {
    return [...this.violations];
  }

  /**
   * Clear violation history
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * Validate that an operation has controlPlane proof
   * 
   * @param proof - Proof metadata from the operation
   * @param caller - Caller identification
   * @param operation - Operation being performed
   * @returns true if valid, throws or records violation if invalid
   */
  validateProof(
    proof: unknown,
    caller: string,
    operation: string
  ): boolean {
    if (!this.config.enabled) {
      return true; // Gate disabled, allow all
    }

    // Check allowlist
    if (this.config.allowlist.includes(caller)) {
      if (this.config.logViolations) {
        console.log(`[EnforcementGate] Allowlisted caller bypass: ${caller}`);
      }
      return true;
    }

    // Validate proof exists
    if (!proof) {
      this.recordViolation({
        timestamp: Date.now(),
        type: "missing_proof",
        caller,
        operation,
        message: "Operation lacks controlPlane proof metadata",
      });

      if (this.config.throwOnViolation) {
        throw new Error(
          `Enforcement Gate Violation: ${caller} attempted ${operation} without controlPlane proof. ` +
          "All database operations must flow through the RuVix controlPlane."
        );
      }

      return false;
    }

    // TODO: Validate proof structure when we have the full proof interface
    // For now, just check that proof exists

    return true;
  }

  /**
   * Wrap a function to enforce controlPlane access
   * 
   * @param fn - Function to wrap
   * @param caller - Caller identification
   * @returns Wrapped function with enforcement
   */
  enforce<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    caller: string
  ): T {
    // The returned function is intentionally a `function` expression, not an
    // arrow: it must receive the caller's dynamic `this` and forward it via
    // fn.apply(this, args). An arrow would capture the gate's `this` and
    // silently break this-forwarding at every call site, so the alias is
    // required here rather than incidental.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return (async function (this: unknown, ...args: unknown[]) {
      // Extract proof from arguments (convention: last arg is context with proof)
      const lastArg = args[args.length - 1];
      const proof =
        lastArg && typeof lastArg === "object" && "proof" in lastArg
          ? (lastArg as any).proof
          : undefined;

      self.validateProof(proof, caller, fn.name);

      return fn.apply(this, args);
    } as T);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL GATE INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global enforcement gate instance
 */
export const enforcementGate = new EnforcementGate();

/**
 * Initialize and enable the enforcement gate
 * 
 * Call this at application startup to enable controlPlane-only access.
 */
export function enableEnforcementGate(config?: Partial<GateConfig>): void {
  if (config) {
    enforcementGate.constructor.call(enforcementGate, config);
  }
  enforcementGate.initialize();
  enforcementGate.enable();
}

/**
 * Disable the enforcement gate
 * 
 * Use for testing or during migration.
 */
export function disableEnforcementGate(): void {
  enforcementGate.disable();
}

/**
 * Check if enforcement gate is active
 */
export function isEnforcementEnabled(): boolean {
  return enforcementGate.isEnabled();
}

/**
 * Get violation history
 */
export function getGateViolations(): ViolationRecord[] {
  return enforcementGate.getViolations();
}

/**
 * Clear violation history
 */
export function clearGateViolations(): void {
  enforcementGate.clearViolations();
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP INTERCEPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intercept MCP_DOCKER tool calls
 * 
 * This monkey-patches the MCP client to validate controlPlane proof.
 * 
 * WARNING: This is a aggressive enforcement strategy.
 * Use only when ready for full controlPlane-only operation.
 */
export function interceptMcpCalls(): void {
  if (typeof globalThis === "undefined") {
    console.warn(
      "[EnforcementGate] Cannot intercept MCP calls: globalThis not available"
    );
    return;
  }

  // Check if MCP_DOCKER is available
  const mcpDocker = (globalThis as any).MCP_DOCKER;

  if (!mcpDocker) {
    console.warn(
      "[EnforcementGate] Cannot intercept MCP calls: MCP_DOCKER not available"
    );
    return;
  }

  // Wrap key database operations
  const operationsToIntercept = [
    "execute_sql",
    "execute_unsafe_sql",
    "query_database",
    "insert_data",
    "update_data",
    "delete_data",
  ];

  for (const op of operationsToIntercept) {
    const originalFn = mcpDocker[op];

    if (typeof originalFn === "function") {
      mcpDocker[op] = function (...args: unknown[]) {
        // Check for controlPlane proof in call stack
        const stack = new Error().stack || "";
        const isFromControlPlane = stack.includes("/control-plane/");

        if (!isFromControlPlane && enforcementGate.isEnabled()) {
          enforcementGate.recordViolation({
            timestamp: Date.now(),
            type: "direct_db_access",
            caller: "MCP_DOCKER." + op,
            operation: op,
            message: "Direct database access detected (bypassing controlPlane)",
          });

          if (enforcementGate.isEnabled() && enforcementGate.isEnabled()) {
            throw new Error(
              `Enforcement Gate: Direct database access blocked. ` +
              `Use RuVix controlPlane syscalls instead. Operation: ${op}`
            );
          }
        }

        return originalFn.apply(this, args);
      };

      if (enforcementGate.isEnabled()) {
        console.log(`[EnforcementGate] Intercepted MCP_DOCKER.${op}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export { EnforcementGate };
// GateConfig and ViolationRecord are available via the class exports
