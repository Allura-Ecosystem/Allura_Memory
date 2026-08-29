/**
 * Team RAM and Durham branch workflow lane configuration.
 *
 * Pure typed configuration — no database access, no agent framework. Each
 * lane is a branch with exactly one writer (sole-writer ownership): a
 * second writer on the same lane is a violation, enforced by the workflow
 * runner against the branch registry.
 *
 * Team RAM lanes: one branch per story, per agent, and per review lane.
 * Durham lanes: conservative, expressive, and crop-resilient concept
 * branches, each carrying reference, prompt, token, asset, accessibility,
 * and provenance manifests.
 */

import type { BranchRegistryStatus } from "../branch/promotion-adapter"

/** The six manifest kinds every Durham concept branch must carry. */
export const DURHAM_MANIFEST_KEYS = [
  "reference",
  "prompt",
  "token",
  "asset",
  "accessibility",
  "provenance",
] as const

export type DurhamManifestKey = (typeof DURHAM_MANIFEST_KEYS)[number]

export interface DurhamManifestSet {
  reference: string
  prompt: string
  token: string
  asset: string
  accessibility: string
  provenance: string
}

export type LaneKind = "story" | "agent" | "review"

export interface LaneConfig {
  /** Stable lane id, e.g. "agent-lane-woz". */
  id: string
  kind: LaneKind
  /** Branch name for this lane, e.g. "ram/agent/woz". */
  branchId: string
  /** Sole writer: the only agent allowed to open, work, or close this lane. */
  writer: string
  /** Reviewers who may gate this lane's evidence (Munari/Rand for Durham). */
  reviewers: string[]
  /** Optional task/story reference for story lanes. */
  taskId?: string
}

export interface DurhamConceptConfig {
  id: string
  concept: "conservative" | "expressive" | "crop-resilient"
  branchId: string
  writer: string
  reviewers: string[]
  manifests: DurhamManifestSet
}

/** Team RAM roster: one branch per agent, each with sole-writer ownership. */
const AGENT_LANES: LaneConfig[] = [
  { id: "agent-lane-brooks", kind: "agent", branchId: "ram/agent/brooks", writer: "brooks", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-woz", kind: "agent", branchId: "ram/agent/woz", writer: "woz", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-knuth", kind: "agent", branchId: "ram/agent/knuth", writer: "knuth", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-pike", kind: "agent", branchId: "ram/agent/pike", writer: "pike", reviewers: ["fowler"] },
  { id: "agent-lane-fowler", kind: "agent", branchId: "ram/agent/fowler", writer: "fowler", reviewers: ["pike"] },
  { id: "agent-lane-bellard", kind: "agent", branchId: "ram/agent/bellard", writer: "bellard", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-hightower", kind: "agent", branchId: "ram/agent/hightower", writer: "hightower", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-jobs", kind: "agent", branchId: "ram/agent/jobs", writer: "jobs", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-carmack", kind: "agent", branchId: "ram/agent/carmack", writer: "carmack", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-scout", kind: "agent", branchId: "ram/agent/scout", writer: "scout", reviewers: ["pike", "fowler"] },
  { id: "agent-lane-bahari", kind: "agent", branchId: "ram/agent/bahari", writer: "bahari", reviewers: ["pike", "fowler"] },
]

/** One branch per review lane; reviewers are sole writers of their own lane. */
const REVIEW_LANES: LaneConfig[] = [
  { id: "review-lane-pike", kind: "review", branchId: "ram/review/pike", writer: "pike", reviewers: ["fowler"] },
  { id: "review-lane-fowler", kind: "review", branchId: "ram/review/fowler", writer: "fowler", reviewers: ["pike"] },
  { id: "review-lane-munari-rand", kind: "review", branchId: "ram/review/munari-rand", writer: "munari-rand", reviewers: ["pike", "fowler"] },
]

/** One branch per story lane (epic 27 stories, sole-writer owned). */
const STORY_LANES: LaneConfig[] = [
  { id: "story-lane-27-1", kind: "story", branchId: "ram/story/27-1", writer: "scout", reviewers: ["pike", "fowler"], taskId: "27-1" },
  { id: "story-lane-27-2", kind: "story", branchId: "ram/story/27-2", writer: "woz", reviewers: ["pike", "fowler"], taskId: "27-2" },
  { id: "story-lane-27-3", kind: "story", branchId: "ram/story/27-3", writer: "woz", reviewers: ["pike", "fowler"], taskId: "27-3" },
  { id: "story-lane-27-4", kind: "story", branchId: "ram/story/27-4", writer: "bellard", reviewers: ["pike", "fowler"], taskId: "27-4" },
  { id: "story-lane-27-5", kind: "story", branchId: "ram/story/27-5", writer: "brooks", reviewers: ["pike", "fowler"], taskId: "27-5" },
  { id: "story-lane-27-6", kind: "story", branchId: "ram/story/27-6", writer: "hightower", reviewers: ["pike", "fowler"], taskId: "27-6" },
]

export const TEAM_RAM_LANES: LaneConfig[] = [...STORY_LANES, ...AGENT_LANES, ...REVIEW_LANES]

/**
 * Durham concept branches. Each concept carries the full manifest set;
 * `assertDurhamManifestsComplete` fails closed on any missing or empty
 * manifest so a concept lane can never open half-evidenced.
 */
export const DURHAM_CONCEPTS: DurhamConceptConfig[] = [
  {
    id: "durham-conservative",
    concept: "conservative",
    branchId: "durham/concept/conservative",
    writer: "munari-rand",
    reviewers: ["pike", "fowler"],
    manifests: {
      reference: "reference:conservative:2026-08:minimal-risk-curation",
      prompt: "prompt:conservative:2026-08:prefer-retention-over-rewrite",
      token: "token:conservative:2026-08:budget-1024",
      asset: "asset:conservative:2026-08:no-new-assets",
      accessibility: "accessibility:conservative:2026-08:wcag-aa",
      provenance: "provenance:conservative:2026-08:curator-verified",
    },
  },
  {
    id: "durham-expressive",
    concept: "expressive",
    branchId: "durham/concept/expressive",
    writer: "munari-rand",
    reviewers: ["pike", "fowler"],
    manifests: {
      reference: "reference:expressive:2026-08:rich-voice-samples",
      prompt: "prompt:expressive:2026-08:creative-variation-allowed",
      token: "token:expressive:2026-08:budget-4096",
      asset: "asset:expressive:2026-08:voice-and-image-assets",
      accessibility: "accessibility:expressive:2026-08:wcag-aa-plus-captions",
      provenance: "provenance:expressive:2026-08:source-attributed",
    },
  },
  {
    id: "durham-crop-resilient",
    concept: "crop-resilient",
    branchId: "durham/concept/crop-resilient",
    writer: "munari-rand",
    reviewers: ["pike", "fowler"],
    manifests: {
      reference: "reference:crop-resilient:2026-08:truncation-safe-sources",
      prompt: "prompt:crop-resilient:2026-08:no-critical-content-in-tail",
      token: "token:crop-resilient:2026-08:budget-2048",
      asset: "asset:crop-resilient:2026-08:responsive-assets",
      accessibility: "accessibility:crop-resilient:2026-08:wcag-aa-reflow-safe",
      provenance: "provenance:crop-resilient:2026-08:curator-verified",
    },
  },
]

/**
 * Fail-closed manifest validation: every Durham concept must carry all six
 * manifests, each non-empty. Throws on the first missing or empty manifest.
 */
export function assertDurhamManifestsComplete(manifests: DurhamManifestSet): void {
  for (const key of DURHAM_MANIFEST_KEYS) {
    const value = manifests[key]
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Durham manifest '${key}' is required and must not be empty`)
    }
  }
}

/** Look up a Team RAM lane by id; throws when unknown. */
export function getTeamRamLane(laneId: string): LaneConfig {
  const lane = TEAM_RAM_LANES.find((candidate) => candidate.id === laneId)
  if (!lane) throw new Error(`unknown Team RAM lane: ${laneId}`)
  return lane
}

/** Look up a Durham concept by id; throws when unknown. */
export function getDurhamConcept(conceptId: string): DurhamConceptConfig {
  const concept = DURHAM_CONCEPTS.find((candidate) => candidate.id === conceptId)
  if (!concept) throw new Error(`unknown Durham concept: ${conceptId}`)
  return concept
}

/** The lifecycle statuses a real lane can hold, mirroring the registry enum. */
export const LANE_LIFECYCLE_STATUSES: readonly BranchRegistryStatus[] = [
  "active",
  "degraded",
  "expired",
  "rejected",
  "quarantined",
  "rolled_back",
] as const
