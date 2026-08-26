/**
 * Governed mitigation policy draft types.
 *
 * Story 26.5: read-only simulated policy drafts produced from a verified
 * exposure alert and a versioned mitigation template. Re-exports inferred types
 * from the Zod schemas at the external boundary.
 */

import type { z } from "zod"
import type {
  AffectedScopeKind,
  ApprovalState,
  AuthorityState,
  MitigationDraft,
  MitigationDraftRecord,
  MitigationDraftRecordAction,
  MitigationTemplate,
} from "./schemas"

export type AffectedScopeKind = z.infer<typeof AffectedScopeKind>
export type AuthorityState = z.infer<typeof AuthorityState>
export type ApprovalState = z.infer<typeof ApprovalState>
export type MitigationDraftRecordAction = z.infer<typeof MitigationDraftRecordAction>
export type MitigationTemplate = z.infer<typeof MitigationTemplate>
export type MitigationDraft = z.infer<typeof MitigationDraft>
export type MitigationDraftRecord = z.infer<typeof MitigationDraftRecord>
