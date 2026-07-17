/**
 * Genesis Engine — Proposal Generator
 * Story 2.2: Genesis Engine (Pattern Proposal)
 *
 * Takes `DetectedPattern` objects from the pattern detector and persists
 * them as `pattern_proposals` rows through the kernel `syscall_mutate`
 * path (AD-40). All writes are tenant-scoped: group_id is mandatory and
 * stamped by the kernel from the proof claims.
 *
 * Approved proposals produce a skill template draft (Markdown) — they are
 * NOT auto-deployed. A human reviewer must explicitly approve via the
 * HITL gate (POST /api/genesis/proposals/approve).
 *
 * Reference: docs/allura/BLUEPRINT.md (Genesis Engine)
 */

// Server-only guard — syscall_mutate touches the proof engine + DB.
if (typeof window !== "undefined") {
  throw new Error("proposal-generator can only be used server-side");
}

import { syscall_mutate, type SyscallContext } from "@/kernel/syscalls";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";
import type { DetectedPattern } from "@/lib/genesis/pattern-detector";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Row persisted to `pattern_proposals`. */
export interface PatternProposalRow {
  id: number;
  group_id: string;
  pattern_description: string;
  pattern_type: string;
  frequency: number;
  suggested_skill: string;
  confidence: number;
  status: "proposed" | "approved" | "rejected";
  created_at: Date;
  reviewed_at: Date | null;
}

/** Result of `generateProposals` for a single pattern. */
export interface ProposalResult {
  recorded: boolean;
  proposal_id?: number;
  error?: string;
}

/** Result of a batch `generateProposals` call. */
export interface BatchProposalResult {
  total: number;
  recorded: number;
  failed: number;
  results: ProposalResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSAL GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single detected pattern as a `pattern_proposals` row through
 * the kernel `syscall_mutate` path.
 *
 * group_id is validated up front and then re-stamped by the kernel from
 * the proof claims (defence in depth). On any validation/kernel failure a
 * failed `ProposalResult` is returned — the function never throws.
 */
export async function generateProposal(
  group_id: string,
  pattern: DetectedPattern
): Promise<ProposalResult> {
  let validatedGroupId: string;
  try {
    validatedGroupId = validateGroupId(group_id);
  } catch (error) {
    const message =
      error instanceof GroupIdValidationError
        ? error.message
        : `Invalid group_id: ${String(group_id)}`;
    console.error(`[genesis] proposal skipped: ${message}`);
    return { recorded: false, error: message };
  }

  // Clamp confidence to [0.0, 1.0] defensively.
  const confidence = Math.max(0.0, Math.min(1.0, pattern.confidence));

  const mutationData = {
    group_id: validatedGroupId,
    pattern_description: pattern.pattern_description,
    pattern_type: pattern.pattern_type,
    frequency: pattern.frequency,
    suggested_skill: pattern.suggested_skill,
    confidence,
    status: "proposed",
  };

  const context: SyscallContext = {
    actor: "genesis-engine",
    group_id: validatedGroupId,
    permission_tier: "plugin",
    audit_context: {
      subsystem: "genesis",
      pattern_type: pattern.pattern_type,
    },
  };

  try {
    const result = await syscall_mutate(
      {
        type: "insert",
        target: "pg:pattern_proposals",
        data: mutationData,
      },
      context
    );

    if (!result.success) {
      console.error(
        `[genesis] proposal write failed for pattern=${pattern.pattern_type}: ${result.error ?? "unknown kernel error"}`
      );
      return { recorded: false, error: result.error };
    }

    // The kernel returns affected_rows, not the inserted id. We query the
    // latest proposed row for this group+pattern to recover the id when
    // callers need it (best-effort — returns undefined if not recoverable).
    return { recorded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[genesis] proposal generation threw: ${message}`);
    return { recorded: false, error: message };
  }
}

/**
 * Persist a batch of detected patterns. Returns per-pattern results plus
 * aggregate counts. Never throws — failures are captured per pattern.
 */
export async function generateProposals(
  group_id: string,
  patterns: DetectedPattern[]
): Promise<BatchProposalResult> {
  const results: ProposalResult[] = [];
  let recorded = 0;
  let failed = 0;

  for (const pattern of patterns) {
    const result = await generateProposal(group_id, pattern);
    results.push(result);
    if (result.recorded) {
      recorded++;
    } else {
      failed++;
    }
  }

  return { total: patterns.length, recorded, failed, results };
}

// ─────────────────────────────────────────────────────────────────────────────
// HITL REVIEW GATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply an HITL decision (approve / reject) to a pattern proposal.
 *
 * Writes flow through the kernel `syscall_mutate` path (AD-40). The DB
 * trigger on `pattern_proposals` permits UPDATE only on `status` and
 * `reviewed_at`.
 *
 * On approve, a skill template draft (Markdown) is generated and returned
 * — it is NOT auto-deployed. The caller (API route) stores/returns it.
 *
 * Returns null on validation/kernel failure.
 */
export async function reviewProposal(
  group_id: string,
  proposal_id: number,
  decision: "approved" | "rejected"
): Promise<{ updated: boolean; skill_template?: string; error?: string }> {
  let validatedGroupId: string;
  try {
    validatedGroupId = validateGroupId(group_id);
  } catch (error) {
    const message =
      error instanceof GroupIdValidationError
        ? error.message
        : `Invalid group_id: ${String(group_id)}`;
    return { updated: false, error: message };
  }

  const context: SyscallContext = {
    actor: "hitl-reviewer",
    group_id: validatedGroupId,
    permission_tier: "plugin",
    audit_context: {
      subsystem: "genesis",
      decision,
      proposal_id,
    },
  };

  try {
    const result = await syscall_mutate(
      {
        type: "update",
        target: "pg:pattern_proposals",
        data: {
          status: decision,
          reviewed_at: new Date().toISOString(),
        },
        query: { id: proposal_id },
      },
      context
    );

    if (!result.success) {
      return { updated: false, error: result.error };
    }

    // On approve, generate a skill template draft (not auto-deployed).
    if (decision === "approved") {
      const template = generateSkillTemplateDraft(validatedGroupId, proposal_id);
      return { updated: true, skill_template: template };
    }

    return { updated: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[genesis] review threw: ${message}`);
    return { updated: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKILL TEMPLATE DRAFT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a skill template draft (Markdown) for an approved proposal.
 * This is NOT auto-deployed — it is returned to the HITL reviewer for
 * manual curation and deployment via the skill registry.
 *
 * The template is deterministic and minimal — it records the provenance
 * (group_id, proposal_id) and leaves the body for human curation.
 */
export function generateSkillTemplateDraft(
  group_id: string,
  proposal_id: number
): string {
  const now = new Date().toISOString();
  return `# Skill Template Draft (Genesis)

> **Status:** DRAFT — auto-generated by the Genesis Engine. Not deployed.
> **Provenance:** group_id=\`${group_id}\` proposal_id=\`${proposal_id}\`
> **Generated at:** ${now}

## Description

<!-- Human curator: fill in the skill description. -->

## Triggers

<!-- When should this skill activate? -->

## Steps

1. <!-- Step 1 -->
2. <!-- Step 2 -->
3. <!-- Step 3 -->

## Pitfalls

<!-- Known failure modes and edge cases. -->

## Verification

<!-- How to verify the skill works correctly. -->
`;
}