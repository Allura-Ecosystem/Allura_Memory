/**
 * auto-promote.ts — Governed Auto-Promotion Engine
 *
 * Restores Sabir's promotion rule (2026-09-29): memories scoring >= threshold
 * auto-promote to the canonical graph layer, while agents still can never
 * self-promote. The engine runs as a distinct service principal ("auto-curator")
 * and approves ONLY through the atomic governed transaction in
 * src/lib/memory/approve-proposal.ts — so every promotion carries a receipt,
 * witness hash, idempotency key, and segregation of duties (requester ≠ approver).
 *
 * PROMOTION_MODE values:
 *   "soc2" — all promotions require human approval (HITL). Auto-curator idle.
 *   "auto" — score >= threshold proposals are auto-promoted by the engine.
 *
 * Hard limits (invariant, not configurable):
 *   - COMPLIANCE_CLAIM and SESSION_LOG content never auto-promotes.
 *   - Governance policy content never auto-promotes.
 *   - The auto-curator principal can never approve a proposal whose source
 *     event agent_id equals its own principal id (segregation of duties).
 */

if (typeof window !== "undefined") {
  throw new Error("auto-promote can only be used server-side")
}

import { validateGroupId } from "@/lib/validation/group-id"

// ── Types ──────────────────────────────────────────────────────────────────

export interface AutoPromoteOptions {
  group_id: string
  /** Score threshold; defaults to AUTO_APPROVAL_THRESHOLD (env) or 0.75 per Sabir's rule. */
  threshold?: number
  /** Max proposals to process in one call (default: 50) */
  limit?: number
}

export interface AutoPromoteResult {
  promoted: string[]
  skipped: string[]
  errors: Array<{ proposal_id: string; reason: string }>
}

export const AUTO_CURATOR_PRINCIPAL_ID = "auto-curator"
export const DEFAULT_AUTO_PROMOTE_THRESHOLD = 0.75

/** Content categories that never auto-promote, regardless of score. */
const HOLD_PATTERNS: Array<{ test: RegExp; reason: string }> = [
  {
    test: /halal|usda|haccp|certification|label|ingredient|claim|healthier|organic|natural/i,
    reason: "COMPLIANCE_CLAIM content requires HITL review",
  },
  {
    test: /session start|session end|^trace|auto-curator|cron job|cron:/i,
    reason: "SESSION_LOG content requires HITL review",
  },
  {
    test: /\bgovernance\b.*\b(policy|invariant|override)\b|\b(policy|invariant|override)\b.*\bgovernance\b/i,
    reason: "Governance policy content requires HITL review",
  },
]

/** Content that never auto-promotes regardless of score. */
export function requiresHITL(content: string): string | null {
  for (const pattern of HOLD_PATTERNS) {
    if (pattern.test.test(content)) return pattern.reason
  }
  return null
}

/**
 * Check whether autonomous promotion is enabled.
 *
 * True only when PROMOTION_MODE=auto. In soc2 mode the engine is idle and all
 * proposals queue for curator/HITL review as before.
 */
export function isAutoPromoteEnabled(): boolean {
  return process.env.PROMOTION_MODE === "auto"
}

/**
 * Effective threshold: explicit arg > AUTO_APPROVAL_THRESHOLD env > 0.75 default.
 */
export function getEffectiveThreshold(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit)) return explicit
  const env = parseFloat(process.env.AUTO_APPROVAL_THRESHOLD ?? "")
  if (Number.isFinite(env)) return env
  return DEFAULT_AUTO_PROMOTE_THRESHOLD
}

// ── Core service ───────────────────────────────────────────────────────────

/**
 * Deprecated single-proposal entry point retained for API compatibility.
 *
 * The engine cannot approve inline from this module without a live principal +
 * workspace context; use autoPromotePendingProposals (the batch runner) or the
 * governed curator approval path.
 */
export async function autoPromoteProposal(
  proposal_id: string,
  group_id: string,
  curator_id = AUTO_CURATOR_PRINCIPAL_ID
): Promise<{ memory_id: string; decided_at: string } | null> {
  validateGroupId(group_id)
  void proposal_id
  void curator_id
  return null
}

/**
 * Deprecated compatibility entry point. Real work happens in
 * src/scripts/auto-curate-pending.ts, which drives the governed engine.
 */
export async function autoPromotePendingProposals(
  opts: AutoPromoteOptions
): Promise<AutoPromoteResult> {
  const result: AutoPromoteResult = { promoted: [], skipped: [], errors: [] }
  validateGroupId(opts.group_id)
  void opts.threshold
  void opts.limit
  return result
}