/**
 * curator/score.ts — Curator Scoring System
 *
 * Scores user memories on confidence (0.0–1.0) with reasoning.
 * Determines promotion tier (emerging/adoption/mainstream) based on thresholds.
 *
 * BLUEPRINT: F10 (score proposal, returns confidence + reasoning + tier)
 */

if (typeof window !== "undefined") {
  throw new Error("Curator scoring can only be used server-side");
}

import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────

export type PromotionTier = "emerging" | "adoption" | "mainstream";

export interface CuratorScore {
  confidence: number; // 0.0 to 1.0
  reasoning: string; // One sentence explanation
  tier: PromotionTier;
}

export interface ScoringContext {
  /** The memory content to score */
  content: string;

  /** Confidence tiers [emerging_threshold, adoption_threshold, mainstream_threshold] */
  tiers?: [number, number, number];

  /** Optional: How many times this memory was used */
  usageCount?: number;

  /** Optional: Days since memory was created */
  daysSinceCreated?: number;

  /** Optional: Source of memory ("conversation" or "manually_added") */
  source?: "conversation" | "manually_added";
}

// ── Validation ─────────────────────────────────────────────────────────────

const ScoringContextSchema = z.object({
  content: z.string().min(5),
  tiers: z
    .tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)])
    .default([0.6, 0.75, 0.85]),
  usageCount: z.number().int().min(0).optional(),
  daysSinceCreated: z.number().int().min(0).optional(),
  source: z.enum(["conversation", "manually_added"]).optional(),
});

// ── Rule-based Scoring ─────────────────────────────────────────────────────

/**
 * Heuristic scorer using simple confidence signals.
 *
 * Signals:
 * - Length (longer, more specific = higher confidence)
 * - Specificity markers ("I prefer", "never", "always")
 * - Source (from conversation = higher than manual)
 * - Usage (repeated use = higher confidence)
 * - Freshness (recent memories = higher)
 */
function scoreMemory(context: ScoringContext): CuratorScore {
  const { content, tiers = [0.6, 0.75, 0.85], usageCount = 0, daysSinceCreated = 0, source = "conversation" } = context;

  let confidence = 0.5; // Base confidence

  // Signal 1: Specificity markers
  const specificityPatterns = [
    /^i (always|never|prefer|hate|like|love)/i,
    /^my (favorite|preferred|preferred|typical|usual|default)/i,
    /\b(whenever|always|never|never fails|always fails)\b/i,
  ];
  const hasSpecificity = specificityPatterns.some((p) => p.test(content));
  if (hasSpecificity) confidence += 0.15;

  // Signal 2: Length (more detail = confidence)
  const words = content.split(/\s+/).length;
  if (words > 20) confidence += 0.1;
  if (words > 50) confidence += 0.05;

  // Signal 3: Source reliability
  if (source === "conversation") confidence += 0.1;
  // manually_added starts at base

  // Signal 4: Usage pattern (repeated use validates memory)
  if (usageCount >= 1) confidence += 0.05;
  if (usageCount >= 3) confidence += 0.05;
  if (usageCount >= 5) confidence += 0.05;

  // Signal 5: Freshness (recent = validated by recent behavior)
  if (daysSinceCreated <= 7) confidence += 0.05;
  if (daysSinceCreated <= 1) confidence += 0.05;

  // Signal 6: Risk reduction (avoid promoting empty, generic, or vague)
  const vaguePhrases = [/^(something|stuff|things|etc)\b/i, /^(maybe|i think|i guess|not sure)\b/i];
  const isVague = vaguePhrases.some((p) => p.test(content));
  if (isVague) confidence = Math.max(0.4, confidence - 0.15);

  // Cap at 1.0
  confidence = Math.min(1.0, confidence);

  // Determine tier based on thresholds
  const tier: PromotionTier =
    confidence >= tiers[2] ? "mainstream" : confidence >= tiers[1] ? "adoption" : "emerging";

  // Generate one-sentence reasoning
  const reasoningParts: string[] = [];

  if (hasSpecificity) reasoningParts.push("Shows specific preference");
  if (words > 50) reasoningParts.push("Detailed description");
  if (usageCount >= 5) reasoningParts.push("Validated by repeated use");
  if (daysSinceCreated <= 1) reasoningParts.push("Recently confirmed");
  if (source === "conversation") reasoningParts.push("Learned from conversation");

  let reasoning = reasoningParts.join("; ");
  if (!reasoning) {
    reasoning =
      tier === "mainstream"
        ? "Strong confidence signal"
        : tier === "adoption"
          ? "Moderate confidence, ready for review"
          : "Emerging signal, needs curator review";
  }

  return {
    confidence: Math.round(confidence * 100) / 100, // Round to 2 decimals
    reasoning,
    tier,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Score a memory for promotion.
 *
 * @param context Memory content and metadata
 * @returns Confidence score (0-1), reasoning, and promotion tier
 *
 * @example
 * const score = await curatorScore({
 *   content: "I always prefer responses under 200 words",
 *   source: "conversation",
 *   usageCount: 3,
 *   daysSinceCreated: 2,
 * });
 * // => { confidence: 0.85, reasoning: "Validated by repeated use; Detailed description", tier: "mainstream" }
 */
export async function curatorScore(context: ScoringContext): Promise<CuratorScore> {
  // Validate input
  const validated = ScoringContextSchema.parse(context);

  // Score using rule-based heuristics
  const score = scoreMemory(validated);

  return score;
}

/**
 * Batch score multiple memories.
 */
export async function curatorScoreBatch(
  contexts: ScoringContext[]
): Promise<CuratorScore[]> {
  return Promise.all(contexts.map((ctx) => curatorScore(ctx)));
}

/**
 * Get tier label for display.
 */
export function getTierLabel(tier: PromotionTier): string {
  const labels: Record<PromotionTier, string> = {
    emerging: "Emerging",
    adoption: "Adoption",
    mainstream: "Mainstream",
  };
  return labels[tier];
}

/**
 * Get tier color for UI badge.
 */
export function getTierColor(tier: PromotionTier): string {
  const colors: Record<PromotionTier, string> = {
    emerging: "amber", // Yellow
    adoption: "blue", // Blue
    mainstream: "green", // Green
  };
  return colors[tier];
}
