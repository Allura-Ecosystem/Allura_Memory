import { readAuthorizedDocuments } from "./read-service"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

export interface SyntheticDerivativeSource {
  documentId: string
  title: string
}

export interface SyntheticDerivativeSources {
  sources: SyntheticDerivativeSource[]
}

const MAX_DERIVATIVE_SOURCE_IDS = 200
const MAX_DERIVATIVE_SOURCE_ID_LENGTH = 200
const CONTROL_CHARACTER_PATTERN = /[\x00-\x1f\x7f]/

function isCanonicalSourceId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DERIVATIVE_SOURCE_ID_LENGTH) return false
  if (value.trim() !== value || CONTROL_CHARACTER_PATTERN.test(value)) return false
  // Derivative sources accept canonical IDs only; aliases and markup must not
  // resolve to another document.
  return !value.includes("|") && !value.includes("[[") && !value.includes("]]")
}

function validateSourceIds(sourceIds: readonly string[]): void {
  if (
    !Array.isArray(sourceIds) ||
    sourceIds.length === 0 ||
    sourceIds.length > MAX_DERIVATIVE_SOURCE_IDS ||
    sourceIds.some((sourceId) => !isCanonicalSourceId(sourceId))
  ) {
    throw new Error("Synthetic derivative source IDs refused")
  }
}

function minimalSource(document: AuthorizedDocument): SyntheticDerivativeSource {
  return { documentId: document.id, title: document.title }
}

/**
 * Resolve a complete, current authorized source set for a synthetic derivative.
 * Missing and unauthorized sources intentionally have the same non-disclosing
 * result, and no derivative content or authority metadata crosses this seam.
 */
export async function resolveSyntheticDerivativeSources(
  scope: DigitalBrainReadScope,
  sourceIds: readonly string[]
): Promise<SyntheticDerivativeSources | null> {
  validateSourceIds(sourceIds)

  const documents = await readAuthorizedDocuments(scope)
  const authorizedById = new Map(documents.map((document) => [document.id, document]))
  const uniqueIds = [...new Set(sourceIds)]

  if (uniqueIds.some((documentId) => !authorizedById.has(documentId))) return null

  return { sources: uniqueIds.map((documentId) => minimalSource(authorizedById.get(documentId)!)) }
}
