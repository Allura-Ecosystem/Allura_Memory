// Profile and staleness semantics for bumblebee population management.
//
// baseline and project are routine populations that stay separate but may be
// deliberately unioned.  deep is campaign evidence only and never replaces or
// unions with routine inventory.  Missing recent complete generations mean
// stale, not clean.

export type ProfileSeparation = "baseline" | "project" | "deep"

export interface StalenessInput {
  /** Generation number of the last complete scan, or null if never completed. */
  readonly lastCompleteGeneration: number | null
  /** Current server-issued generation / lease number. */
  readonly currentServerGeneration: number
  /** Max age in seconds for a complete generation to be considered fresh. */
  readonly freshnessTtlSeconds: number
  /** Timestamp of the last complete generation, or null if never completed. */
  readonly lastCompleteAt: Date | null
  /** Current time for staleness comparison. */
  readonly now: Date
}

export interface ProfileClassification {
  readonly isRoutine: boolean
  readonly isCampaign: boolean
}

// ── isStale ────────────────────────────────────────────────────────────────

export function isStale(input: StalenessInput): boolean {
  // Never completed a generation — stale, not clean.
  if (input.lastCompleteGeneration === null) return true

  // Generation exists but no completion timestamp recorded — treat as stale.
  if (input.lastCompleteAt === null) return true

  const ageSeconds = (input.now.getTime() - input.lastCompleteAt.getTime()) / 1000
  return ageSeconds > input.freshnessTtlSeconds
}

// ── profileSeparation ──────────────────────────────────────────────────────

export function profileSeparation(profile: ProfileSeparation): ProfileClassification {
  if (profile === "deep") {
    return { isRoutine: false, isCampaign: true }
  }
  // baseline and project are routine populations.
  return { isRoutine: true, isCampaign: false }
}

// ── canUnionProfiles ────────────────────────────────────────────────────────

// Only routine profiles (baseline, project) may be deliberately unioned.
// Deep is campaign evidence and never unions with routine or with itself.
export function canUnionProfiles(a: ProfileSeparation, b: ProfileSeparation): boolean {
  const classA = profileSeparation(a)
  const classB = profileSeparation(b)
  return classA.isRoutine && classB.isRoutine
}