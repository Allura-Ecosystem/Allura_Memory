import { isCanonicalDocumentId } from "./document-id"
import { type AuthorizedDocument, type DigitalBrainReadScope, readAuthorizedDocuments } from "./read-service"

export interface AuthorizedLinkEndpoint {
  documentId: string
  title: string
}

export interface FocusedDocumentLinks {
  documentId: string
  title: string
  links: AuthorizedLinkEndpoint[]
  backlinks: AuthorizedLinkEndpoint[]
}

/** Explicit ID links only; titles and aliases cannot silently resolve to another record. */
function referencedIds(content: string): Set<string> {
  const ids = new Set<string>()
  for (const match of content.matchAll(/\[\[([^\]\r\n]{1,200})\]\]/g)) {
    const id = match[1]
    if (isCanonicalDocumentId(id)) ids.add(id)
  }
  return ids
}

function endpoint(document: AuthorizedDocument): AuthorizedLinkEndpoint {
  return { documentId: document.id, title: document.title }
}

function byTitleThenId(left: AuthorizedLinkEndpoint, right: AuthorizedLinkEndpoint): number {
  return left.title.localeCompare(right.title) || left.documentId.localeCompare(right.documentId)
}

/**
 * Synthetic one-hop relationship candidate. The shared reader proves the
 * principal's current document authority over every source and target before
 * any relationship name or existence is returned. A separate relationship
 * policy is not established here; no graph or stored edge is read.
 */
export async function readSyntheticDocumentLinks(
  scope: DigitalBrainReadScope,
  focusId: string,
): Promise<FocusedDocumentLinks | null> {
  if (!isCanonicalDocumentId(focusId)) {
    throw new Error("Synthetic link focus refused")
  }
  const documents = await readAuthorizedDocuments(scope)
  const byId = new Map(documents.map((document) => [document.id, document]))
  const focus = byId.get(focusId)
  // A missing ID and an unauthorized ID have the same non-disclosing result.
  if (!focus) return null
  const links = [...referencedIds(focus.content)]
    .filter((id) => id !== focusId)
    .map((id) => byId.get(id))
    .filter((document): document is AuthorizedDocument => document !== undefined)
    .map(endpoint)
    .sort(byTitleThenId)
  const backlinks = documents
    .filter((document) => document.id !== focusId && referencedIds(document.content).has(focusId))
    .map(endpoint)
    .sort(byTitleThenId)
  return { ...endpoint(focus), links, backlinks }
}
