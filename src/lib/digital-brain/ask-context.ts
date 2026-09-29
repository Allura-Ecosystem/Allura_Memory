import { readAuthorizedDocuments } from "./read-service"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

export interface SyntheticAskContextSource {
  documentId: string
  title: string
  excerpt: string
}

export interface SyntheticAskContext {
  sources: SyntheticAskContextSource[]
}

const MAX_ASK_SOURCE_IDS = 200
const MAX_ASK_SOURCE_ID_LENGTH = 200
const MAX_ASK_EXCERPT_LENGTH = 512
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f\x7f]/

function isCanonicalSourceId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ASK_SOURCE_ID_LENGTH) return false
  if (value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) return false
  const hasMarkup = value.includes("[[") || value.includes("]]")
  return !value.includes("|") && !hasMarkup
}

function validateSourceIds(sourceIds: readonly string[]): void {
  if (
    !Array.isArray(sourceIds) ||
    sourceIds.length === 0 ||
    sourceIds.length > MAX_ASK_SOURCE_IDS ||
    sourceIds.some((sourceId) => !isCanonicalSourceId(sourceId))
  ) {
    throw new Error("Synthetic Ask context source IDs refused")
  }
}

function boundedExcerpt(content: string): string {
  if (content.length <= MAX_ASK_EXCERPT_LENGTH) return content
  let end = MAX_ASK_EXCERPT_LENGTH
  const finalUnit = content.charCodeAt(end - 1)
  if (finalUnit >= 0xd800 && finalUnit <= 0xdbff) end -= 1
  return content.slice(0, end)
}

function contextSource(document: AuthorizedDocument): SyntheticAskContextSource {
  return {
    documentId: document.id,
    title: document.title,
    excerpt: boundedExcerpt(document.content),
  }
}

/**
 * Build a provider-neutral context packet from a current authorized snapshot.
 * This function does not call a model, generate an answer, cache content, or
 * expose authority metadata. A missing source denies the whole packet.
 */
export async function resolveSyntheticAskContext(
  scope: DigitalBrainReadScope,
  sourceIds: readonly string[],
): Promise<SyntheticAskContext | null> {
  validateSourceIds(sourceIds)

  const documents = await readAuthorizedDocuments(scope)
  const authorizedById = new Map(documents.map((document) => [document.id, document]))
  const uniqueIds = [...new Set(sourceIds)]
  if (uniqueIds.some((documentId) => !authorizedById.has(documentId))) return null

  return { sources: uniqueIds.map((documentId) => contextSource(authorizedById.get(documentId)!)) }
}
