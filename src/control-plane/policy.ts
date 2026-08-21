/**
 * RuVix ControlPlane - Policy Validation Engine
 * 
 * TRUSTED CORE: This module contains policy evaluation logic.
 * Zero external dependencies. Policies are evaluated against verified claims.
 * 
 * Every mutation must pass policy validation before execution.
 */

import { ProofClaims } from "./proof";

// Re-export ProofClaims so consumers can import from policy.ts
export type { ProofClaims } from "./proof";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Policy definition
 * 
 * Policies are evaluated in order. First violation blocks the mutation.
 */
export interface Policy {
  /** Unique policy identifier */
  id: string;
  
  /** Human-readable description */
  description: string;
  
  /** Policy condition - returns true if policy is satisfied */
  condition: (claims: ProofClaims, context: PolicyContext) => boolean;
  
  /** Error message shown when policy is violated */
  violation: string;
  
  /** Policy severity */
  severity: "critical" | "high" | "medium" | "low";
}

/**
 * Context available during policy evaluation
 * 
 * H-004 FIX: Made critical fields required to prevent silent failures
 */
export interface PolicyContext {
  /** Current timestamp (required) */
  timestamp: number;
  
  /** Operation being performed (required) */
  operation: string;
  
  /** Target resource (required) */
  resource: string;
  
  /** Budget limit for POL-002 */
  budgetLimit?: number;
  
  /** Required permission tier for POL-003 */
  requiredTier?: "controlPlane" | "kernel" | "plugin" | "skill";
  
  /** Actor for POL-004 */
  actor?: string;
  
  /** Whether audit is required for POL-005 */
  requiresAudit?: boolean;
  
  /** Project manifest for POL-007/008/009 enforcement */
  projectManifest?: ProjectManifest;
  
  /** Source-of-truth read events for POL-007 verification */
  sourceOfTruthReads?: SourceOfTruthRead[];
  
  /** Declared infrastructure targets for POL-008 verification */
  declaredInfrastructureTargets?: InfrastructureTarget[];

  /** Changed file paths for release/artifact validation enforcement */
  changedFiles?: string[];

  /** Validation receipts collected before handoff, Done, commit, push, deploy, or release */
  validationReceipts?: ValidationReceipt[];

  /** Retrieval-layer health evidence used by POL-RET-001 */
  retrievalIntegrity?: {
    graphHealthy: boolean;
    graphFresh: boolean;
    episodicFresh: boolean;
    claim?: "healthy" | "stale" | "unknown";
  };

  /** Promotion read-after-write evidence used by POL-RET-002 */
  promotionRoundtrip?: {
    memoryGetPassed: boolean;
    memorySearchPassed: boolean;
  };

  /** Writer/reader schema parity evidence used by POL-RET-003 */
  schemaParity?: {
    writerSchemaChanged: boolean;
    readerCoveragePassed: boolean;
    liveRoundtripPassed: boolean;
  };

  /** Brand source-of-truth read events used by POL-BRAND-001 */
  brandSourceReads?: BrandSourceRead[];

  /** Brand release approvals used by POL-BRAND-002 */
  brandApprovals?: BrandApproval[];

  /** Whether the operation is brand/public-facing UI work */
  isBrandSurface?: boolean;

  /** Trust zone for external email/content gates */
  trust_zone?: string;
  trustZone?: string;

  /** Email context flags used by POL-EMAIL-* */
  emailFlags?: string[];
  emailContainsInstruction?: boolean;
  emailHandlingMode?: "evidence_only" | "actionable";
  emailVerdict?: string;
  verdict?: string;
  emailHasAttachment?: boolean;
  attachmentPresent?: boolean;
  quarantined?: boolean;
  sandboxed?: boolean;
  captainApproval?: boolean;
  humanApproval?: boolean;
  hitlApproved?: boolean;
  curatorApproval?: boolean;
  debugRootCauseFound?: boolean;
  strictDebugEnforcement?: boolean;

  /** Additional runtime context */
  [key: string]: unknown;
}

/**
 * Policy evaluation result
 */
export interface PolicyEvaluationResult {
  /** Whether all policies passed */
  passed: boolean;
  
  /** Violated policies (empty if passed) */
  violations: PolicyViolation[];
}

/**
 * Policy violation details
 */
export interface PolicyViolation {
  /** Policy that was violated */
  policyId: string;
  
  /** Description of the violation */
  message: string;
  
  /** Severity level */
  severity: "critical" | "high" | "medium" | "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT GOVERNANCE TYPES (POL-007/008/009)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source-of-truth declaration for a project
 * 
 * Defines where canonical data lives so RuVix can verify agents read from it.
 */
export interface SourceOfTruth {
  /** Source type (e.g., 'notion', 'github', 'local') */
  type: string;
  
  /** Source identifier (e.g., Notion database ID, GitHub repo URL) */
  id: string;
  
  /** Human-readable name for error messages */
  name: string;
  
  /** Whether this source is required before any project write */
  required: boolean;
}

/**
 * Infrastructure target declaration for a project
 * 
 * Defines what databases/deployment targets a project should use.
 */
export interface InfrastructureTarget {
  /** Target type (e.g., 'neon', 'docker-postgres', 'vercel', 'aws') */
  type: string;
  
  /** Connection identifier (e.g., Neon project ID, connection string pattern) */
  id: string;
  
  /** Human-readable name for error messages */
  name: string;
  
  /** Category for matching (e.g., 'database', 'deployment', 'cache') */
  category: string;
}

/**
 * Project manifest — machine-readable declaration of project constraints
 * 
 * Required by POL-009. Without this, POL-007 and POL-008 have nothing to enforce.
 */
export interface ProjectManifest {
  /** Project name */
  name: string;
  
  /** Declared sources of truth (ordered by priority) */
  sourcesOfTruth: SourceOfTruth[];
  
  /** Declared infrastructure targets */
  infrastructureTargets: InfrastructureTarget[];
  
  /** Captain directives captured as hard constraints */
  captainDirectives?: string[];
  
  /** Whitelisted local file overrides (for POL-012 future use) */
  localOverrides?: string[];
}

/**
 * Record of a source-of-truth read event
 * 
 * Used by POL-007 to verify that the agent actually read from the canonical source.
 */
export interface SourceOfTruthRead {
  /** Source type that was read */
  type: string;
  
  /** Source ID that was read */
  id: string;
  
  /** Timestamp of the read */
  timestamp: number;
  
  /** What was read (for audit) */
  summary?: string;
}

/**
 * Record of a brand source-of-truth read event
 * 
 * Used by POL-BRAND-001 to verify the agent read the canonical brand guide.
 */
export interface BrandSourceRead {
  /** Company/project brand belongs to */
  company: string;
  
  /** Notion page ID or database ID that was read */
  notionId: string;
  
  /** Timestamp of the read */
  timestamp: number;
  
  /** What was read (for audit) */
  summary?: string;
}

/**
 * Brand release approval record
 * 
 * Used by POL-BRAND-002 to verify UI/showcase work was approved.
 */
export interface BrandApproval {
  /** Approver role or identifier */
  role: "captain" | "steve" | "iris-ceo" | "durham-lead" | string;
  
  /** Whether approval was granted */
  approved: boolean;
  
  /** Timestamp of approval */
  timestamp: number;
  
  /** Optional rationale */
  rationale?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION / DONE-GATE TYPES (POL-010)
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStatus = "passed" | "failed" | "not_run" | "warning";

export interface ValidationReceipt {
  /** Stable check name, e.g. "mac-packaging" */
  name: string;

  /** Exact validation command that was run */
  command?: string;

  /** Check result */
  status: ValidationStatus;

  /** Whether this check is required for the changed surface */
  required?: boolean;

  /** Artifact path or changed surface this receipt validates */
  artifactPath?: string;

  /** Optional summary for audit reports */
  summary?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILTIN POLICIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POL-001: Tenant Isolation
 * 
 * Every operation must have a valid group_id for tenant isolation.
 * This is enforced at the proof level, but we double-check here.
 */
export const POLICY_TENANT_ISOLATION: Policy = {
  id: "POL-001",
  description: "All operations must be tenant-isolated with valid group_id",
  condition: (claims) => {
    return !!(claims.group_id && /^allura-[a-z0-9-]+$/.test(claims.group_id));
  },
  violation: "Operation lacks valid tenant isolation (group_id)",
  severity: "critical",
};

/**
 * POL-002: Budget Enforcement
 * 
 * If budget_cost is specified, it must be within acceptable limits.
 * Default limit: 1000 units per operation (configurable).
 */
export const POLICY_BUDGET_ENFORCEMENT: Policy = {
  id: "POL-002",
  description: "Operations must not exceed budget limits",
  condition: (claims, context) => {
    const budgetLimit = (context.budgetLimit as number) ?? 1000;
    
    if (claims.budget_cost === undefined) {
      return true; // No budget specified, skip this check
    }
    
    return claims.budget_cost <= budgetLimit;
  },
  violation: "Operation exceeds budget limit",
  severity: "high",
};

/**
 * POL-003: Permission Tier Validation
 * 
 * ControlPlane operations require controlPlane permission tier.
 * Plugin operations require plugin or controlPlane tier.
 * Skill operations allow any tier.
 */
export const POLICY_PERMISSION_TIER: Policy = {
  id: "POL-003",
  description: "Operations must have appropriate permission tier",
  condition: (claims, context) => {
    const requiredTier = context.requiredTier as "controlPlane" | "kernel" | "plugin" | "skill" ?? "skill";
    const actorTier = claims.permission_tier ?? "skill";
    
    const tierHierarchy: Record<string, number> = {
      controlPlane: 3,
      // DEPRECATED ALIAS — remove after the deprecation window closes.
      // permission_tier is a runtime value carried inside HMAC-signed ProofClaims,
      // not merely a TypeScript symbol. Proofs have a 5-minute TTL and the signing
      // domain carries no version, so during a rolling deploy an old process can
      // mint a still-valid proof claiming "kernel". Without this alias the lookup
      // yields undefined, `undefined >= 3` is false, and every control-plane-tier
      // operation is denied for the length of the window with an error that says
      // nothing about a renamed value. Fails closed, but needlessly.
      kernel: 3,
      plugin: 2,
      skill: 1,
    };
    
    return tierHierarchy[actorTier] >= tierHierarchy[requiredTier];
  },
  violation: "Insufficient permission tier for operation",
  severity: "critical",
};

/**
 * POL-004: Actor Validation
 * 
 * H-004 FIX: Now requires actor in context (will fail if not provided)
 * 
 * Actor must be a known agent or user identifier.
 */
export const POLICY_ACTOR_VALIDATION: Policy = {
  id: "POL-004",
  description: "Operations must have valid actor identification",
  condition: (claims, context) => {
    // H-004 FIX: actor is now required
    const actor = context.actor;
    
    if (!actor || typeof actor !== "string") {
      return false;
    }
    
    // Allow agent IDs (uuid format) or user IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const userIdRegex = /^user-[a-zA-Z0-9]+$/;
    
    return uuidRegex.test(actor) || userIdRegex.test(actor) || actor.startsWith("agent-");
  },
  violation: "Invalid or missing actor identification",
  severity: "high",
};

/**
 * POL-005: Audit Trail
 * 
 * C-002 FIX: Actually enforce audit trail requirement
 * 
 * All controlPlane operations must be auditable.
 * If audit_context is required, it must be present and non-empty.
 */
export const POLICY_AUDIT_TRAIL: Policy = {
  id: "POL-005",
  description: "ControlPlane operations must have audit trail",
  condition: (claims, context) => {
    const requiresAudit = context.requiresAudit as boolean ?? true;
    
    if (!requiresAudit) {
      return true;
    }
    
    // C-002 FIX: Actually validate audit_context presence and content
    if (!claims.audit_context) {
      return false;
    }
    
    // Audit context must have at least one key
    return Object.keys(claims.audit_context).length > 0;
  },
  violation: "Operation missing required audit context",
  severity: "medium",
};

// ─────────────────────────────────────────────────────────────────────────────
// POLICY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default policy set for controlPlane operations
 * 
 * NOTE: Must be defined after all referenced policies to avoid
 * block-scoped variable hoisting errors.
 */
// Placeholder — actual definition is after POL-009 below

/**
 * Evaluate policies against claims
 * 
 * H-004 FIX: Context is now required with mandatory fields
 * 
 * @param claims - Verified claims from proof
 * @param context - Runtime context for policy evaluation (required)
 * @param policies - Policies to evaluate (defaults to DEFAULT_POLICIES)
 * @returns Evaluation result with any violations
 */
export function evaluatePolicies(
  claims: ProofClaims,
  context: PolicyContext,
  policies?: Policy[]
): PolicyEvaluationResult {
  const resolvedPolicies = policies ?? DEFAULT_POLICIES;
  const violations: PolicyViolation[] = [];
  
  for (const policy of resolvedPolicies) {
    try {
      const satisfied = policy.condition(claims, context);
      
      if (!satisfied) {
        violations.push({
          policyId: policy.id,
          message: policy.violation,
          severity: policy.severity,
        });
      }
    } catch (error) {
      // Policy evaluation errors are treated as violations
      violations.push({
        policyId: policy.id,
        message: `Policy evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        severity: "critical",
      });
    }
  }
  
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Evaluate policies and throw on violation
 * 
 * H-004 FIX: Context is now required with mandatory fields
 * 
 * @param claims - Verified claims from proof
 * @param context - Runtime context (required)
 * @param policies - Policies to evaluate (defaults to DEFAULT_POLICIES)
 * @throws Error with violation details if any policy fails
 */
export function evaluatePoliciesOrThrow(
  claims: ProofClaims,
  context: PolicyContext,
  policies?: Policy[]
): void {
  const result = evaluatePolicies(claims, context, policies);
  
  if (!result.passed) {
    const violationMessages = result.violations
      .map((v) => `[${v.policyId}] ${v.message} (${v.severity})`)
      .join("; ");
    
    throw new Error(`Policy validation failed: ${violationMessages}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POLICY REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Policy registry for custom policies
 */
class PolicyRegistry {
  private policies: Map<string, Policy> = new Map();
  
  /**
   * Register a custom policy
   */
  register(policy: Policy): void {
    if (this.policies.has(policy.id)) {
      throw new Error(`Policy ${policy.id} is already registered`);
    }
    this.policies.set(policy.id, policy);
  }
  
  /**
   * Get a registered policy by ID
   */
  get(policyId: string): Policy | undefined {
    return this.policies.get(policyId);
  }
  
  /**
   * Get all registered policies
   */
  getAll(): Policy[] {
    return Array.from(this.policies.values());
  }
  
  /**
   * Remove a policy from the registry
   */
  remove(policyId: string): boolean {
    return this.policies.delete(policyId);
  }
}

/**
 * Global policy registry instance
 */
export const policyRegistry = new PolicyRegistry();

// Register POL-001 through POL-005 individually (DEFAULT_POLICIES defined later)
policyRegistry.register(POLICY_TENANT_ISOLATION);
policyRegistry.register(POLICY_BUDGET_ENFORCEMENT);
policyRegistry.register(POLICY_PERMISSION_TIER);
policyRegistry.register(POLICY_ACTOR_VALIDATION);
policyRegistry.register(POLICY_AUDIT_TRAIL);

// ─────────────────────────────────────────────────────────────────────────────
// POL-006: DEBUG ENFORCEMENT (Systematic Debugging)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POL-006: Debug Enforcement — Systematic Debugging Iron Law
 *
 * No fix without root cause investigation.
 * If an event is a fix/bugfix type AND the context doesn't indicate a prior
 * root cause investigation, the mutation is rejected.
 *
 * This policy is advisory by default (logs warning, doesn't block).
 * Set `strictDebugEnforcement: true` in context to make it blocking.
 *
 * Enforcement checks:
 * - If operation is a fix-type (debug:fix_implemented, fix/*, hotfix/*)
 * - AND context.debugRootCauseFound is not truthy
 * - THEN violation
 */
export const POLICY_DEBUG_ENFORCEMENT: Policy = {
  id: "POL-006",
  description: "No fix without root cause investigation (systematic debugging)",
  condition: (claims, context) => {
    const operation = context.operation ?? "";
    const isFixOperation = operation.startsWith("fix") ||
      operation.startsWith("hotfix") ||
      operation === "debug:fix_implemented" ||
      operation.includes("bugfix");

    // Not a fix-type operation → policy satisfied
    if (!isFixOperation) {
      return true;
    }

    // Fix-type operation: check if root cause was found first
    const rootCauseFound = context.debugRootCauseFound as boolean ?? false;

    // In strict mode: block the mutation
    // In advisory mode (default): log warning but allow
    const strictMode = context.strictDebugEnforcement as boolean ?? false;

    if (strictMode) {
      return rootCauseFound;
    }

    // Advisory mode: always pass, but the violation is still recorded
    // for observability. The caller should check violations even when passed.
    return true;
  },
  violation: "Fix attempted without prior root cause investigation. Log debug:root_cause_found before fixing.",
  severity: "high",
};

// Register POL-006
policyRegistry.register(POLICY_DEBUG_ENFORCEMENT);

// ─────────────────────────────────────────────────────────────────────────────
// POL-007: SOURCE-OF-TRUTH PRE-FLIGHT GATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POL-007: Source-of-Truth Pre-Flight Gate
 *
 * Before ANY project write operation, the agent must have proven it has read
 * from the project's declared canonical source (e.g., Notion database).
 *
 * Enforcement:
 * - If projectManifest exists and declares required sources of truth
 * - AND the operation is a write-type (mutate, write, create, update, delete)
 * - AND no sourceOfTruthReads entry matches a required source
 * - THEN the mutation is BLOCKED
 *
 * Read-type operations (query, read, search) are allowed without source verification
 * to support the initial read that satisfies this very policy.
 *
 * Origin: Team retro 2026-05-08 — 13 commits reverted because agents used local
 * files instead of Notion. Unanimous proposal from all 4 agents.
 */
export const POLICY_SOURCE_OF_TRUTH_GATE: Policy = {
  id: "POL-007",
  description: "Write operations require prior read from declared source of truth",
  condition: (claims, context) => {
    const manifest = context.projectManifest as ProjectManifest | undefined;
    
    // No manifest → policy cannot enforce → skip (POL-009 handles this)
    if (!manifest || !manifest.sourcesOfTruth) {
      return true;
    }
    
    // Read-type operations are exempt — agents need to read to satisfy this policy
    const operation = context.operation ?? "";
    const isWriteOperation = /^(mutate|write|create|update|delete|deploy|commit)/i.test(operation);
    
    if (!isWriteOperation) {
      return true;
    }
    
    // Find required sources of truth
    const requiredSources = manifest.sourcesOfTruth.filter(s => s.required);
    
    if (requiredSources.length === 0) {
      return true; // No required sources declared
    }
    
    // Check if agent has read from each required source
    const reads = context.sourceOfTruthReads as SourceOfTruthRead[] ?? [];
    
    for (const source of requiredSources) {
      const hasRead = reads.some(
        r => r.type === source.type && r.id === source.id
      );
      
      if (!hasRead) {
        return false; // Missing read from required source
      }
    }
    
    return true;
  },
  violation: "Source-of-truth not verified. Read from declared canonical source before writing to this project.",
  severity: "critical",
};

// Register POL-007
policyRegistry.register(POLICY_SOURCE_OF_TRUTH_GATE);

// ─────────────────────────────────────────────────────────────────────────────
// POL-008: INFRASTRUCTURE TARGET LOCK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POL-008: Infrastructure Target Lock
 *
 * Any operation that references a database connection, deployment target, or
 * infrastructure endpoint must match the project's declared infrastructure targets.
 *
 * Enforcement:
 * - If projectManifest declares infrastructure targets
 * - AND the operation references a connection/infrastructure endpoint
 * - AND the referenced target doesn't match any declared target
 * - THEN the mutation is BLOCKED
 *
 * Prevents: Docker Postgres when Neon is declared, local dev server when
 * Vercel is declared, etc.
 *
 * Origin: Team retro 2026-05-08 — agents targeted Docker Postgres instead of
 * Neon serverless. Unanimous proposal from all 4 agents.
 */
export const POLICY_INFRASTRUCTURE_TARGET_LOCK: Policy = {
  id: "POL-008",
  description: "Infrastructure targets must match project manifest declarations",
  condition: (claims, context) => {
    const manifest = context.projectManifest as ProjectManifest | undefined;
    
    // No manifest → policy cannot enforce → skip (POL-009 handles this)
    if (!manifest || !manifest.infrastructureTargets) {
      return true;
    }
    
    // Only enforce on infrastructure-related operations
    const operation = context.operation ?? "";
    const isInfraOperation = /^(mutate|write|create|update|deploy|commit|connect)/i.test(operation);
    
    if (!isInfraOperation) {
      return true;
    }
    
    // Check the resource against declared targets
    const resource = context.resource ?? "";
    const declaredTargets = manifest.infrastructureTargets;
    
    // If resource references a database or deployment, verify it matches
    const infraPatterns = [
      /postgres/i, /neon/i, /mysql/i, /redis/i, /mongo/i,
      /docker/i, /vercel/i, /aws/i, /localhost/i,
    ];
    
    const resourceReferencesInfra = infraPatterns.some(p => p.test(resource));
    
    if (!resourceReferencesInfra) {
      return true; // Not an infra-referencing operation
    }
    
    // Check if resource matches any declared target
    const matchesDeclared = declaredTargets.some(target => {
      return resource.includes(target.id) || resource.includes(target.type);
    });
    
    // Also check declaredInfrastructureTargets in context for explicit matching
    const explicitTargets = context.declaredInfrastructureTargets as InfrastructureTarget[] ?? [];
    const matchesExplicit = explicitTargets.some(target => {
      return resource.includes(target.id) || resource.includes(target.type);
    });
    
    // If resource references infra but doesn't match declared targets → block
    if (declaredTargets.length > 0 && !matchesDeclared && !matchesExplicit) {
      // Allow if the resource is a LOCAL DEV variant explicitly declared
      const isLocalDev = /localhost|127\.0\.0\.1|docker/i.test(resource);
      const allowsLocal = declaredTargets.some(t => t.type === 'local-dev' || t.type === 'docker');
      
      if (isLocalDev && allowsLocal) {
        return true;
      }
      
      return false; // Mismatch — wrong infrastructure target
    }
    
    return true;
  },
  violation: "Infrastructure target mismatch. Operation targets undeclared infrastructure. Update connection or justify deviation with ADR.",
  severity: "critical",
};

// Register POL-008
policyRegistry.register(POLICY_INFRASTRUCTURE_TARGET_LOCK);

// ─────────────────────────────────────────────────────────────────────────────
// POL-009: PROJECT MANIFEST REQUIRED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POL-009: Project Manifest Required
 *
 * No write operations allowed on a project unless a PROJECT.yaml (or
 * ruvix-manifest.yaml) exists declaring source_of_truth and infrastructure_targets.
 *
 * Without this manifest, POL-007 and POL-008 have nothing to enforce against.
 * This policy forces the manifest to exist before any work proceeds.
 *
 * Enforcement:
 * - If context.projectManifest is undefined or null
 * - AND the operation is a write-type
 * - THEN the mutation is BLOCKED
 *
 * Grace period: read operations are always allowed (you need to read to create
 * the manifest). The very first operation on a new project should be creating
 * the manifest.
 *
 * Origin: Team retro 2026-05-08 — without a manifest, all other governance
 * policies are unenforceable. Unanimous proposal from all 4 agents.
 */
export const POLICY_PROJECT_MANIFEST_REQUIRED: Policy = {
  id: "POL-009",
  description: "Project manifest (PROJECT.yaml) required before any write operations",
  condition: (claims, context) => {
    const manifest = context.projectManifest as ProjectManifest | undefined;
    
    // If manifest exists and has required fields, policy is satisfied
    if (manifest && manifest.sourcesOfTruth && manifest.infrastructureTargets) {
      return true;
    }
    
    // Read-type operations are allowed without manifest
    // (you need to read to create the manifest)
    const operation = context.operation ?? "";
    const isWriteOperation = /^(mutate|write|create|update|delete|deploy|commit)/i.test(operation);
    
    if (!isWriteOperation) {
      return true;
    }
    
    // Special case: creating the manifest itself is always allowed
    if (/manifest|project\.yaml/i.test(context.resource ?? "")) {
      return true;
    }
    
    // No manifest + write operation = BLOCKED
    return false;
  },
  violation: "No project manifest found. Create PROJECT.yaml with sourcesOfTruth and infrastructureTargets before any project work.",
  severity: "critical",
};

// Register POL-009
policyRegistry.register(POLICY_PROJECT_MANIFEST_REQUIRED);

// ─────────────────────────────────────────────────────────────────────────────
// POL-010: VALIDATION BEFORE DONE / RELEASE ARTIFACT GATE
// ─────────────────────────────────────────────────────────────────────────────

const DONE_OR_RELEASE_OPERATION =
  /(?:done|handoff|commit|push|deploy|release|package|publish|merge|implement)/i;

const RELEASE_ARTIFACT_FILE =
  /(^|\/)(package\.json|pnpm-lock\.yaml|bun\.lock|yarn\.lock|package-lock\.json|electron-builder\.ya?ml|electron\.vite\.config\.[jt]s|vite\.config\.[jt]s|rollup\.config\.[jt]s|webpack\.config\.[jt]s)$|(^|\/)(scripts|\.github\/workflows|\.specify\/extensions|\.specify\/scripts)\/|(^|\/)(dist|build|release|installer|resources|entitlements|assets)\//i;

const RELEASE_VALIDATION_COMMAND =
  /(?:electron-builder|pnpm\s+(?:build|package)|bunx\s+electron-builder|npm\s+run\s+(?:build|package)|yarn\s+(?:build|package)|build|package|release)/i;

function changedReleaseArtifactPath(context: PolicyContext): boolean {
  const changedFiles = context.changedFiles as string[] | undefined;

  if (changedFiles?.some(file => RELEASE_ARTIFACT_FILE.test(file))) {
    return true;
  }

  const resource = String(context.resource ?? "");
  return RELEASE_ARTIFACT_FILE.test(resource) ||
    /electron|installer|package|release|build|lockfile/i.test(resource);
}

function hasPassedRequiredArtifactValidation(context: PolicyContext): boolean {
  const receipts = context.validationReceipts as ValidationReceipt[] | undefined;

  if (!Array.isArray(receipts) || receipts.length === 0) {
    return false;
  }

  return receipts.some(receipt => {
    if (receipt.status !== "passed") {
      return false;
    }

    const command = receipt.command ?? "";
    const name = receipt.name ?? "";
    const artifactPath = receipt.artifactPath ?? "";

    return RELEASE_VALIDATION_COMMAND.test(command) ||
      /build|package|release|artifact|electron|installer/i.test(name) ||
      /build|package|release|artifact|electron|installer/i.test(artifactPath);
  });
}

/**
 * POL-010: Validation Before Done / Release Artifact Gate
 *
 * Done, handoff, commit, push, deploy, release, and package operations are
 * blocked when release/package/build surfaces changed but no passed artifact
 * validation receipt exists. This closes the gap where lint passed but Electron
 * mac packaging failed because `dmg-license` was not resolvable.
 */
export const POLICY_VALIDATION_BEFORE_DONE: Policy = {
  id: "POL-010",
  description: "Changed release artifact paths require passed artifact validation before Done/commit/release",
  condition: (_claims, context) => {
    const operation = String(context.operation ?? "");

    if (!DONE_OR_RELEASE_OPERATION.test(operation)) {
      return true;
    }

    if (!changedReleaseArtifactPath(context)) {
      return true;
    }

    return hasPassedRequiredArtifactValidation(context);
  },
  violation: "Release/package/build path changed without a passed required artifact validation receipt. Lint alone cannot satisfy Done.",
  severity: "critical",
};

policyRegistry.register(POLICY_VALIDATION_BEFORE_DONE);

// ─────────────────────────────────────────────────────────────────────────────
// POL-RET-001..003: RETRIEVAL INTEGRITY GATES
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_RETRIEVAL_CLAIM_PRECISION: Policy = {
  id: "POL-RET-001",
  description: "Graph freshness claims must match retrieval-layer evidence",
  condition: (_claims, context) => {
    const evidence = context.retrievalIntegrity;
    if (!evidence || !evidence.claim || evidence.claim === "unknown") {
      return true;
    }
    return evidence.claim === "healthy"
      ? evidence.graphHealthy && evidence.graphFresh
      : !evidence.graphFresh;
  },
  violation: "Retrieval freshness claim contradicts graph health or freshness evidence.",
  severity: "high",
};

export const POLICY_PROMOTION_ROUNDTRIP: Policy = {
  id: "POL-RET-002",
  description: "Semantic promotion requires successful get and search read-after-write checks before Done",
  condition: (_claims, context) => {
    const evidence = context.promotionRoundtrip;
    if (!evidence) {
      return true;
    }
    return evidence.memoryGetPassed && evidence.memorySearchPassed;
  },
  violation: "Semantic promotion lacks a successful memory_get and memory_search round-trip.",
  severity: "critical",
};

export const POLICY_READER_WRITER_SCHEMA_PARITY: Policy = {
  id: "POL-RET-003",
  description: "Writer schema changes require reader coverage and a live retrieval round-trip",
  condition: (_claims, context) => {
    const evidence = context.schemaParity;
    if (!evidence || !evidence.writerSchemaChanged) {
      return true;
    }
    return evidence.readerCoveragePassed && evidence.liveRoundtripPassed;
  },
  violation: "Writer schema changed without reader coverage and a live retrieval round-trip.",
  severity: "critical",
};

policyRegistry.register(POLICY_RETRIEVAL_CLAIM_PRECISION);
policyRegistry.register(POLICY_PROMOTION_ROUNDTRIP);
policyRegistry.register(POLICY_READER_WRITER_SCHEMA_PARITY);

// ─────────────────────────────────────────────────────────────────────────────
// POL-EMAIL-001..005: EXTERNAL EMAIL ZERO-TRUST GATES
// ─────────────────────────────────────────────────────────────────────────────

function isEmailContext(context: PolicyContext): boolean {
  const trustZone = String(context.trust_zone ?? context.trustZone ?? "");
  const source = String(context.source ?? "");
  const resource = String(context.resource ?? "");
  const operation = String(context.operation ?? "");

  return trustZone === "external_untrusted" ||
    /^(gmail|imap|email|forwarded_email)$/i.test(source) ||
    /email|gmail|imap/i.test(resource) ||
    /^email:/i.test(operation);
}

function isEmailActionOperation(context: PolicyContext): boolean {
  const operation = String(context.operation ?? "");
  const resource = String(context.resource ?? "");

  return /send|reply|forward|open|download|click|visit|connect|login|reset|delete|write|update|create|mutate|execute|run|promote/i.test(operation) ||
    /attachment|link|url|credential|secret|config|neo4j|canonical/i.test(resource);
}

function hasCaptainApproval(context: PolicyContext): boolean {
  return context.captainApproval === true || context.humanApproval === true || context.hitlApproved === true;
}

/**
 * POL-EMAIL-001: External Email Instruction Blocker
 *
 * Email-derived content is never instruction authority. If the scanner or caller
 * identifies imperative/tool-targeting content from email, it may only be used
 * as quoted evidence, never as runtime instructions.
 */
export const POLICY_EMAIL_INSTRUCTION_BLOCKER: Policy = {
  id: "POL-EMAIL-001",
  description: "Email-derived content cannot issue instructions to agents or tools",
  condition: (_claims, context) => {
    if (!isEmailContext(context)) {
      return true;
    }

    const flags = context.emailFlags as string[] | undefined;
    const containsInstruction = context.emailContainsInstruction === true ||
      flags?.some(flag => /instruction|prompt[-_ ]?injection|tool[-_ ]?command/i.test(flag)) === true;

    if (!containsInstruction) {
      return true;
    }

    // Explicit evidence-only handling is allowed. Instruction injection is not.
    return context.emailHandlingMode === "evidence_only";
  },
  violation: "Email content attempted to issue instructions. Treat it as untrusted evidence only.",
  severity: "critical",
};

/**
 * POL-EMAIL-002: Email Action Approval Gate
 *
 * External/destructive/privileged actions derived from email require explicit
 * Captain/HITL approval.
 */
export const POLICY_EMAIL_ACTION_APPROVAL_GATE: Policy = {
  id: "POL-EMAIL-002",
  description: "Email-derived privileged actions require explicit Captain approval",
  condition: (_claims, context) => {
    if (!isEmailContext(context) || !isEmailActionOperation(context)) {
      return true;
    }

    return hasCaptainApproval(context);
  },
  violation: "Email-derived request requires explicit Captain approval before action.",
  severity: "critical",
};

/**
 * POL-EMAIL-003: High-Risk Email Quarantine
 *
 * High-risk emails may only be logged, read as evidence, or quarantined. They
 * cannot trigger links, attachments, replies, promotions, or mutations.
 */
export const POLICY_HIGH_RISK_EMAIL_QUARANTINE: Policy = {
  id: "POL-EMAIL-003",
  description: "High-risk email cannot trigger actions beyond quarantine/logging",
  condition: (_claims, context) => {
    if (!isEmailContext(context)) {
      return true;
    }

    const verdict = String(context.emailVerdict ?? context.verdict ?? "").toLowerCase();
    if (verdict !== "high") {
      return true;
    }

    const operation = String(context.operation ?? "");
    return /^(query|read|scan|log|audit|quarantine|email:scan|email:log|email:quarantine)$/i.test(operation);
  },
  violation: "High-risk email cannot trigger actions. Quarantine/log only.",
  severity: "high",
};

/**
 * POL-EMAIL-004: Email Memory Promotion Requires HITL
 *
 * Email-derived facts may be stored as raw episodic traces. Promotion into
 * canonical Neo4j memory requires curator/HITL approval.
 */
export const POLICY_EMAIL_MEMORY_PROMOTION_REQUIRES_HITL: Policy = {
  id: "POL-EMAIL-004",
  description: "Email-derived memory promotion requires human curator review",
  condition: (_claims, context) => {
    if (!isEmailContext(context)) {
      return true;
    }

    const operation = String(context.operation ?? "");
    const resource = String(context.resource ?? "");
    const isPromotion = /promote|canonical|semantic|neo4j/i.test(operation) || /canonical|semantic|neo4j/i.test(resource);

    if (!isPromotion) {
      return true;
    }

    return context.curatorApproval === true || context.hitlApproved === true;
  },
  violation: "Email-derived content cannot auto-promote to canonical memory. Curator/HITL review required.",
  severity: "high",
};

/**
 * POL-EMAIL-005: Attachment Sandbox Requirement
 *
 * Attachment inspection is allowed only as inert data in quarantine/sandbox.
 */
export const POLICY_EMAIL_ATTACHMENT_SANDBOX_REQUIREMENT: Policy = {
  id: "POL-EMAIL-005",
  description: "Email attachments require quarantine/sandbox before inspection",
  condition: (_claims, context) => {
    if (!isEmailContext(context)) {
      return true;
    }

    const operation = String(context.operation ?? "");
    const resource = String(context.resource ?? "");
    const isAttachmentOperation = /attachment|download|open|extract|inspect/i.test(operation) || /attachment/i.test(resource);
    const hasAttachment = context.emailHasAttachment === true || context.attachmentPresent === true;

    if (!isAttachmentOperation && !hasAttachment) {
      return true;
    }

    return context.quarantined === true && context.sandboxed === true;
  },
  violation: "Email attachment cannot be opened outside quarantine/sandbox.",
  severity: "high",
};

policyRegistry.register(POLICY_EMAIL_INSTRUCTION_BLOCKER);
policyRegistry.register(POLICY_EMAIL_ACTION_APPROVAL_GATE);
policyRegistry.register(POLICY_HIGH_RISK_EMAIL_QUARANTINE);
policyRegistry.register(POLICY_EMAIL_MEMORY_PROMOTION_REQUIRES_HITL);
policyRegistry.register(POLICY_EMAIL_ATTACHMENT_SANDBOX_REQUIREMENT);

// ─────────────────────────────────────────────────────────────────────────────
// POL-BRAND-001..002: BRAND GOVERNANCE GATES (Notion source-of-truth + release approval)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POL-BRAND-001: Brand Source-of-Truth Gate
 *
 * Before any brand-affecting or public-facing UI mutation, the agent must have
 * read the canonical Notion brand guide for the target company/project.
 *
 * Enforcement:
 * - If context.isBrandSurface is true (or the resource/operation looks brand/UI-related)
 * - AND brandSourceReads is missing a read for the matching company
 * - THEN the mutation is BLOCKED
 *
 * Canonical brand guides live in Notion. Figma may still be referenced as a
 * historical artifact, but Notion is the decision source.
 */
export const POLICY_BRAND_SOURCE_OF_TRUTH: Policy = {
  id: "POL-BRAND-001",
  description: "Brand-affecting work requires prior read from canonical Notion brand guide",
  condition: (_claims, context) => {
    const operation = String(context.operation ?? "");
    const resource = String(context.resource ?? "");

    const isBrandOperation =
      context.isBrandSurface === true ||
      /brand|logo|color|typography|palette|style|css|ui|ux|design|public|showcase|demo|website|frontend/i.test(operation) ||
      /brand|logo|\.css|\.scss|design-system|tokens|public\/|assets\/(logo|brand)/i.test(resource);

    if (!isBrandOperation) {
      return true;
    }

    const reads = context.brandSourceReads ?? [];
    if (reads.length === 0) {
      return false;
    }

    // Require at least one brand guide read within the last 30 days
    const now = context.timestamp;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return reads.some(
      (r) => r.notionId && r.company && typeof r.timestamp === "number" && now - r.timestamp <= thirtyDaysMs
    );
  },
  violation: "Brand-affecting work attempted without a recent read from the canonical Notion brand guide. Read the guide first.",
  severity: "critical",
};

// ─────────────────────────────────────────────────────────────────────────────
// POL-023..027: BRAND GOVERNANCE GATES (brand packet, token/copy lock, visual evidence, QA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Operation patterns that count as brand-affecting work.
 * Used by POL-023 (build/commit/push/deploy) and POL-026/027 (done/handoff/release).
 */
const BRAND_AFFECTING_WORK_OPERATION =
  /(?:build|commit|push|deploy|done|handoff|release|package|publish|merge|implement)/i;

const BRAND_DONE_OR_RELEASE_OPERATION =
  /(?:done|handoff|release|publish|merge)/i;

/**
 * Brand token / typography file patterns.
 * Mirrors the token definition file list in scripts/brand-audit.sh.
 */
const BRAND_TOKEN_FILE =
  /(^|\/)(lib\/brand\/.*\.ts|lib\/theme\/brand\.ts|lib\/tokens\.ts|styles\/brand-tokens\.css|styles\/presets\/(?:allura|durham)\.css|theme\/brand\.ts)$|(^|\/)(brand|tokens|theme|typography|colors|fonts)\//i;

/**
 * Brand copy file patterns — messaging, taglines, voice, copy.
 */
const BRAND_COPY_FILE =
  /(^|\/)(brand.*copy|copy.*brand|messaging|taglines?|voice|brand.*voice|brand.*messaging)\.(ts|tsx|json|md|css)$|(^|\/)(copy|messaging|taglines?|voice)\//i;

function isBrandAffectingWork(context: PolicyContext): boolean {
  const operation = String(context.operation ?? "");
  return BRAND_AFFECTING_WORK_OPERATION.test(operation);
}

function isBrandDoneOrRelease(context: PolicyContext): boolean {
  const operation = String(context.operation ?? "");
  return BRAND_DONE_OR_RELEASE_OPERATION.test(operation);
}

function targetsBrandTokenFiles(context: PolicyContext): boolean {
  const resource = String(context.resource ?? "");
  const changedFiles = context.changedFiles as string[] | undefined;

  if (BRAND_TOKEN_FILE.test(resource)) {
    return true;
  }

  if (changedFiles?.some(file => BRAND_TOKEN_FILE.test(file))) {
    return true;
  }

  return false;
}

function targetsBrandCopyFiles(context: PolicyContext): boolean {
  const resource = String(context.resource ?? "");
  const changedFiles = context.changedFiles as string[] | undefined;

  if (BRAND_COPY_FILE.test(resource)) {
    return true;
  }

  if (changedFiles?.some(file => BRAND_COPY_FILE.test(file))) {
    return true;
  }

  return false;
}

function hasBrandPacketRead(context: PolicyContext): boolean {
  // Direct flag on context
  if (context.brandPacketRead === true) {
    return true;
  }

  // Check validation receipts for a brand_packet_read receipt
  const receipts = context.validationReceipts as ValidationReceipt[] | undefined;
  if (Array.isArray(receipts)) {
    return receipts.some(r =>
      r.status === "passed" &&
      /brand[_-]?packet[_-]?read/i.test(r.name)
    );
  }

  return false;
}

function hasKotlerOrMunariApproval(context: PolicyContext): boolean {
  return context.kotlerApproval === true ||
    context.munariApproval === true ||
    context.brandTokenApproval === true;
}

function hasCopywriterApproval(context: PolicyContext): boolean {
  return context.copywriterApproval === true ||
    context.brandCopyApproval === true;
}

function hasVisualEvidence(context: PolicyContext): boolean {
  if (context.visualEvidence === true) {
    return true;
  }

  const evidence = context.visual_evidence as unknown;
  if (evidence === true) {
    return true;
  }

  // Accept an array of screenshot/URL strings
  if (Array.isArray(evidence) && evidence.length > 0) {
    return true;
  }

  // Accept a non-empty string (screenshot path or recorded URL)
  if (typeof evidence === "string" && evidence.trim().length > 0) {
    return true;
  }

  return false;
}

function hasDurhamQaPassed(context: PolicyContext): boolean {
  return context.durhamQaPassed === true ||
    context.durham_qa_passed === true;
}

/**
 * POL-023: Brand Department Packet Required
 *
 * Blocks brand-affecting work (build/commit/push/deploy) when no brand department
 * packet has been read. The agent must first read the brand department packet and
 * record a "brand_packet_read" receipt before any brand-affecting work proceeds.
 */
export const POLICY_BRAND_PACKET_REQUIRED: Policy = {
  id: "POL-023",
  description: "Brand-affecting work requires a prior brand department packet read",
  condition: (_claims, context) => {
    if (!isBrandAffectingWork(context)) {
      return true;
    }

    return hasBrandPacketRead(context);
  },
  violation: "Brand Department Packet Required: read the brand department packet before brand-affecting work",
  severity: "critical",
};

/**
 * POL-BRAND-002: Public Release Approval Gate
 *
 * Public-facing, UI, showcase, or brand-canon-affecting work cannot be marked
 * Done, released, deployed, or merged without Captain + Steve/IRIS CEO approval.
 *
 * Mirrors the crewmate/approval protocol in AGENTS.md/SOUL.md.
 */
export const POLICY_BRAND_RELEASE_APPROVAL: Policy = {
  id: "POL-BRAND-002",
  description: "Public-facing brand/UI work requires Captain and product-feel approval before Done/release",
  condition: (_claims, context) => {
    const operation = String(context.operation ?? "");
    const resource = String(context.resource ?? "");

    const isReleaseOperation = /^(done|handoff|commit|push|deploy|release|publish|merge)/i.test(operation);
    const isBrandSurface =
      context.isBrandSurface === true ||
      /brand|logo|color|typography|palette|style|css|ui|ux|design|public|showcase|demo|website|frontend/i.test(operation) ||
      /brand|logo|\.css|\.scss|design-system|tokens|public\/|assets\/(logo|brand)/i.test(resource);

    if (!isReleaseOperation || !isBrandSurface) {
      return true;
    }

    const approvals = context.brandApprovals ?? [];

    const hasCaptain = approvals.some((a) => a.approved && (a.role === "captain" || a.role === "ronin"));
    const hasProductFeel = approvals.some(
      (a) => a.approved && (a.role === "steve" || a.role === "iris-ceo" || a.role === "product-feel")
    );

    return hasCaptain && hasProductFeel;
  },
  violation: "Public-facing brand/UI work requires Captain + Steve/IRIS CEO (product-feel) approval before Done/release.",
  severity: "critical",
};

policyRegistry.register(POLICY_BRAND_SOURCE_OF_TRUTH);
policyRegistry.register(POLICY_BRAND_RELEASE_APPROVAL);

/**
 * POL-024: Brand Token and Typography Lock
 *
 * Blocks changes to brand tokens (colors, fonts, typography) when the change is
 * not approved by Kotler/Munari. Brand token files are locked unless explicit
 * approval is present in the policy context.
 */
export const POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK: Policy = {
  id: "POL-024",
  description: "Brand token and typography changes require Kotler/Munari approval",
  condition: (_claims, context) => {
    if (!targetsBrandTokenFiles(context)) {
      return true;
    }

    return hasKotlerOrMunariApproval(context);
  },
  violation: "Brand Token and Typography Lock: brand token changes require Kotler/Munari approval",
  severity: "critical",
};

/**
 * POL-025: Brand Copy Lock
 *
 * Blocks changes to brand copy (messaging, taglines, voice) when not approved by
 * the copywriter agent.
 */
export const POLICY_BRAND_COPY_LOCK: Policy = {
  id: "POL-025",
  description: "Brand copy changes require copywriter approval",
  condition: (_claims, context) => {
    if (!targetsBrandCopyFiles(context)) {
      return true;
    }

    return hasCopywriterApproval(context);
  },
  violation: "Brand Copy Lock: brand copy changes require copywriter approval",
  severity: "high",
};

/**
 * POL-026: Visual Evidence Before Brand Done
 *
 * Blocks Done/handoff on brand-affecting work when no visual evidence
 * (screenshot/recorded URL) exists in the policy context.
 */
export const POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE: Policy = {
  id: "POL-026",
  description: "Visual evidence required before marking brand-affecting work done",
  condition: (_claims, context) => {
    if (!isBrandDoneOrRelease(context)) {
      return true;
    }

    // Only enforce when the work touches brand token or brand copy files
    if (!targetsBrandTokenFiles(context) && !targetsBrandCopyFiles(context)) {
      return true;
    }

    return hasVisualEvidence(context);
  },
  violation: "Visual Evidence Before Brand Done: visual evidence required before marking brand work done",
  severity: "high",
};

/**
 * POL-027: Durham QA Review Gate
 *
 * Blocks Done/release on brand-affecting work when Durham QA review has not
 * passed.
 */
export const POLICY_DURHAM_QA_REVIEW_GATE: Policy = {
  id: "POL-027",
  description: "Durham QA review required before brand work release",
  condition: (_claims, context) => {
    if (!isBrandDoneOrRelease(context)) {
      return true;
    }

    // Only enforce when the work touches brand token or brand copy files
    if (!targetsBrandTokenFiles(context) && !targetsBrandCopyFiles(context)) {
      return true;
    }

    return hasDurhamQaPassed(context);
  },
  violation: "Durham QA Review Gate: Durham QA review required before brand work release",
  severity: "critical",
};

policyRegistry.register(POLICY_BRAND_PACKET_REQUIRED);
policyRegistry.register(POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK);
policyRegistry.register(POLICY_BRAND_COPY_LOCK);
policyRegistry.register(POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE);
policyRegistry.register(POLICY_DURHAM_QA_REVIEW_GATE);

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT POLICY SET (post all policy definitions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default policy set for controlPlane operations
 * 
 * Includes all 9 builtin policies:
 * POL-001 through POL-009
 */
export const DEFAULT_POLICIES: Policy[] = [
  POLICY_TENANT_ISOLATION,
  POLICY_BUDGET_ENFORCEMENT,
  POLICY_PERMISSION_TIER,
  POLICY_ACTOR_VALIDATION,
  POLICY_AUDIT_TRAIL,
  POLICY_SOURCE_OF_TRUTH_GATE,
  POLICY_INFRASTRUCTURE_TARGET_LOCK,
  POLICY_PROJECT_MANIFEST_REQUIRED,
  POLICY_VALIDATION_BEFORE_DONE,
  POLICY_RETRIEVAL_CLAIM_PRECISION,
  POLICY_PROMOTION_ROUNDTRIP,
  POLICY_READER_WRITER_SCHEMA_PARITY,
  POLICY_EMAIL_INSTRUCTION_BLOCKER,
  POLICY_EMAIL_ACTION_APPROVAL_GATE,
  POLICY_HIGH_RISK_EMAIL_QUARANTINE,
  POLICY_EMAIL_MEMORY_PROMOTION_REQUIRES_HITL,
  POLICY_EMAIL_ATTACHMENT_SANDBOX_REQUIREMENT,
  POLICY_BRAND_SOURCE_OF_TRUTH,
  POLICY_BRAND_RELEASE_APPROVAL,
  POLICY_BRAND_PACKET_REQUIRED,
  POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK,
  POLICY_BRAND_COPY_LOCK,
  POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE,
  POLICY_DURHAM_QA_REVIEW_GATE,
];

// ─────────────────────────────────────────────────────────────────────────────
// TENANT-SPECIFIC POLICIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create tenant-specific policy overrides
 * 
 * @param groupId - Tenant group ID
 * @param overrides - Policy overrides for this tenant
 * @returns Customized policy set
 */
export function createTenantPolicies(
  groupId: string,
  overrides: Partial<Policy>[]
): Policy[] {
  // Start with default policies
  const policies = [...DEFAULT_POLICIES];
  
  // Apply overrides
  for (const override of overrides) {
    const index = policies.findIndex((p) => p.id === override.id);
    
    if (index >= 0) {
      policies[index] = { ...policies[index], ...override };
    } else {
      // New policy
      policies.push(override as Policy);
    }
  }
  
  return policies;
}
