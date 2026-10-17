import { ZodError } from "zod"
import { curatorScore } from "./score"

/** Read-only recomputation under today's scorer with creation-equivalent inputs.
 * This is not a persisted immutable historical score and confers no approval.
 */
export async function scoreEpisodicMemory(content: string, provenance?: string | null): Promise<number> {
  try {
    const score = await curatorScore({ content,
      source: provenance === "manual" ? "manually_added" : "conversation",
      usageCount: 0, daysSinceCreated: 0 })
    return score.confidence
  } catch (error) {
    // Compatibility for old invalid content only. Operational errors must surface.
    if (error instanceof ZodError) return 0
    throw error
  }
}
