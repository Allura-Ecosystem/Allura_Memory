/**
 * RuVix ControlPlane - SDK Wrapper
 * 
 * Backward-compatible wrapper that exports the same interface as the old enforcers.
 * This allows gradual migration without rewriting all imports at once.
 * 
 * DEPRECATION NOTICE: This wrapper exists for migration only.
 * New code should import directly from ./ruvix
 */

import {
  RuVixControlPlane,
} from "./ruvix";
import type {
  MutationRequest,
  QueryRequest,
  SyscallContext,
  SyscallResult,
} from "./syscalls";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SDK configuration
 */
export interface SDKConfig {
  /** Default actor for all operations */
  actor: string;
  
  /** Default group_id for tenant isolation */
  group_id: string;
  
  /** Default permission tier */
  permission_tier?: "controlPlane" | "kernel" | "plugin" | "skill";
  
  /** Default budget cost estimate */
  default_budget_cost?: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Default SDK configuration
 */
const DEFAULT_CONFIG: SDKConfig = {
  actor: "system",
  group_id: "allura-system",
  permission_tier: "plugin",
  default_budget_cost: 10,
  debug: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// SDK CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RuVix SDK - Backward-compatible wrapper
 * 
 * Provides the same interface as the old EnforcedMcpClient
 * but routes all operations through the controlPlane.
 */
export class RuVixSDK {
  private config: SDKConfig;

  constructor(config: Partial<SDKConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // H-003 FIX: Verify controlPlane is initialized before use
    const status = RuVixControlPlane.initializeControlPlane();
    if (!status.initialized) {
      throw new Error(
        `ControlPlane initialization failed: ${status.errors.join('; ')}. ` +
        `Ensure RUVIX_CONTROL_PLANE_SECRET is configured.`
      );
    }
    
    // Validate group_id format
    if (!/^allura-[a-z0-9-]+$/.test(this.config.group_id)) {
      throw new Error(
        `Invalid group_id: "${this.config.group_id}". ` +
        `Must match pattern: allura-[a-z0-9-]+`
      );
    }
    
    if (this.config.debug) {
      console.log(`[RuVixSDK] Initialized with group_id: ${this.config.group_id}`);
      console.log(`[RuVixSDK] ControlPlane version: ${RuVixControlPlane.CONTROL_PLANE_VERSION}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // QUERY OPERATIONS (Backward-compatible with EnforcedMcpClient)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Execute a query against a target resource
   * 
   * @param target - Target table/collection
   * @param query - Query/filter
   * @param options - Query options
   * @returns Query result
   */
  async executeQuery<T = unknown>(
    target: string,
    query?: Record<string, unknown>,
    options?: { limit?: number; offset?: number }
  ): Promise<SyscallResult<T[]>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: this.config.default_budget_cost,
    };

    const request: QueryRequest = {
      target,
      query,
      limit: options?.limit,
      offset: options?.offset,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] executeQuery: ${target}`, { query, options });
    }

    const result = await RuVixControlPlane.syscall("query", request, context);
    return result as SyscallResult<T[]>;
  }

  /**
   * Insert a single record
   * 
   * @param target - Target table/collection
   * @param data - Data to insert
   * @returns Insert result
   */
  async insert<T = unknown>(
    target: string,
    data: Record<string, unknown>
  ): Promise<SyscallResult<T & { id: string }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: this.config.default_budget_cost,
    };

    const request: MutationRequest = {
      type: "insert",
      target,
      data,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] insert: ${target}`, { data });
    }

    const result = await RuVixControlPlane.syscall("mutate", request, context);
    return result as SyscallResult<T & { id: string }>;
  }

  /**
   * Update records matching a query
   * 
   * @param target - Target table/collection
   * @param data - Data to update
   * @param query - Query/filter to match records
   * @returns Update result
   */
  async update<T = unknown>(
    target: string,
    data: Partial<Record<string, unknown>>,
    query?: Record<string, unknown>
  ): Promise<SyscallResult<{ affected_rows: number }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: this.config.default_budget_cost,
    };

    const request: MutationRequest = {
      type: "update",
      target,
      data,
      query,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] update: ${target}`, { data, query });
    }

    const result = await RuVixControlPlane.syscall("mutate", request, context);
    return result as SyscallResult<{ affected_rows: number }>;
  }

  /**
   * Delete records matching a query
   * 
   * @param target - Target table/collection
   * @param query - Query/filter to match records
   * @returns Delete result
   */
  async deleteRecords(
    target: string,
    query?: Record<string, unknown>
  ): Promise<SyscallResult<{ affected_rows: number }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: this.config.default_budget_cost,
    };

    const request: MutationRequest = {
      type: "delete_op",
      target,
      data: {}, // Empty data for delete operations
      query,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] deleteRecords: ${target}`, { query });
    }

    const result = await RuVixControlPlane.syscall("mutate", request, context);
    return result as SyscallResult<{ affected_rows: number }>;
  }

  /**
   * Upsert a record (insert or update)
   * 
   * @param target - Target table/collection
   * @param data - Data to upsert
   * @param query - Query to match existing record
   * @returns Upsert result
   */
  async upsert<T = unknown>(
    target: string,
    data: Record<string, unknown>,
    query?: Record<string, unknown>
  ): Promise<SyscallResult<T & { id: string }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: this.config.default_budget_cost,
    };

    const request: MutationRequest = {
      type: "upsert",
      target,
      data,
      query,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] upsert: ${target}`, { data, query });
    }

    const result = await RuVixControlPlane.syscall("mutate", request, context);
    return result as SyscallResult<T & { id: string }>;
  }

  /**
   * Bulk insert multiple records
   * 
   * @param target - Target table/collection
   * @param records - Records to insert
   * @returns Bulk insert result
   */
  async bulkInsert<T = unknown>(
    target: string,
    records: Record<string, unknown>[]
  ): Promise<SyscallResult<{ inserted_count: number }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: (this.config.default_budget_cost ?? 10) * records.length,
    };

    const request: MutationRequest = {
      type: "bulk_insert",
      target,
      data: records,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] bulkInsert: ${target}`, { count: records.length });
    }

    const result = await RuVixControlPlane.syscall("mutate", request, context);
    return result as SyscallResult<{ inserted_count: number }>;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TRACE LOGGING (Backward-compatible with trace-middleware)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Log an execution trace
   * 
   * @param traceData - Trace data to log
   * @returns Trace result
   */
  async logTrace(
    traceData: {
      type: "contribution" | "decision" | "learning" | "error";
      agent_id: string;
      session_id: string;
      content: string;
      confidence?: number;
    }
  ): Promise<SyscallResult<{ trace_id: string }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
      budget_cost: 5,
      audit_context: traceData,
    };

    if (this.config.debug) {
      console.log(`[RuVixSDK] logTrace: ${traceData.type}`, traceData);
    }

    const result = await RuVixControlPlane.syscall("trace", traceData, context);
    return result as SyscallResult<{ trace_id: string }>;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BUDGET OPERATIONS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Check current budget
   * 
   * @returns Budget status
   */
  async checkBudget(): Promise<SyscallResult<{ remaining: number }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
    };

    const result = await RuVixControlPlane.syscall("budget", "check", 0, context);
    return result as SyscallResult<{ remaining: number }>;
  }

  /**
   * Allocate budget
   * 
   * @param amount - Amount to allocate
   * @returns Allocation result
   */
  async allocateBudget(amount: number): Promise<SyscallResult<{ remaining: number }>> {
    const context: SyscallContext = {
      actor: this.config.actor,
      group_id: this.config.group_id,
      permission_tier: this.config.permission_tier,
    };

    const result = await RuVixControlPlane.syscall("budget", "allocate", amount, context);
    return result as SyscallResult<{ remaining: number }>;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CONTROL_PLANE DIRECT ACCESS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get direct access to controlPlane for advanced operations
   * 
   * @returns RuVixControlPlane instance
   */
  getControlPlane() {
    return RuVixControlPlane;
  }

  /**
   * Get current configuration
   * 
   * @returns SDK configuration
   */
  getConfig(): SDKConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.debug) {
      console.log(`[RuVixSDK] Config updated:`, this.config);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE EXPORTS (Backward-compatible with old enforcer exports)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new SDK instance with default configuration
 * 
 * @param config - SDK configuration
 * @returns SDK instance
 */
export function createSDK(config: Partial<SDKConfig> = {}): RuVixSDK {
  return new RuVixSDK(config);
}

/**
 * Default SDK instance (uses DEFAULT_CONFIG)
 */
export const sdk = new RuVixSDK();

/**
 * Backward-compatible exports for migration
 */
export const executeQuery = sdk.executeQuery.bind(sdk);
export const insertRecord = sdk.insert.bind(sdk);
export const updateRecords = sdk.update.bind(sdk);
export const deleteRecords = sdk.deleteRecords.bind(sdk);
export const upsertRecord = sdk.upsert.bind(sdk);
export const bulkInsert = sdk.bulkInsert.bind(sdk);
export const logTrace = sdk.logTrace.bind(sdk);

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

// Type exports are available via the named exports above
