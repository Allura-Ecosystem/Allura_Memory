import { createHmac, randomUUID } from "node:crypto"

import type { AuthorizedDocument, DigitalBrainReadScope } from "./read-service"

/** A required, content-free decision record. It is not evidence of delivery. */
export interface AuthorizedReadReceipt {
  receiptId: string
  action: "read_documents"
  decision: "allow_candidate"
  reasonCode: "authorized"
  policyVersion: "epic30-local-v2"
  tenantId: string
  workspaceId: string
  principalId: string
  sessionHash: string
  policyEpoch: number
  witnessHash: string
  occurredAt: string
}

export interface ReadReceiptInput {
  scope: DigitalBrainReadScope
  sessionId: string
  policyEpoch: number
  documents: readonly AuthorizedDocument[]
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
  const { scope, sessionId, policyEpoch, documents, witnessKey, receiptId, occurredAt } = input
  if (!scope.tenantId?.trim() || !scope.workspaceId?.trim() || !scope.principalId?.trim() ||
      !sessionId?.trim() || !Number.isSafeInteger(policyEpoch) || policyEpoch <= 0 ||
      !Buffer.isBuffer(witnessKey) || witnessKey.length < 32 ||
      (receiptId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) ||
      (occurredAt !== undefined && Number.isNaN(occurredAt.getTime()))) {
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
  const { scope, sessionId, policyEpoch, documents, witnessKey } = input
  const sessionHash = hmac(witnessKey, "epic30-session-v1", sessionId)
  const witnessHash = hmac(witnessKey, "epic30-read-v1", {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
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
    action: "read_documents" as const,
    decision: "allow_candidate" as const,
    reasonCode: "authorized" as const,
    policyVersion: "epic30-local-v2" as const,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    sessionHash,
    policyEpoch,
    witnessHash,
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
