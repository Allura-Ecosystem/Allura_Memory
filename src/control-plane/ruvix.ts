/**
 * RuVix ControlPlane - Core Orchestrator
 * 
 * The L1 controlPlane for Allura Agent-OS.
 * Provides proof-gated mutation and zero-trust enforcement.
 * 
 * 6 PRIMITIVES:
 * - mutate: State change (requires proof)
 * - attest: Cryptographic proof of state
 * - verify: Validate proof/attestation
 * - isolate: Tenant boundary enforcement
 * - sandbox: Execution isolation
 * - audit: Append-only trace logging
 * 
 * GOVERNANCE RULE: Allura governs. Runtimes execute. Curators promote.
 */

import {
  createTenantPolicies,
  DEFAULT_POLICIES,
  evaluatePolicies,
  evaluatePoliciesOrThrow,
  Policy,
  POLICY_ACTOR_VALIDATION,
  POLICY_AUDIT_TRAIL,
  POLICY_BUDGET_ENFORCEMENT,
  POLICY_DEBUG_ENFORCEMENT,
  POLICY_PERMISSION_TIER,
  POLICY_TENANT_ISOLATION,
  PolicyContext,
  PolicyEvaluationResult,
  policyRegistry,
} from "./policy";
import {
  createProof,
  getControlPlaneSecretKey,
  ProofClaims,
  ProofOfIntent,
  validateControlPlaneSecret,
  verifyProof,
  verifyProofOrThrow,
} from "./proof";
import {
  getAvailableSyscalls,
  MutationRequest,
  QueryRequest,
  syscall_attest,
  syscall_audit,
  syscall_budget,
  syscall_isolate,
  syscall_kill,
  syscall_mutate,
  syscall_policy,
  syscall_query,
  syscall_sandbox,
  syscall_spawn,
  syscall_trace,
  syscall_verify,
  SyscallContext,
  SyscallResult,
  syscallTable,
} from "./syscalls";

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE VERSION
// ─────────────────────────────────────────────────────────────────────────────

export const CONTROL_PLANE_VERSION = "1.0.0-alpha";
export const CONTROL_PLANE_BUILD = "ruvix-l1-core";

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ControlPlane initialization status
 */
export interface ControlPlaneStatus {
  /** Whether controlPlane is initialized */
  initialized: boolean;
  
  /** ControlPlane version */
  version: string;
  
  /** Secret key configured */
  secretConfigured: boolean;
  
  /** Available syscalls */
  syscalls: string[];
  
  /** Registered policies count */
  policies: number;
  
  /** Any initialization errors */
  errors: string[];
}

/**
 * Initialize the RuVix controlPlane
 * 
 * Must be called before any controlPlane operations.
 * Validates environment, loads policies, and prepares syscalls.
 * 
 * @returns ControlPlane status
 */
export function initializeControlPlane(): ControlPlaneStatus {
  const errors: string[] = [];
  
  // Check 1: Secret key
  const secretConfigured = validateControlPlaneSecret();
  if (!secretConfigured) {
    errors.push(
      "RUVIX_CONTROL_PLANE_SECRET environment variable is not configured. " +
      "ControlPlane cannot operate without cryptographic proof verification."
    );
  }
  
  // Check 2: Syscall table
  const syscalls = getAvailableSyscalls();
  if (syscalls.length !== 12) {
    errors.push(`Expected 12 syscalls, found ${syscalls.length}`);
  }
  
  // Check 3: Policy registry
  const policies = policyRegistry.getAll().length;
  if (policies < 5) {
    errors.push(`Expected at least 5 default policies, found ${policies}`);
  }
  
  return {
    initialized: errors.length === 0,
    version: CONTROL_PLANE_VERSION,
    secretConfigured,
    syscalls,
    policies,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE 6 PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PRIMITIVE 1: mutate
 * 
 * State change with proof-gated enforcement.
 * This is the LINCHPIN primitive - every state change flows through here.
 * 
 * @param request - Mutation request
 * @param context - Syscall context
 * @returns Mutation result
 */
export async function mutate(
  request: MutationRequest,
  context: SyscallContext
): Promise<SyscallResult> {
  return syscall_mutate(request, context);
}

/**
 * PRIMITIVE 2: attest
 * 
 * Create cryptographic proof of state.
 * 
 * @param state - State to attest
 * @param context - Syscall context
 * @returns Attestation result
 */
export async function attest(
  state: unknown,
  context: SyscallContext
): Promise<SyscallResult> {
  return syscall_attest(state, context);
}

/**
 * PRIMITIVE 3: verify
 * 
 * Validate proof or attestation.
 * 
 * @param attestation - Attestation to verify
 * @param context - Syscall context
 * @returns Verification result
 */
export async function verify(
  attestation: string,
  context: SyscallContext
): Promise<SyscallResult> {
  return syscall_verify(attestation, context);
}

/**
 * PRIMITIVE 4: isolate
 * 
 * Enforce tenant isolation boundary.
 * 
 * @param groupId - Group to isolate
 * @param context - Syscall context
 * @returns Isolation result
 */
export async function isolate(
  groupId: string,
  context: SyscallContext
): Promise<SyscallResult> {
  return syscall_isolate(groupId, context);
}

/**
 * PRIMITIVE 5: sandbox
 * 
 * Execute code in sandboxed environment.
 * 
 * @param code - Code to execute
 * @param context - Syscall context
 * @returns Sandbox result
 */
export async function sandbox(
  code: string,
  context: SyscallContext
): Promise<SyscallResult> {
  return syscall_sandbox(code, context);
}

/**
 * PRIMITIVE 6: audit
 * 
 * Query append-only audit trail.
 * 
 * @param query - Audit query
 * @param context - Syscall context
 * @returns Audit result
 */
export async function audit(
  query: { startTime?: number; endTime?: number; actor?: string; intent?: string },
  context: SyscallContext
): Promise<SyscallResult> {
  return syscall_audit(query, context);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSCALL DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a syscall by name
 * 
 * @param name - Syscall name
 * @param args - Syscall arguments
 * @returns Syscall result
 */
export async function syscall(
  name: string,
  ...args: unknown[]
): Promise<SyscallResult> {
  const fn = syscallTable[name];
  
  if (!fn) {
    return {
      success: false,
      error: `Unknown syscall: ${name}. Available: ${getAvailableSyscalls().join(", ")}`,
    };
  }
  
  return fn(...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full controlPlane API export
 */
export const RuVixControlPlane = {
  // Initialization
  initializeControlPlane,
  CONTROL_PLANE_VERSION,
  CONTROL_PLANE_BUILD,
  
  // 6 Primitives
  mutate,
  attest,
  verify,
  isolate,
  sandbox,
  audit,
  
  // Syscall dispatch
  syscall,
  getAvailableSyscalls,
  
  // Proof engine (exported for SDK wrapper)
  createProof,
  verifyProof,
  verifyProofOrThrow,
  getControlPlaneSecretKey,
  validateControlPlaneSecret,
  
  // Policy engine (exported for SDK wrapper)
  evaluatePolicies,
  evaluatePoliciesOrThrow,
  DEFAULT_POLICIES,
  policyRegistry,
  createTenantPolicies,
  
  // Policy constants
  POLICY_TENANT_ISOLATION,
  POLICY_BUDGET_ENFORCEMENT,
  POLICY_PERMISSION_TIER,
  POLICY_ACTOR_VALIDATION,
  POLICY_AUDIT_TRAIL,
  POLICY_DEBUG_ENFORCEMENT,
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default RuVixControlPlane;
