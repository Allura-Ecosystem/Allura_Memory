import { createGroundedReadOnlyAnswer } from "./ask-answer"
import type { GroundedAskAnswer, ReadOnlyAskProvider } from "./ask-answer"
import type { SyntheticAskContext } from "./ask-context"
import { validateCanonicalDocumentIds } from "./document-id"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

export interface ProductionAuthorizedReadProviderLike {
  readAuthorizedSnapshot(
    scope: DigitalBrainReadScope,
    priorReceiptWitnessHash?: string,
  ): Promise<ProductionAuthorizedReadSnapshot>
}

export interface ProductionAuthorizedReadSnapshot {
  authority: {
    tenantId: string
    workspaceId: string
    principalId: string
    sessionId: string
    actorRole: "viewer" | "curator" | "admin"
    policyEpoch: number
    receiptWitnessHash: string
    priorReceiptWitnessHash: string | null
    decision: "authorized"
  }
  documents: AuthorizedDocument[]
}

const MAX_EXCERPT = 512
const MAX_TITLE = 200
const MAX_CONTEXT_UTF16_UNITS = 32_768

function boundedExcerpt(content: string): string {
  if (content.length <= MAX_EXCERPT) return content
  const finalUnit = content.charCodeAt(MAX_EXCERPT - 1)
  return content.slice(0, finalUnit >= 0xd800 && finalUnit <= 0xdbff ? MAX_EXCERPT - 1 : MAX_EXCERPT)
}

function boundedText(value: string, max: number): string {
  if (value.length <= max) return value
  const finalUnit = value.charCodeAt(max - 1)
  return value.slice(0, finalUnit >= 0xd800 && finalUnit <= 0xdbff ? max - 1 : max)
}

function snapshot(document: AuthorizedDocument): string {
  return JSON.stringify([
    document.id, document.groupId, document.workspaceId, document.ownerId,
    document.departmentId, document.visibility, document.title, document.content,
    document.updatedAt.toISOString(),
  ])
}

function exactAuthorizedSources(
  documents: readonly AuthorizedDocument[],
  sourceIds: readonly string[],
  scope: DigitalBrainReadScope,
): AuthorizedDocument[] | null {
  const scoped = documents.filter(document =>
    document.groupId === scope.tenantId && document.workspaceId === scope.workspaceId)
  if (scoped.some((document, index) => scoped.findIndex(candidate => candidate.id === document.id) !== index)) return null
  const ordered = sourceIds.map(id => scoped.find(document => document.id === id))
  return ordered.some(document => document === undefined) ? null : ordered as AuthorizedDocument[]
}

function contextFor(documents: readonly AuthorizedDocument[]): SyntheticAskContext | null {
  let total = 0
  const sources = documents.map(document => {
    const source = { documentId: document.id, title: boundedText(document.title, MAX_TITLE), excerpt: boundedExcerpt(document.content) }
    total += source.documentId.length + source.title.length + source.excerpt.length
    return source
  })
  return total <= MAX_CONTEXT_UTF16_UNITS ? { sources } : null
}

function authorityMatchesScope(snapshot: ProductionAuthorizedReadSnapshot, scope: DigitalBrainReadScope): boolean {
  const authority = snapshot.authority
  return authority.tenantId === scope.tenantId && authority.workspaceId === scope.workspaceId &&
    authority.principalId === scope.principalId && authority.sessionId.trim().length > 0 &&
    ["viewer", "curator", "admin"].includes(authority.actorRole) &&
    Number.isSafeInteger(authority.policyEpoch) && authority.policyEpoch > 0 &&
    /^[a-f0-9]{64}$/.test(authority.receiptWitnessHash) && authority.decision === "authorized"
}

function sameAuthority(
  first: ProductionAuthorizedReadSnapshot,
  second: ProductionAuthorizedReadSnapshot,
): boolean {
  const a = first.authority
  const b = second.authority
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId && a.principalId === b.principalId &&
    a.sessionId === b.sessionId && a.actorRole === b.actorRole && a.policyEpoch === b.policyEpoch &&
    a.decision === b.decision && a.priorReceiptWitnessHash === null &&
    b.priorReceiptWitnessHash === a.receiptWitnessHash
}

function validQuestion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2000 &&
    value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
}

/**
 * Unactivated coordinator for an approved no-retention/no-training provider.
 * The injected reader remains responsible for receipt-gated production scope.
 */
export async function createProductionAskCandidate(
  scope: DigitalBrainReadScope,
  question: string,
  sourceIds: readonly string[],
  reader: ProductionAuthorizedReadProviderLike,
  provider: ReadOnlyAskProvider,
): Promise<GroundedAskAnswer | null> {
  if (!validQuestion(question)) return null
  try {
    validateCanonicalDocumentIds(sourceIds)
  } catch {
    throw new Error("Production Ask source IDs refused")
  }
  if (provider.policy.retention !== "none" || provider.policy.training !== "none") {
    throw new Error("Ask provider policy refused")
  }
  const uniqueIds = sourceIds.filter((id, index) => sourceIds.indexOf(id) === index)
  if (uniqueIds.length !== sourceIds.length) throw new Error("Production Ask duplicate source IDs refused")
  try {
    const first = await reader.readAuthorizedSnapshot(scope)
    if (!authorityMatchesScope(first, scope)) return null
    const firstById = exactAuthorizedSources(first.documents, uniqueIds, scope)
    if (!firstById) return null
    const context = contextFor(firstById)
    if (!context) return null
    const result = await createGroundedReadOnlyAnswer(question, context, provider)
    if (!result) return null
    const second = await reader.readAuthorizedSnapshot(scope, first.authority.receiptWitnessHash)
    if (!authorityMatchesScope(second, scope) || !sameAuthority(first, second)) return null
    const secondById = exactAuthorizedSources(second.documents, uniqueIds, scope)
    if (!secondById || firstById.some((document, index) => snapshot(document) !== snapshot(secondById[index]))) {
      return null
    }
    return result
  } catch {
    return null
  }
}
