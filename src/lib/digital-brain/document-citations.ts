import { readAuthorizedDocuments } from "./read-service"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

export interface SyntheticCitation {
  documentId: string
  title: string
}

const MAX_CITATION_IDS = 200
const MAX_CITATION_ID_LENGTH = 200
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f\x7f]/

function isExplicitCitationId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CITATION_ID_LENGTH) return false
  if (value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) return false
  // The citation boundary accepts canonical IDs only; aliases and markup are
  // never resolved to another document.
  return !value.includes("|") && !value.includes("[[") && !value.includes("]]")
}

function validateCitationIds(citationIds: readonly string[]): void {
  if (!Array.isArray(citationIds) || citationIds.length > MAX_CITATION_IDS ||
      citationIds.some((citationId) => !isExplicitCitationId(citationId))) {
    throw new Error("Synthetic citation IDs refused")
  }
}

function minimalCitation(document: AuthorizedDocument): SyntheticCitation {
  return { documentId: document.id, title: document.title }
}

/**
 * Resolve explicit citation IDs only from the current receipt-gated document
 * snapshot. Missing and unauthorized IDs intentionally have the same omission.
 */
export async function resolveSyntheticCitations(
  scope: DigitalBrainReadScope,
  citationIds: readonly string[],
): Promise<SyntheticCitation[]> {
  validateCitationIds(citationIds)
  if (citationIds.length === 0) return []

  const documents = await readAuthorizedDocuments(scope)
  const authorizedById = new Map(documents.map((document) => [document.id, document]))
  const uniqueIds = [...new Set(citationIds)]

  return uniqueIds
    .map((documentId) => authorizedById.get(documentId))
    .filter((document): document is AuthorizedDocument => document !== undefined)
    .map(minimalCitation)
}
