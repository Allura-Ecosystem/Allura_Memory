/**
 * RuVix ControlPlane Phase 3 - MCP Interceptor
 *
 * Intercepts all MCP tool calls to verify they carry valid proof-of-intent.
 * Rejects calls without proof and logs rejection details.
 *
 * ENFORCEMENT STRATEGY:
 * 1. Wrap MCP_DOCKER tools at runtime
 * 2. Extract proof from call context
 * 3. Validate proof before allowing execution
 * 4. Log all rejections with full context
 */

import { ViolationRecord } from "../gate";
import { getControlPlaneSecretKey, ProofOfIntent, VerificationResult, verifyProof } from "../proof";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MCP call interception details
 */
export interface McpInterception {
  /** Timestamp of call */
  timestamp: number;

  /** Tool name called */
  toolName: string;

  /** Arguments passed */
  args: Record<string, unknown>;

  /** Proof attached to call (if any) */
  proof?: ProofOfIntent;

  /** Verification result */
  verification?: VerificationResult;

  /** Whether call was allowed */
  allowed: boolean;

  /** Rejection reason (if not allowed) */
  rejectionReason?: string;

  /** Call stack at interception point */
  callStack: string;

  /** Caller identification */
  caller: string;
}

/**
 * Interceptor configuration
 */
export interface InterceptorConfig {
  /** Enable interception (default: true) */
  enabled: boolean;

  /** Log all calls (default: true) */
  logCalls: boolean;

  /** Log rejections (default: true) */
  logRejections: boolean;

  /** Reject calls without proof (default: true) */
  rejectWithoutProof: boolean;

  /** Allowlisted callers (bypass proof check) */
  allowlist: string[];

  /** Required proof fields */
  requiredFields: string[];
}

/**
 * MCP tool call result
 */
export interface McpCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  proofValid?: boolean;
  interception?: McpInterception;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: InterceptorConfig = {
  enabled: true,
  logCalls: true,
  logRejections: true,
  rejectWithoutProof: true,
  allowlist: ["/control-plane/", "RuVixControlPlane", "test", "spec"],
  requiredFields: ["intent", "subject", "actor", "timestamp", "signature", "claims"],
};

// MCP operations that require proof
const PROTECTED_OPERATIONS = [
  "execute_sql",
  "execute_unsafe_sql",
  "query_database",
  "insert_data",
  "update_data",
  "delete_data",
  "create_table",
  "create_entities",
  "create_relations",
  "delete_entities",
];

// ─────────────────────────────────────────────────────────────────────────────
// INTERCEPTOR STATE
// ─────────────────────────────────────────────────────────────────────────────

export class McpInterceptor {
  private config: InterceptorConfig;
  private interceptions: McpInterception[] = [];
  private initialized: boolean = false;
  private originalTools: Map<string, (...args: unknown[]) => unknown> = new Map();
  private rejectionCount: number = 0;

  constructor(config: Partial<InterceptorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the interceptor
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.interceptMcpTools();
    this.initialized = true;

    if (this.config.logCalls) {
      console.log("[McpInterceptor] Initialized - monitoring MCP tool calls");
    }
  }

  /**
   * Check if caller is allowlisted
   */
  private isAllowlisted(caller: string): boolean {
    return this.config.allowlist.some((allowed) => caller.includes(allowed));
  }

  /**
   * Extract proof from call arguments
   */
  private extractProof(args: Record<string, unknown>): ProofOfIntent | undefined {
    // Check for proof in various locations
    if (args.proof && typeof args.proof === "object") {
      return args.proof as ProofOfIntent;
    }

    if (args._proof && typeof args._proof === "object") {
      return args._proof as ProofOfIntent;
    }

    // Check in nested context
    if (args.context && typeof args.context === "object") {
      const ctx = args.context as Record<string, unknown>;
      if (ctx.proof) {
        return ctx.proof as ProofOfIntent;
      }
    }

    return undefined;
  }

  /**
   * Record an interception
   */
  private recordInterception(interception: McpInterception): void {
    this.interceptions.push(interception);

    if (!interception.allowed && this.config.logRejections) {
      console.error(`[McpInterceptor] REJECTED: ${interception.toolName}`, {
        caller: interception.caller,
        reason: interception.rejectionReason,
        hasProof: !!interception.proof,
      });
      this.rejectionCount++;
    } else if (this.config.logCalls) {
      console.log(`[McpInterceptor] ALLOWED: ${interception.toolName}`, {
        caller: interception.caller,
        proofValid: interception.verification?.valid,
      });
    }
  }

  /**
   * Intercept MCP_DOCKER tool calls
   */
  private interceptMcpTools(): void {
    if (typeof globalThis === "undefined") {
      console.warn("[McpInterceptor] globalThis not available, skipping interception");
      return;
    }

    const mcpDocker = (globalThis as any).MCP_DOCKER;

    if (!mcpDocker) {
      console.warn("[McpInterceptor] MCP_DOCKER not available, skipping interception");
      return;
    }

    for (const op of PROTECTED_OPERATIONS) {
      const originalFn = mcpDocker[op];

      if (typeof originalFn === "function") {
        // Store original
        this.originalTools.set(op, originalFn);

        // Wrap with interceptor
        mcpDocker[op] = async (...args: unknown[]) => {
          return this.interceptCall(op, args, originalFn.bind(mcpDocker));
        };

        if (this.config.logCalls) {
          console.log(`[McpInterceptor] Wrapped MCP_DOCKER.${op}`);
        }
      }
    }
  }

  /**
   * Intercept a single MCP call
   */
  private async interceptCall(
    toolName: string,
    args: unknown[],
    originalFn: (...args: unknown[]) => unknown
  ): Promise<unknown> {
    if (!this.config.enabled) {
      return originalFn(...args);
    }

    const timestamp = Date.now();
    const callStack = new Error().stack || "";
    const caller = this.extractCaller(callStack);

    // Check allowlist
    if (this.isAllowlisted(caller)) {
      const interception: McpInterception = {
        timestamp,
        toolName,
        args: args[0] as Record<string, unknown> || {},
        allowed: true,
        callStack,
        caller,
      };
      this.recordInterception(interception);
      return originalFn(...args);
    }

    // Extract and validate proof
    const argsObj = (args[0] as Record<string, unknown>) || {};
    const proof = this.extractProof(argsObj);

    let verification: VerificationResult | undefined;
    let allowed = false;
    let rejectionReason: string | undefined;

    if (!proof) {
      if (this.config.rejectWithoutProof) {
        allowed = false;
        rejectionReason = "Missing proof-of-intent";
      } else {
        allowed = true;
        rejectionReason = "Allowed without proof (rejectWithoutProof=false)";
      }
    } else {
      try {
        const secretKey = getControlPlaneSecretKey();
        verification = verifyProof(proof, secretKey);
        allowed = verification.valid;

        if (!allowed) {
          rejectionReason = verification.error || "Proof verification failed";
        }
      } catch (error) {
        allowed = false;
        rejectionReason = `Verification error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const interception: McpInterception = {
      timestamp,
      toolName,
      args: argsObj,
      proof,
      verification,
      allowed,
      rejectionReason,
      callStack,
      caller,
    };

    this.recordInterception(interception);

    if (!allowed) {
      throw new McpProofRejectedError(
        `MCP call rejected: ${rejectionReason}`,
        interception
      );
    }

    return originalFn(...args);
  }

  /**
   * Extract caller from stack trace
   */
  private extractCaller(stack: string): string {
    const lines = stack.split("\n");
    // Find first non-interceptor line
    for (const line of lines) {
      if (!line.includes("mcp-interceptor") && !line.includes("McpInterceptor")) {
        const match = line.match(/at\s+(?:\S+\s+\()?(.+):\d+:\d+\)?/);
        if (match) {
          return match[1];
        }
      }
    }
    return "unknown";
  }

  /**
   * Get all interceptions
   */
  getInterceptions(): McpInterception[] {
    return [...this.interceptions];
  }

  /**
   * Get rejection count
   */
  getRejectionCount(): number {
    return this.rejectionCount;
  }

  /**
   * Get interceptions for a specific tool
   */
  getInterceptionsForTool(toolName: string): McpInterception[] {
    return this.interceptions.filter((i) => i.toolName === toolName);
  }

  /**
   * Clear interception history
   */
  clearHistory(): void {
    this.interceptions = [];
    this.rejectionCount = 0;
  }

  /**
   * Check if interceptor is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * Get configuration
   */
  getConfig(): InterceptorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<InterceptorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Restore original MCP tools
   */
  restore(): void {
    if (typeof globalThis === "undefined") {
      return;
    }

    const mcpDocker = (globalThis as any).MCP_DOCKER;
    if (!mcpDocker) {
      return;
    }

    for (const [op, originalFn] of this.originalTools) {
      mcpDocker[op] = originalFn;
    }

    this.originalTools.clear();
    this.initialized = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Error thrown when MCP call is rejected for lack of proof
 */
export class McpProofRejectedError extends Error {
  readonly interception: McpInterception;
  readonly code = "MCP_PROOF_REJECTED";

  constructor(message: string, interception: McpInterception) {
    super(message);
    this.name = "McpProofRejectedError";
    this.interception = interception;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global MCP interceptor instance
 */
export const mcpInterceptor = new McpInterceptor();

/**
 * Initialize and enable MCP interception
 */
export function enableMcpInterceptor(config?: Partial<InterceptorConfig>): void {
  if (config) {
    mcpInterceptor.updateConfig(config);
  }
  mcpInterceptor.initialize();
}

/**
 * Disable MCP interception
 */
export function disableMcpInterceptor(): void {
  mcpInterceptor.updateConfig({ enabled: false });
}

/**
 * Get MCP interception history
 */
export function getMcpInterceptions(): McpInterception[] {
  return mcpInterceptor.getInterceptions();
}

/**
 * Get rejection count
 */
export function getMcpRejectionCount(): number {
  return mcpInterceptor.getRejectionCount();
}

/**
 * Clear MCP interception history
 */
export function clearMcpInterceptionHistory(): void {
  mcpInterceptor.clearHistory();
}

/**
 * Check if a tool call would be allowed
 */
export function wouldMcpCallBeAllowed(
  toolName: string,
  args: Record<string, unknown>,
  caller: string
): { allowed: boolean; reason?: string; proofValid?: boolean } {
  // Check allowlist
  if (mcpInterceptor["isAllowlisted"](caller)) {
    return { allowed: true };
  }

  // Extract proof
  const proof = mcpInterceptor["extractProof"](args);

  if (!proof) {
    return {
      allowed: false,
      reason: "Missing proof-of-intent",
      proofValid: false,
    };
  }

  // Validate proof
  try {
    const secretKey = getControlPlaneSecretKey();
    const verification = verifyProof(proof, secretKey);

    return {
      allowed: verification.valid,
      reason: verification.error,
      proofValid: verification.valid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpProofRejectedError(
      `Verification error: ${message}`,
      {
        timestamp: Date.now(),
        toolName: "verifyMcpProof",
        caller: "system",
        args: {},
        proof,
        allowed: false,
        callStack: new Error().stack || "",
        rejectionReason: `Verification error: ${message}`,
      }
    );
  }
}

/**
 * Wrap an MCP call with proof validation
 */
export async function wrapMcpCallWithProof<T>(
  toolName: string,
  args: Record<string, unknown>,
  caller: string,
  proof: ProofOfIntent,
  originalFn: () => Promise<T>
): Promise<McpCallResult<T>> {
  try {
    const secretKey = getControlPlaneSecretKey();
    const verification = verifyProof(proof, secretKey);

    if (!verification.valid) {
      return {
        success: false,
        error: `Proof validation failed: ${verification.error}`,
        proofValid: false,
      };
    }

    const data = await originalFn();
    return {
      success: true,
      data,
      proofValid: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpProofRejectedError(
      message,
      {
        timestamp: Date.now(),
        toolName,
        caller,
        args,
        proof,
        allowed: false,
        callStack: new Error().stack || "",
        rejectionReason: message,
      }
    );
  }
}
