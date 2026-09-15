/**
 * Agent Hooks Integration Layer
 *
 * Routes agent lifecycle events through the canonical memory pipeline.
 * All writes go through memory_add — no direct DB access.
 *
 * Invariants:
 * - group_id validated on every call (throws GroupIdValidationError on invalid)
 * - ZodError is re-thrown as HookValidationError (no silent drops)
 * - Errors from memory_add propagate uncaught (loud failure)
 * - No direct imports of pg or neo4j-driver
 */

if (typeof window !== "undefined") {
  throw new Error("This module can only be used server-side");
}

import { z } from "zod";
import { validateGroupId } from "@/lib/validation/group-id";

// ── Error Class ───────────────────────────────────────────────────────────────

export class HookValidationError extends Error {
  constructor(
    public readonly agent_id: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(
      `Hook validation failed for agent '${agent_id}': ${issues.map((i) => i.message).join(", ")}`,
    );
    this.name = "HookValidationError";
  }
}

// ── Shared Base Schema ────────────────────────────────────────────────────────

const BaseHookSchema = z.object({
  agent_id: z.enum(["brooks-triage", "pike", "carmack", "fowler"]),
  event_type: z.string().min(1),
  group_id: z.string().min(1),
  session_id: z.string().min(1),
  user_id: z.string().min(1),
  // Extensible record: required fields validated per-agent via metadata sub-schemas
  metadata: z.record(z.string(), z.unknown()),
});

// ── Per-Agent Metadata Schemas ────────────────────────────────────────────────

export const BrooksMetadataSchema = z.object({
  summary: z.string().min(1),
  issue_ref: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  delegated_to: z.string().optional(),
});

export const PikeMetadataSchema = z.object({
  finding: z.string().min(1),
  decision: z.enum(["approve", "reject", "flag"]),
  file_path: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
});

export const CarmackMetadataSchema = z.object({
  decision: z.enum(["approve", "reject", "comment"]),
  pr_ref: z.string().optional(),
  finding: z.string().optional(),
  principles_violated: z.array(z.string()).optional(),
});

export const FowlerMetadataSchema = z.object({
  outcome: z.enum(["pass", "fail"]),
  gate_name: z.string().optional(),
  reason: z.string().optional(),
  debt_type: z.string().optional(),
});

// ── Per-Agent Full Payload Schemas ────────────────────────────────────────────

export const BrooksPayloadSchema = BaseHookSchema.extend({
  agent_id: z.literal("brooks-triage"),
  event_type: z.enum([
    "triage_started",
    "triage_complete",
    "task_created",
    "task_delegated",
  ]),
  metadata: z.record(z.string(), z.unknown()),
});

export const PikePayloadSchema = BaseHookSchema.extend({
  agent_id: z.literal("pike"),
  event_type: z.enum([
    "interface_review_started",
    "interface_review_complete",
    "complexity_flagged",
    "interface_vetoed",
  ]),
  metadata: z.record(z.string(), z.unknown()),
});

export const CarmackPayloadSchema = BaseHookSchema.extend({
  agent_id: z.literal("carmack"),
  event_type: z.enum([
    "pr_review_started",
    "pr_review_complete",
    "structural_issue_found",
    "pr_approved",
    "pr_rejected",
  ]),
  metadata: z.record(z.string(), z.unknown()),
});

export const FowlerPayloadSchema = BaseHookSchema.extend({
  agent_id: z.literal("fowler"),
  event_type: z.enum([
    "ci_gate_started",
    "ci_gate_passed",
    "ci_gate_failed",
    "refactor_proposed",
    "debt_flagged",
  ]),
  metadata: z.record(z.string(), z.unknown()),
});

export { BaseHookSchema };

// ── Inferred Types ────────────────────────────────────────────────────────────

export type AgentHookPayload = z.infer<typeof BaseHookSchema> & {
  agent_id: "brooks-triage" | "pike" | "carmack" | "fowler";
};

// Convenience param types for per-agent helpers (omit agent_id — injected automatically)
export type BrooksHookParams = Omit<z.infer<typeof BrooksPayloadSchema>, "agent_id"> & {
  metadata: z.infer<typeof BrooksMetadataSchema> & Record<string, unknown>;
};

export type PikeHookParams = Omit<z.infer<typeof PikePayloadSchema>, "agent_id"> & {
  metadata: z.infer<typeof PikeMetadataSchema> & Record<string, unknown>;
};

export type CarmackHookParams = Omit<z.infer<typeof CarmackPayloadSchema>, "agent_id"> & {
  metadata: z.infer<typeof CarmackMetadataSchema> & Record<string, unknown>;
};

export type FowlerHookParams = Omit<z.infer<typeof FowlerPayloadSchema>, "agent_id"> & {
  metadata: z.infer<typeof FowlerMetadataSchema> & Record<string, unknown>;
};

// ── Content Builder ───────────────────────────────────────────────────────────

function buildContent(payload: AgentHookPayload): string {
  const summary =
    (payload.metadata["summary"] as string | undefined) ||
    (payload.metadata["finding"] as string | undefined) ||
    (payload.metadata["outcome"] as string | undefined) ||
    JSON.stringify(payload.metadata).slice(0, 200);
  return `[${payload.agent_id}] ${payload.event_type}: ${summary}`;
}

// ── Validation Router ─────────────────────────────────────────────────────────

/**
 * Validate the full payload against the agent-specific schema.
 * Additionally validates required metadata fields for each agent.
 * Throws HookValidationError on any failure.
 */
function validatePayload(payload: AgentHookPayload): void {
  const allIssues: z.ZodIssue[] = [];

  switch (payload.agent_id) {
    case "brooks-triage": {
      const outerResult = BrooksPayloadSchema.safeParse(payload);
      const metaResult = BrooksMetadataSchema.safeParse(payload.metadata);
      if (!outerResult.success) allIssues.push(...outerResult.error.issues);
      if (!metaResult.success) allIssues.push(...metaResult.error.issues);
      break;
    }
    case "pike": {
      const outerResult = PikePayloadSchema.safeParse(payload);
      const metaResult = PikeMetadataSchema.safeParse(payload.metadata);
      if (!outerResult.success) allIssues.push(...outerResult.error.issues);
      if (!metaResult.success) allIssues.push(...metaResult.error.issues);
      break;
    }
    case "carmack": {
      const outerResult = CarmackPayloadSchema.safeParse(payload);
      const metaResult = CarmackMetadataSchema.safeParse(payload.metadata);
      if (!outerResult.success) allIssues.push(...outerResult.error.issues);
      if (!metaResult.success) allIssues.push(...metaResult.error.issues);
      break;
    }
    case "fowler": {
      const outerResult = FowlerPayloadSchema.safeParse(payload);
      const metaResult = FowlerMetadataSchema.safeParse(payload.metadata);
      if (!outerResult.success) allIssues.push(...outerResult.error.issues);
      if (!metaResult.success) allIssues.push(...metaResult.error.issues);
      break;
    }
    default: {
      // Exhaustiveness guard — TypeScript should prevent this path
      const _exhaustive: never = payload.agent_id;
      throw new HookValidationError(String(_exhaustive), [
        {
          code: "custom",
          message: `Unknown agent_id: ${String(_exhaustive)}`,
          path: ["agent_id"],
        },
      ]);
    }
  }

  if (allIssues.length > 0) {
    throw new HookValidationError(payload.agent_id, allIssues);
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Write an agent lifecycle event to the canonical memory pipeline.
 *
 * Fails loudly:
 * - HookValidationError on schema violations
 * - GroupIdValidationError on invalid group_id
 * - Any error from memory_add propagates uncaught
 */
export async function writeAgentHook(payload: AgentHookPayload): Promise<void> {
  // 1. Validate group_id first (throws GroupIdValidationError on failure)
  validateGroupId(payload.group_id);

  // 2. Validate full payload + per-agent metadata (throws HookValidationError on failure)
  validatePayload(payload);

  throw new Error("agent lifecycle writes require a verified workspace-bound principal and are unavailable to direct helpers");
}

// ── Per-Agent Convenience Wrappers ────────────────────────────────────────────

/**
 * brooks-triage hook.
 * Handles: triage_started | triage_complete | task_created | task_delegated
 */
export async function brooksTriageHook(params: BrooksHookParams): Promise<void> {
  return writeAgentHook({
    ...params,
    agent_id: "brooks-triage",
  });
}

/**
 * pike hook.
 * Handles: interface_review_started | interface_review_complete | complexity_flagged | interface_vetoed
 */
export async function pikeHook(params: PikeHookParams): Promise<void> {
  return writeAgentHook({
    ...params,
    agent_id: "pike",
  });
}

/**
 * carmack hook.
 * Handles: pr_review_started | pr_review_complete | structural_issue_found | pr_approved | pr_rejected
 */
export async function carmackHook(params: CarmackHookParams): Promise<void> {
  return writeAgentHook({
    ...params,
    agent_id: "carmack",
  });
}

/**
 * fowler hook.
 * Handles: ci_gate_started | ci_gate_passed | ci_gate_failed | refactor_proposed | debt_flagged
 */
export async function fowlerHook(params: FowlerHookParams): Promise<void> {
  return writeAgentHook({
    ...params,
    agent_id: "fowler",
  });
}
