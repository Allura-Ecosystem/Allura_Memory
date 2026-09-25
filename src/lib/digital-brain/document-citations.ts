import { validateCanonicalDocumentIds } from "./document-id"
import { readAuthorizedDocuments } from "./read-service"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

export interface SyntheticCitation {
  documentId: string
  title: string
}

function validateCitationIds(citationIds: readonly string[]): void {
  try { validateCanonicalDocumentIds(citationIds, { allowEmpty: true }) } catch { throw new Error("Synthetic citation IDs refused") }
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
