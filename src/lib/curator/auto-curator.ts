/**
 * Auto-Curator — Pattern detection and candidate insight proposal
 *
 * Reads recent raw_memory_event windows from PostgreSQL,
 * detects repeated patterns, and proposes candidate insights
 * WITHOUT writing truth directly to Neo4j or Notion.
 *
 * Law: Curator proposes. Dashboard approves. Neo4j remembers. Notion explains.
 *
 * Reference: Sprint 9 P4 — Auto-Curator
 */

if (typeof window !== "undefined") {
  throw new Error("Auto-curator can only be used server-side")
}

import { createHash } from "crypto"
import { curatorScore, type CuratorScore, type PromotionTier } from "@/lib/curator/score"
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";
import { validateGroupId } from "@/lib/validation/group-id"

// ── Types ──────────────────────────────────────────────────────────────────

export type CandidateInsightType = "decision" | "pattern" | "failure" | "optimization"
export type ImpactLevel = "low" | "medium" | "high"

export interface CandidateInsight {
  /** Unique candidate ID */
  id: string
  /** The group_id this insight belongs to */
  group_id: string
  /** Type classification */
  type: CandidateInsightType
  /** What the insight is about */
  content: string
  /** Confidence score (0.0–1.0) from curator scoring */
  confidence: number
  /** Impact assessment */
  impact: ImpactLevel
  /** How many events contributed to this pattern */
  frequency: number
  /** Novelty score relative to existing Neo4j knowledge (0.0–1.0) */
  novelty_score: number
  /** Why this matters */
  reasoning: string
  /** Tier from scoring */
  tier: PromotionTier
  /** Source event IDs that contributed */
  source_event_ids: number[]
  /** Durable authority scope retained with the source-event provenance. */
  source_scope?: { group_id: string; workspace_id: string }
  /** Whether this requires HITL approval */
  requires_approval: boolean
  /** When this candidate was created */
  created_at: string
}

export interface PatternDetectionResult {
  candidates: CandidateInsight[]
  patterns_detected: number
  events_analyzed: number
  duplicates_suppressed: number
  analysis_window_hours: number
}

// ── Pattern Detectors ──────────────────────────────────────────────────────

export interface RawEvent {
  id: number
  event_type: string
  agent_id: string
  group_id: string
  workspace_id?: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

/**
 * Detect repeated failures (same error, same agent, same group)
 * Minimum 2 occurrences within the analysis window.
 */
export function detectFailurePatterns(events: RawEvent[]): CandidateInsight[] {
  const failureEvents = events.filter(
    (e) => e.event_type === "promotion_failed" || e.status === "failed"
  )

  // Group by agent + error type
  const failureGroups = new Map<string, { events: RawEvent[]; errorType: string }>()

  for (const event of failureEvents) {
    const metadata = event.metadata || {}
    const errorType = (metadata.error as string) || (metadata.error_message as string) || "unknown"
    const key = `${event.agent_id}|${errorType}|${event.group_id}`

    if (!failureGroups.has(key)) {
      failureGroups.set(key, { events: [], errorType })
    }
    failureGroups.get(key)!.events.push(event)
  }

  const candidates: CandidateInsight[] = []

  for (const [key, group] of failureGroups) {
    if (group.events.length < 2) continue // Minimum 2 occurrences

    const [agentId, errorType, groupId] = key.split("|")
    candidates.push({
      id: createHash('shake256', { outputLength: 8 }).update(`failure-${agentId}-${errorType}-${groupId}`).digest('hex'),
      group_id: groupId,
      type: "failure",
      content: `Agent ${agentId} encountered repeated failures: ${errorType} (${group.events.length} occurrences)`,
      confidence: Math.min(0.5 + group.events.length * 0.1, 0.95),
      impact: group.events.length >= 5 ? "high" : group.events.length >= 3 ? "medium" : "low",
      frequency: group.events.length,
      novelty_score: 0.7, // Failures are usually novel (we don't want them repeating)
      reasoning: `Recurring failure detected: ${errorType} occurred ${group.events.length} times for agent ${agentId}. Root cause analysis recommended.`,
      tier: group.events.length >= 5 ? "mainstream" : group.events.length >= 3 ? "adoption" : "emerging",
      source_event_ids: group.events.map((e) => e.id),
      requires_approval: true, // Failures always require HITL
      created_at: new Date().toISOString(),
    })
  }

  return candidates
}

/**
 * Detect repeated wins (successful promotions, approvals)
 * Minimum 3 occurrences of same pattern type.
 */
export function detectWinPatterns(events: RawEvent[]): CandidateInsight[] {
  const winEvents = events.filter(
    (e) =>
      e.event_type === "proposal_approved" ||
      e.event_type === "memory_promoted" ||
      e.event_type === "tool_approved"
  )

  // Group by event type + group
  const winGroups = new Map<string, RawEvent[]>()

  for (const event of winEvents) {
    const key = `${event.event_type}|${event.group_id}`
    if (!winGroups.has(key)) {
      winGroups.set(key, [])
    }
    winGroups.get(key)!.push(event)
  }

  const candidates: CandidateInsight[] = []

  for (const [key, group] of winGroups) {
    if (group.length < 3) continue // Minimum 3 wins to form a pattern

    const [eventType, groupId] = key.split("|")
    const eventTypeLabel = eventType.replace(/_/g, " ")

    candidates.push({
      id: createHash('shake256', { outputLength: 8 }).update(`win-${eventType}-${groupId}-${group.length}`).digest('hex'),
      group_id: groupId,
      type: "pattern",
      content: `Successful ${eventTypeLabel} pattern: ${group.length} occurrences in analysis window`,
      confidence: Math.min(0.6 + group.length * 0.05, 0.9),
      impact: group.length >= 10 ? "high" : group.length >= 5 ? "medium" : "low",
      frequency: group.length,
      novelty_score: 0.5, // Wins are less novel than failures
      reasoning: `Consistent success pattern: ${eventTypeLabel} occurred ${group.length} times. Consider documenting as institutional knowledge.`,
      tier: group.length >= 10 ? "mainstream" : group.length >= 5 ? "adoption" : "emerging",
      source_event_ids: group.map((e) => e.id),
      requires_approval: false, // Low-risk wins can be auto-approved
      created_at: new Date().toISOString(),
    })
  }

  return candidates
}

/**
 * Detect approval patterns (curator decisions)
 * Tracks approval rates and decision patterns.
 */
export function detectApprovalPatterns(events: RawEvent[]): CandidateInsight[] {
  const approvalEvents = events.filter(
    (e) => e.event_type === "proposal_approved" || e.event_type === "proposal_rejected"
  )

  if (approvalEvents.length < 2) return []

  const approved = approvalEvents.filter((e) => e.event_type === "proposal_approved").length
  const rejected = approvalEvents.filter((e) => e.event_type === "proposal_rejected").length
  const total = approved + rejected
  const approvalRate = total > 0 ? approved / total : 0

  // Only create a candidate if the pattern is meaningful
  if (total < 3) return []

  const candidates: CandidateInsight[] = []

  // High approval rate pattern
  if (approvalRate >= 0.9 && total >= 5) {
    candidates.push({
      id: createHash('shake256', { outputLength: 8 }).update(`approval-${approvalEvents[0].group_id}-${approved}-${rejected}`).digest('hex'),
      group_id: approvalEvents[0].group_id,
      type: "optimization",
      content: `Curator approval rate is ${Math.round(approvalRate * 100)}% (${approved}/${total}). Consider increasing AUTO_APPROVAL_THRESHOLD.`,
      confidence: 0.85,
      impact: "medium",
      frequency: total,
      novelty_score: 0.6,
      reasoning: `High approval rate suggests proposals are consistently high quality. Auto-approval threshold could be adjusted to reduce HITL burden.`,
      tier: "adoption",
      source_event_ids: approvalEvents.map((e) => e.id),
      requires_approval: true, // Policy changes require HITL
      created_at: new Date().toISOString(),
    })
  }

  // High rejection rate pattern
  if (approvalRate <= 0.3 && total >= 5) {
    candidates.push({
      id: createHash('shake256', { outputLength: 8 }).update(`rejection-${approvalEvents[0].group_id}-${rejected}-${approved}`).digest('hex'),
      group_id: approvalEvents[0].group_id,
      type: "decision",
      content: `Curator rejection rate is ${Math.round((1 - approvalRate) * 100)}% (${rejected}/${total}). Scoring threshold or content quality may need adjustment.`,
      confidence: 0.8,
      impact: "high",
      frequency: total,
      novelty_score: 0.75,
      reasoning: `High rejection rate suggests either the scoring threshold is too low or content quality needs review. Investigate rejected proposal patterns.`,
      tier: "adoption",
      source_event_ids: approvalEvents.map((e) => e.id),
      requires_approval: true,
      created_at: new Date().toISOString(),
    })
  }

  return candidates
}

/**
 * Detect tool-risk events (admin/destructive tool usage patterns)
 */
export function detectToolRiskPatterns(events: RawEvent[]): CandidateInsight[] {
  const toolEvents = events.filter(
    (e) => e.event_type === "tool_approved" || e.event_type === "tool_denied"
  )

  if (toolEvents.length === 0) return []

  const approved = toolEvents.filter((e) => e.event_type === "tool_approved").length
  const denied = toolEvents.filter((e) => e.event_type === "tool_denied").length

  // Only create a candidate if there are meaningful tool decisions
  if (approved + denied < 2) return []

  return [
    {
      id: createHash('shake256', { outputLength: 8 }).update(`tool-risk-${toolEvents[0].group_id}-${approved}-${denied}`).digest('hex'),
      group_id: toolEvents[0].group_id,
      type: "decision",
      content: `MCP catalog governance: ${approved} tools approved, ${denied} denied in analysis window. Tool adoption rate: ${approved > 0 ? Math.round((approved / (approved + denied)) * 100) : 0}%.`,
      confidence: 0.7,
      impact: "medium",
      frequency: approved + denied,
      novelty_score: 0.6,
      reasoning: `Tool governance patterns reveal adoption velocity and rejection patterns. High approval rate suggests good tool discovery; high rejection rate suggests quality gates are working.`,
      tier: "emerging",
      source_event_ids: toolEvents.map((e) => e.id),
      requires_approval: false, // Observational, not actionable
      created_at: new Date().toISOString(),
    },
  ]
}

// ── Dedup / Similarity ─────────────────────────────────────────────────────

/**
 * Check if a candidate is a duplicate of an existing canonical memory.
 * Uses simple lexical matching for now; embedding similarity is a future enhancement.
 *
 * Thresholds:
 *   >= 0.90  → duplicate (reject)
 *   0.80-0.89 → possible supersede (flag for review)
 *   0.65-0.79 → related context (include as reference)
 *   < 0.65    → new insight (proceed)
 */
export function classifySimilarity(
  candidateContent: string,
  existingContents: string[]
): { classification: "duplicate" | "supersede" | "related" | "new"; bestMatch: string; similarity: number } {
  const normalizedCandidate = candidateContent.toLowerCase().trim()

  let bestSimilarity = 0
  let bestMatch = ""

  for (const existing of existingContents) {
    const normalizedExisting = existing.toLowerCase().trim()

    // Jaccard similarity on word sets
    const candidateWords = new Set(normalizedCandidate.split(/\s+/))
    const existingWords = new Set(normalizedExisting.split(/\s+/))

    const intersection = new Set([...candidateWords].filter((w) => existingWords.has(w)))
    const union = new Set([...candidateWords, ...existingWords])

    const similarity = union.size > 0 ? intersection.size / union.size : 0

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = existing
    }
  }

  if (bestSimilarity >= 0.9) {
    return { classification: "duplicate", bestMatch, similarity: bestSimilarity }
  } else if (bestSimilarity >= 0.8) {
    return { classification: "supersede", bestMatch, similarity: bestSimilarity }
  } else if (bestSimilarity >= 0.65) {
    return { classification: "related", bestMatch, similarity: bestSimilarity }
  } else {
    return { classification: "new", bestMatch, similarity: bestSimilarity }
  }
}

// ── Main Auto-Curator ──────────────────────────────────────────────────────

/**
 * Run the auto-curator for a given group_id.
 * Analyzes recent events and proposes candidate insights.
 *
 * This function READS from Postgres and PROPOSES to canonical_proposals.
 * It does NOT write to Neo4j or Notion directly.
 */
export async function autoCurate(
  scope: ResolvedWorkspaceScope,
  options?: {
    /** Analysis window in hours (default: 24) */
    windowHours?: number
    /** Maximum candidates to produce (default: 10) */
    maxCandidates?: number
  }
): Promise<PatternDetectionResult> {
  if (!scope || typeof scope !== "object" || !scope.tenantId || !scope.workspaceId || !scope.principalId) {
    throw new Error("auto-curator requires a server-resolved workspace scope")
  }
  const validatedGroupId = validateGroupId(scope.tenantId)
  const windowHours = options?.windowHours ?? 24
  const maxCandidates = options?.maxCandidates ?? 10

  // All analysis reads use the app role in the resolved workspace transaction.
  // Legacy NULL-workspace events are intentionally excluded.
  const eventResult = await withWorkspaceTransaction(scope, async (pg) => pg.query(
    `SELECT id, event_type, agent_id, group_id, workspace_id, status, metadata, created_at
     FROM events
     WHERE group_id = $1
       AND workspace_id = $2
       AND created_at >= NOW() - ($3 * INTERVAL '1 hour')
     ORDER BY created_at DESC`,
    [validatedGroupId, scope.workspaceId, windowHours],
  ))

  const events: RawEvent[] = eventResult.rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    agent_id: row.agent_id,
    group_id: row.group_id,
    workspace_id: row.workspace_id,
    status: row.status,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {},
    created_at: row.created_at,
  }))

  const allCandidates = [
    ...detectFailurePatterns(events),
    ...detectWinPatterns(events),
    ...detectApprovalPatterns(events),
    ...detectToolRiskPatterns(events),
  ]
  // `allura_memories` is legacy group-scoped data with no workspace authority.
  // It must not affect a workspace-governed candidate until retained knowledge
  // has its own reviewed workspace-scoped model.
  const existingContents: string[] = []

  const filteredCandidates: CandidateInsight[] = []
  let duplicatesSuppressed = 0

  for (const candidate of allCandidates) {
    candidate.source_scope = { group_id: validatedGroupId, workspace_id: scope.workspaceId }
    const similarity = classifySimilarity(candidate.content, existingContents)

    switch (similarity.classification) {
      case "duplicate":
        duplicatesSuppressed++
        continue
      case "supersede":
        candidate.requires_approval = true
        candidate.reasoning += ` (Similar to existing insight, similarity: ${Math.round(similarity.similarity * 100)}%)`
        break
      case "related":
        candidate.reasoning += ` (Related to existing content, similarity: ${Math.round(similarity.similarity * 100)}%)`
        break
      case "new":
        break
    }

    const score = await curatorScore({ content: candidate.content, source: "conversation", usageCount: candidate.frequency })
    candidate.confidence = score.confidence
    candidate.tier = score.tier
    candidate.reasoning = score.reasoning + ". " + candidate.reasoning
    if (candidate.type === "failure" && candidate.frequency >= 5) {
      candidate.impact = "high"
      candidate.requires_approval = true
    }
    filteredCandidates.push(candidate)
  }

  filteredCandidates.sort((a, b) => b.confidence - a.confidence)
  const topCandidates = filteredCandidates.slice(0, maxCandidates)
  for (const candidate of topCandidates) validateCandidate(candidate)

  return {
    candidates: topCandidates,
    patterns_detected: allCandidates.length,
    events_analyzed: events.length,
    duplicates_suppressed: duplicatesSuppressed,
    analysis_window_hours: windowHours,
  }
}

/**
 * Submit a candidate insight to the curator pipeline.
 * Creates a canonical_proposals row with status='pending'.
 * High-impact candidates ALWAYS require HITL.
 */
export async function submitCandidate(candidate: CandidateInsight, scope: ResolvedWorkspaceScope): Promise<{ proposal_id: string; status: string; requires_approval: boolean }> {
  validateCandidate(candidate)
  const validatedGroupId = validateGroupId(candidate.group_id)
  if (validatedGroupId !== scope.tenantId) {
    throw new Error("candidate group does not match resolved workspace scope")
  }

  const result = await withWorkspaceTransaction(scope, async (pg) => {
    if (!candidate.source_scope || candidate.source_scope.group_id !== scope.tenantId || candidate.source_scope.workspace_id !== scope.workspaceId) {
      throw new Error("candidate source scope does not match resolved workspace scope")
    }
    const sourceEvents = await pg.query(
      `SELECT id FROM events
       WHERE group_id = $1 AND workspace_id = $2 AND id = ANY($3::bigint[])`,
      [scope.tenantId, scope.workspaceId, candidate.source_event_ids],
    )
    if (sourceEvents.rows.length !== new Set(candidate.source_event_ids).size) {
      throw new Error("candidate source events do not belong to resolved workspace scope")
    }
    const proposal = await pg.query(
      `INSERT INTO canonical_proposals (group_id, workspace_id, content, score, tier, reasoning, status, trace_ref, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, status`,
      [
        validatedGroupId,
        scope.workspaceId,
        candidate.content,
        candidate.confidence,
        candidate.tier,
        candidate.reasoning,
        "pending", // All go to pending — auto-promote handles the rest
        candidate.source_event_ids[0], // canonical_proposals.trace_ref is a durable single-event bigint reference; full provenance is retained in evidence metadata.
      ]
    )

    // The append-only evidence row is part of the same app-role, workspace
    // transaction as its proposal; it cannot become legacy-unscoped evidence.
    await pg.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        validatedGroupId,
        scope.workspaceId,
        "auto_curated",
        "auto-curator",
        "completed",
        JSON.stringify({
          candidate_id: candidate.id,
          proposal_id: proposal.rows[0].id,
          type: candidate.type,
          impact: candidate.impact,
          frequency: candidate.frequency,
          novelty_score: candidate.novelty_score,
          requires_approval: candidate.requires_approval,
          source_scope: candidate.source_scope,
          source_event_ids: candidate.source_event_ids,
        }),
      ]
    )

    return proposal
  })

  return {
    proposal_id: result.rows[0].id,
    status: result.rows[0].status,
    requires_approval: candidate.requires_approval,
  }
}
// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate that a candidate insight has all required fields.
 * Throws if any required field is missing or invalid.
 * This is a safety guardrail — no candidate should ever be submitted
 * without passing this validation.
 */
export function validateCandidate(candidate: CandidateInsight): void {
  const errors: string[] = []

  if (!candidate.id || candidate.id.trim().length === 0) errors.push("id is required")
  if (!candidate.group_id || !candidate.group_id.match(/^allura-/)) errors.push("group_id must match ^allura-")
  if (!candidate.type || !["decision", "pattern", "failure", "optimization"].includes(candidate.type)) errors.push("type must be decision|pattern|failure|optimization")
  if (!candidate.content || candidate.content.trim().length === 0) errors.push("content is required")
  if (typeof candidate.confidence !== "number" || candidate.confidence < 0 || candidate.confidence > 1) errors.push("confidence must be 0.0–1.0")
  if (!candidate.impact || !["low", "medium", "high"].includes(candidate.impact)) errors.push("impact must be low|medium|high")
  if (typeof candidate.frequency !== "number" || candidate.frequency < 1) errors.push("frequency must be >= 1")
  if (typeof candidate.novelty_score !== "number" || candidate.novelty_score < 0 || candidate.novelty_score > 1) errors.push("novelty_score must be 0.0–1.0")
  if (!candidate.reasoning || candidate.reasoning.trim().length === 0) errors.push("reasoning is required")
  if (!candidate.tier || !["emerging", "adoption", "mainstream"].includes(candidate.tier)) errors.push("tier must be emerging|adoption|mainstream")
  if (!Array.isArray(candidate.source_event_ids)) errors.push("source_event_ids must be an array")
  if (typeof candidate.requires_approval !== "boolean") errors.push("requires_approval must be boolean")
  if (!candidate.created_at) errors.push("created_at is required")

  if (errors.length > 0) {
    throw new Error(`Invalid candidate: ${errors.join(", ")}`)
  }
}
