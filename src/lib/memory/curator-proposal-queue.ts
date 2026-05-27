import { getPool } from "@/lib/postgres/connection"
import { validateGroupId } from "@/lib/validation/group-id"

export interface RawCuratorProposal {
  id?: unknown
  group_id?: unknown
  content?: unknown
  score?: unknown
  reasoning?: unknown
  tier?: unknown
  status?: unknown
  trace_ref?: unknown
  created_at?: unknown
}

export interface CuratorProposalQueueItem {
  proposalId: string
  groupId: string
  contentPreview: string
  score: number
  reasoning: string
  tier: string
  status: string
  traceRef: string
  createdAt: string
  readOnly: true
}

interface Queryable {
  query(sql: string, params: unknown[]): Promise<{ rows: RawCuratorProposal[] }>
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function requiredText(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(`Curator proposal queue row is missing required ${field}`)
}

function score(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function requiredScore(value: unknown): number {
  const parsed = score(value)
  if ((typeof value === "number" || typeof value === "string") && parsed >= 0) return parsed
  throw new Error("Curator proposal queue row is missing required score")
}

function iso(value: unknown): string {
  if (!(typeof value === "string" || value instanceof Date)) {
    throw new Error("Curator proposal queue row is missing required created_at")
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error("Curator proposal queue row has invalid created_at")
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function preview(content: string): string {
  return content.length > 160 ? `${content.slice(0, 157)}...` : content
}

export function formatCuratorProposalQueue(
  proposals: RawCuratorProposal[],
  groupId: string
): CuratorProposalQueueItem[] {
  const validatedGroupId = validateGroupId(groupId)

  return proposals.map((proposal) => {
    const proposalGroupId = text(proposal.group_id, validatedGroupId)
    if (proposalGroupId !== validatedGroupId) {
      throw new Error(`Curator proposal queue scope mismatch: expected ${validatedGroupId}, received ${proposalGroupId}`)
    }

    const content = requiredText(proposal.content, "content")
    return {
      proposalId: requiredText(proposal.id, "id"),
      groupId: validatedGroupId,
      contentPreview: preview(content),
      score: requiredScore(proposal.score),
      reasoning: requiredText(proposal.reasoning, "reasoning"),
      tier: requiredText(proposal.tier, "tier"),
      status: requiredText(proposal.status, "status"),
      traceRef: requiredText(proposal.trace_ref, "trace_ref"),
      createdAt: iso(proposal.created_at),
      readOnly: true,
    }
  })
}

export async function getScopedCuratorProposalQueue(
  groupId: string,
  pool: Queryable = getPool() as Queryable,
  limit = 50
): Promise<CuratorProposalQueueItem[]> {
  const validatedGroupId = validateGroupId(groupId)
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))

  const result = await pool.query(
    `SELECT id, group_id, content, score, reasoning, tier, status, trace_ref, created_at
     FROM canonical_proposals
     WHERE group_id = $1
       AND status = $2
     ORDER BY created_at ASC
     LIMIT $3`,
    [validatedGroupId, "pending", safeLimit]
  )

  return formatCuratorProposalQueue(result.rows, validatedGroupId)
}
