/**
 * Shared branch validation helpers (epic-27 retro item 11).
 *
 * Extracted from the three identical private copies that lived in
 * promotion-adapter.ts, workflow-runner.ts, and epic-gate.ts. Single source
 * of truth for branch input validation.
 */

import type { BranchDiff } from "../branch/promotion-adapter"

function isMemoryValue(value: unknown): value is BranchDiff["added"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === "string" && candidate.id.trim().length > 0 &&
    typeof candidate.content === "string" && typeof candidate.score === "number" &&
    (candidate.provenance === "conversation" || candidate.provenance === "manual") &&
    Array.isArray(candidate.tags) && candidate.tags.every((tag) => typeof tag === "string")
}

function isOverrideValue(value: unknown): value is BranchDiff["overridden"][number] {
  const candidate = value as unknown as { supersedes_id?: unknown }
  return isMemoryValue(value) && typeof candidate.supersedes_id === "string" &&
    candidate.supersedes_id.trim().length > 0
}

/** Require a non-empty trimmed string; throws with the field name. */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

/** Require a diff object with at least one addition, override, or tombstone. */
export function requireDiff(diff: unknown): BranchDiff {
  if (!diff || typeof diff !== "object") throw new Error("diff is required")
  const candidate = diff as Partial<BranchDiff>
  const added = Array.isArray(candidate.added) ? candidate.added : []
  const overridden = Array.isArray(candidate.overridden) ? candidate.overridden : []
  const deleted = Array.isArray(candidate.deleted) ? candidate.deleted.map(String) : []
  if (!added.every(isMemoryValue) || !overridden.every(isOverrideValue)) {
    throw new Error("diff values must be materialized branch memory values")
  }
  if (added.length === 0 && overridden.length === 0 && deleted.length === 0) {
    throw new Error("diff must contain at least one addition, override, or tombstone")
  }
  return { added, overridden, deleted }
}

/** Require a non-empty array of evidence refs. */
export function requireEvidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("evidence_refs must be an array")
  const refs = value.map(String).map((ref) => ref.trim()).filter(Boolean)
  if (refs.length === 0) throw new Error("evidence_refs must not be empty")
  return refs
}
