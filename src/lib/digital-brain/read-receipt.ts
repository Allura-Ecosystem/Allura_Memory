import { createHmac, randomUUID } from "node:crypto"

import type { AuthUser } from "@/lib/auth/types"
import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

/** A required, content-free decision record. It is not evidence of delivery. */
export interface AuthorizedReadReceipt {
  receiptId: string
  action: "read_documents" | "search_documents"
  decision: "allow_candidate"
  reasonCode: "authorized"
  policyVersion: "epic30-local-v2"
  tenantId: string
  workspaceId: string
  principalId: string
  actorRole: AuthUser["role"]
  sessionHash: string
  policyEpoch: number
  witnessHash: string
  queryHash: string | null
  occurredAt: string
}

export interface ReadReceiptInput {
  scope: DigitalBrainReadScope
  sessionId: string
  actorRole: AuthUser["role"]
  policyEpoch: number
  documents: readonly AuthorizedDocument[]
  /** Normalized synthetic search query; stored only as a keyed digest. */
  searchQuery?: string
  /** Per-run secret; never stored in the receipt table or sent to the browser. */
  witnessKey: Buffer
  receiptId?: string
  occurredAt?: Date
}

export interface ReadReceiptWriter {
  persist(receipt: AuthorizedReadReceipt): Promise<{ receiptId: string; witnessHash: string }>
}

function hmac(key: Buffer, domain: string, value: unknown): string {
  return createHmac("sha256", key).update(domain).update("\0").update(JSON.stringify(value)).digest("hex")
}

function assertInput(input: ReadReceiptInput): void {
  const { scope, sessionId, actorRole, policyEpoch, documents, witnessKey, receiptId, occurredAt, searchQuery } = input
  if (!scope.tenantId?.trim() || !scope.workspaceId?.trim() || !scope.principalId?.trim() ||
      !sessionId?.trim() || !["viewer", "curator", "admin"].includes(actorRole) ||
      !Number.isSafeInteger(policyEpoch) || policyEpoch <= 0 ||
      !Buffer.isBuffer(witnessKey) || witnessKey.length < 32 ||
      (receiptId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) ||
      (occurredAt !== undefined && Number.isNaN(occurredAt.getTime())) ||
      (searchQuery !== undefined && (searchQuery.length < 2 || searchQuery.length > 120 ||
        searchQuery !== searchQuery.trim().toLocaleLowerCase("en-US")))) {
    throw new Error("Synthetic read receipt input refused")
  }
  const seen = new Set<string>()
  for (const document of documents) {
    if (!document.id?.trim() || document.groupId !== scope.tenantId ||
        document.workspaceId !== scope.workspaceId || seen.has(document.id) ||
        !document.ownerId?.trim() || typeof document.title !== "string" ||
        typeof document.content !== "string" ||
        (document.visibility !== "private" && document.visibility !== "department") ||
        (document.visibility === "private" && document.departmentId !== null) ||
        (document.visibility === "department" && !document.departmentId?.trim()) ||
        !(document.updatedAt instanceof Date) || Number.isNaN(document.updatedAt.getTime())) {
      throw new Error("Synthetic read receipt document refused")
    }
    seen.add(document.id)
  }
}

export function createAuthorizedReadReceipt(input: ReadReceiptInput): AuthorizedReadReceipt {
  assertInput(input)
  const { scope, sessionId, actorRole, policyEpoch, documents, witnessKey, searchQuery } = input
  const sessionHash = hmac(witnessKey, "epic30-session-v1", sessionId)
  const action = searchQuery === undefined ? "read_documents" : "search_documents"
  const queryHash = searchQuery === undefined ? null : hmac(witnessKey, "epic30-search-query-v1", searchQuery)
  const witnessHash = hmac(witnessKey, "epic30-read-v2", {
    action,
    queryHash,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    actorRole,
    sessionHash,
    policyEpoch,
    documents: documents.map((document) => ({
      id: document.id,
      ownerId: document.ownerId,
      departmentId: document.departmentId,
      visibility: document.visibility,
      title: document.title,
      content: document.content,
      updatedAt: document.updatedAt.toISOString(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  })
  return Object.freeze({
    receiptId: input.receiptId ?? randomUUID(),
    action,
    decision: "allow_candidate" as const,
    reasonCode: "authorized" as const,
    policyVersion: "epic30-local-v2" as const,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    actorRole,
    sessionHash,
    policyEpoch,
    witnessHash,
    queryHash,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  })
}

/** A writer must acknowledge the exact committed receipt before disclosure. */
export async function persistAuthorizedReadReceipt(
  input: ReadReceiptInput,
  writer: ReadReceiptWriter,
): Promise<AuthorizedReadReceipt> {
  const receipt = createAuthorizedReadReceipt(input)
  const acknowledgement = await writer.persist(receipt)
  if (acknowledgement.receiptId !== receipt.receiptId || acknowledgement.witnessHash !== receipt.witnessHash) {
    throw new Error("Synthetic read receipt acknowledgement refused")
  }
  return receipt
}
