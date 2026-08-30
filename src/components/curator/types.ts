import { z } from "zod"

export const CuratorDecisionSchema = z.enum(["approve", "reject", "request_evidence"])
export type CuratorDecision = z.infer<typeof CuratorDecisionSchema>

export const EvidenceRequestSchema = z.object({
  id: z.string(),
  proposal_id: z.string(),
  requested_by: z.string(),
  requested_at: z.string(),
  state: z.string(),
  reason: z.string(),
  resolved_at: z.string().nullable(),
  resolved_by: z.string().nullable(),
  evidence_references: z.unknown(),
})

export const GovernanceReceiptSchema = z.object({
  id: z.string(),
  proposal_id: z.string(),
  action: CuratorDecisionSchema,
  actor_id: z.string(),
  actor_role: z.enum(["curator", "admin"]),
  rationale: z.string(),
  policy_reference: z.string(),
  policy_version: z.string(),
  memory_id: z.string().nullable(),
  result_ref: z.string().nullable(),
  outbox_state: z.string(),
  evidence_request_id: z.string().nullable(),
  evidence_references: z.unknown(),
  occurred_at: z.string(),
}).passthrough()

export const ProposalSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  workspace_id: z.string(),
  content: z.string(),
  score: z.number(),
  reasoning: z.string().nullable(),
  tier: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  trace_ref: z.union([z.string(), z.number()]).nullable(),
  created_at: z.string(),
  evidence: z.array(EvidenceRequestSchema),
  decision_receipt: GovernanceReceiptSchema.nullable(),
})

export const ProposalResponseSchema = z.object({ proposals: z.array(ProposalSchema) })

export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>
export type GovernanceReceipt = z.infer<typeof GovernanceReceiptSchema>
export type Proposal = z.infer<typeof ProposalSchema>

