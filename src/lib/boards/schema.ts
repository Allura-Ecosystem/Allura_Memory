import { z } from "zod/v4"

export const BoardSourceTypeSchema = z.enum(["notion", "github", "allura-brain", "repo", "manual"])
export const BoardWriteModeSchema = z.enum(["read-only", "request-review", "manual"])
export const BoardAdapterSchema = z.enum(["notion-work-board", "memory-dashboard", "static-example"])
export const BoardStatusSchema = z.enum(["healthy", "degraded", "blocked", "empty"])

export const BoardSourceSchema = z.object({
  type: BoardSourceTypeSchema,
  label: z.string().min(1),
  owner: z.string().min(1),
  reference: z.string().min(1),
  public: z.boolean(),
})

export const BoardWritePolicySchema = z.object({
  mode: BoardWriteModeSchema,
  allowedActions: z.array(z.string().min(1)),
  requiresHumanApproval: z.boolean(),
  auditTarget: z.string().min(1),
})

export const BoardEvidencePolicySchema = z.object({
  requiredForDone: z.array(z.string().min(1)),
  receiptFormat: z.string().min(1),
})

export const BoardSectionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  status: BoardStatusSchema,
  emptyMessage: z.string().min(1),
})

export const BoardConfigSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  adapter: BoardAdapterSchema,
  source: BoardSourceSchema,
  writePolicy: BoardWritePolicySchema,
  evidencePolicy: BoardEvidencePolicySchema,
  degradedState: z.object({
    message: z.string().min(1),
    recovery: z.string().min(1),
  }),
  sections: z.array(BoardSectionSchema).min(1),
})

export type BoardConfig = z.infer<typeof BoardConfigSchema>
export type BoardStatus = z.infer<typeof BoardStatusSchema>

