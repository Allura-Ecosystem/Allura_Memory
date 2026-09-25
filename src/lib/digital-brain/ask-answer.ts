import type { SyntheticAskContext, SyntheticAskContextSource } from "./ask-context"
import type { SyntheticCitation } from "./document-citations"

export interface AskProviderPolicy {
  retention: "none"
  training: "none"
}

export interface ReadOnlyAskProvider {
  readonly policy: AskProviderPolicy
  answer(input: { question: string; sources: readonly SyntheticAskContextSource[] }): Promise<{
    answer: string
    citationIds: readonly string[]
  }>
}

export interface GroundedAskAnswer {
  answer: string
  citations: SyntheticCitation[]
}

const MAX_QUESTION_LENGTH = 2000
const MAX_ANSWER_LENGTH = 4000
const MAX_CITATIONS = 20

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
}

function assertProviderPolicy(provider: ReadOnlyAskProvider): void {
  if (provider.policy.retention !== "none" || provider.policy.training !== "none") {
    throw new Error("Ask provider policy refused")
  }
}

/**
 * Run a read-only answer only over an already receipt-gated context packet.
 * Provider output is accepted only when every citation points at supplied
 * context, preventing fabricated or out-of-scope citations.
 */
export async function createGroundedReadOnlyAnswer(
  question: string,
  context: SyntheticAskContext | null,
  provider: ReadOnlyAskProvider,
): Promise<GroundedAskAnswer | null> {
  if (!validText(question, MAX_QUESTION_LENGTH) || !context ||
      !Array.isArray(context.sources) || context.sources.length === 0) return null
  assertProviderPolicy(provider)
  let result: Awaited<ReturnType<ReadOnlyAskProvider["answer"]>>
  try {
    result = await provider.answer({ question, sources: context.sources })
  } catch {
    return null
  }
  if (!validText(result.answer, MAX_ANSWER_LENGTH) || !Array.isArray(result.citationIds) ||
      result.citationIds.length === 0 || result.citationIds.length > MAX_CITATIONS) return null
  const byId = new Map(context.sources.map((source) => [source.documentId, source]))
  const uniqueIds = [...new Set(result.citationIds)]
  if (uniqueIds.length !== result.citationIds.length || uniqueIds.some((id) => typeof id !== "string" || !byId.has(id))) return null
  return { answer: result.answer, citations: uniqueIds.map((id) => {
    const source = byId.get(id)!
    return { documentId: source.documentId, title: source.title }
  }) }
}
