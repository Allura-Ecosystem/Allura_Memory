/**
 * FR-7: Zod v4 schemas for all 9 Memory API endpoints.
 *
 * Provides runtime validation at the API boundary:
 * - Input schemas validate incoming requests (reject early on bad shape)
 * - Output schemas validate outgoing responses (drift detection, not rejection)
 *
 * Design principles (matching RK-17 dashboard-schemas pattern):
 * - Schemas validate, they don't transform
 * - Drift on output = logged warning, response still returned
 * - Drift on input = 422 rejection
 * - group_id MUST match ^allura- pattern (ARCH-001)
 *
 * Reference: docs/allura/BLUEPRINT.md
 */

import { z } from "zod/v4"

// ─── Shared Primitives ────────────────────────────────────────────────────

/**
 * Tenant namespace — enforced by PostgreSQL CHECK constraint.
 * Must match pattern: ^allura-.*  (ARCH-001)
 */
const GroupIdSchema = z
  .string()
  .min(1, "group_id is required")
  .regex(/^allura-.+$/, "group_id must match pattern: allura-*")

/**
 * Memory identifier — UUID v4
 */
const MemoryIdSchema = z.string().uuid("id must be a valid UUID v4")

/**
 * User identifier within a tenant
 */
const UserIdSchema = z.string().min(1, "user_id is required")

/**
 * Confidence score (0.0 to 1.0)
 */
const ConfidenceScoreSchema = z.number().min(0).max(1)

/**
 * Storage location
 */
const StorageLocationSchema = z.enum(["episodic", "semantic", "both"])

/**
 * Provenance
 */
const ProvenanceSchema = z.enum(["conversation", "manual"])

/**
 * Sort order for memory_list
 */
const SortOrderSchema = z.enum([
  "created_at_desc",
  "created_at_asc",
  "score_desc",
  "score_asc",
])

/**
 * Response metadata envelope
 */
const ResponseMetaSchema = z.object({
  contract_version: z.literal("v1"),
  degraded: z.boolean(),
  degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
  stores_used: z.array(z.enum(["postgres", "neo4j", "ruvector", "graph"])),
  stores_attempted: z.array(z.enum(["postgres", "neo4j", "ruvector", "graph"])).optional(),
  warnings: z.array(z.string()).optional(),
  ruvector_trajectory_id: z.string().optional(),
  ruvector_count: z.number().int().min(0).optional(),
})

/**
 * Optional metadata on add/update
 */
const MemoryMetadataSchema = z.object({
  source: ProvenanceSchema.optional(),
  conversation_id: z.string().optional(),
  agent_id: z.string().optional(),
}).passthrough() // allow extra keys

const EvidenceChainItemSchema = z.object({
  id: z.string().nullable(),
  type: z.enum(["event", "proposal", "trace", "version"]),
  label: z.string(),
  status: z.enum(["available", "unavailable"]),
})

// ─── Common Memory Result Shape ───────────────────────────────────────────

/**
 * Shape shared by get/list/export/search result items
 */
const MemoryItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: ConfidenceScoreSchema,
  source: StorageLocationSchema,
  provenance: ProvenanceSchema,
  user_id: UserIdSchema,
  actor: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  approver: z.string().nullable().optional(),
  group_id: GroupIdSchema,
  created_at: z.string(),
  status: z.enum(["approved", "proposed", "pending", "deprecated", "active", "deleted"]).optional(),
  source_event_id: z.string().nullable().optional(),
  proposal_id: z.string().nullable().optional(),
  trace_ref: z.union([z.string(), z.number()]).nullable().optional(),
  evidence: z.array(EvidenceChainItemSchema).optional(),
  version: z.number().int().min(1).optional(),
  superseded_by: z.string().optional(),
  usage_count: z.number().int().min(0).optional(),
  recent_usage_count: z.number().int().min(0).nullable().optional(),
  hash: z.string().nullable().optional(),
  previous_hash: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  schema_version: z.number().int().optional(),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. memory_add
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryAddInputSchema = z.object({
  group_id: GroupIdSchema,
  user_id: UserIdSchema,
  content: z.string().min(1, "content is required"),
  metadata: MemoryMetadataSchema.optional(),
  threshold: z.number().min(0).max(1).optional(),
})

export const MemoryAddOutputSchema = z.object({
  id: z.string(),
  stored: StorageLocationSchema,
  score: ConfidenceScoreSchema,
  pending_review: z.boolean().optional(),
  created_at: z.string(),
  meta: ResponseMetaSchema.optional(),
  duplicate: z.boolean().optional(),
  duplicate_of: z.string().optional(),
  similarity: z.number().optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. memory_search
// ═══════════════════════════════════════════════════════════════════════════

const SearchResultItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: ConfidenceScoreSchema,
  source: StorageLocationSchema,
  provenance: ProvenanceSchema,
  created_at: z.string(),
  usage_count: z.number().int().min(0).optional(),
  tags: z.array(z.string()).optional(),
  schema_version: z.number().int().optional(),
})

export const MemorySearchInputSchema = z.object({
  query: z.string().min(1, "query is required"),
  group_id: GroupIdSchema,
  user_id: UserIdSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  min_score: ConfidenceScoreSchema.optional(),
  include_global: z.boolean().optional(),
})

export const MemorySearchOutputSchema = z.object({
  results: z.array(SearchResultItemSchema),
  count: z.number().int().min(0),
  latency_ms: z.number().min(0),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. memory_list
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryListInputSchema = z.object({
  group_id: GroupIdSchema,
  user_id: UserIdSchema.optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  offset: z.number().int().min(0).optional(),
  sort: SortOrderSchema.optional(),
})

export const MemoryListOutputSchema = z.object({
  memories: z.array(MemoryItemSchema),
  total: z.number().int().min(0),
  has_more: z.boolean(),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. memory_get
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryGetInputSchema = z.object({
  id: MemoryIdSchema,
  group_id: GroupIdSchema,
})

export const MemoryGetOutputSchema = MemoryItemSchema

// ═══════════════════════════════════════════════════════════════════════════
// 5. memory_update
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryUpdateInputSchema = z.object({
  id: MemoryIdSchema,
  group_id: GroupIdSchema,
  user_id: UserIdSchema,
  content: z.string().min(1, "content is required"),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const MemoryUpdateOutputSchema = z.object({
  id: z.string(),
  previous_id: z.string(),
  stored: StorageLocationSchema,
  version: z.number().int().min(1),
  updated_at: z.string(),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. memory_delete
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryDeleteInputSchema = z.object({
  id: MemoryIdSchema,
  group_id: GroupIdSchema,
  user_id: UserIdSchema,
})

export const MemoryDeleteOutputSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  deleted_at: z.string(),
  recovery_days: z.number().int().min(0),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. memory_promote
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryPromoteInputSchema = z.object({
  id: MemoryIdSchema,
  group_id: GroupIdSchema,
  user_id: UserIdSchema,
  curator_id: z.string().optional(),
  rationale: z.string().optional(),
})

export const MemoryPromoteOutputSchema = z.object({
  id: z.string(),
  proposal_id: z.string(),
  status: z.enum(["queued", "already_canonical"]),
  queued_at: z.string(),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. memory_restore
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryRestoreInputSchema = z.object({
  id: MemoryIdSchema,
  group_id: GroupIdSchema,
  user_id: UserIdSchema,
})

export const MemoryRestoreOutputSchema = z.object({
  id: z.string(),
  restored: z.boolean(),
  restored_at: z.string(),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. memory_export
// ═══════════════════════════════════════════════════════════════════════════

export const MemoryExportInputSchema = z.object({
  group_id: GroupIdSchema,
  user_id: UserIdSchema.optional(),
  canonical_only: z.boolean().optional(),
  format: z.enum(["json"]).optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  offset: z.number().int().min(0).optional(),
})

export const MemoryExportOutputSchema = z.object({
  memories: z.array(MemoryItemSchema),
  count: z.number().int().min(0),
  exported_at: z.string(),
  canonical_count: z.number().int().min(0),
  episodic_count: z.number().int().min(0),
  meta: ResponseMetaSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// Validation helpers (matching RK-17 pattern)
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationResult<T> {
  data: T
  warnings: string[]
  driftCount: number
}

/**
 * Validate input against a Zod schema. Returns parsed data or throws.
 * Used at the API boundary to reject malformed requests early (422).
 */
export function validateInput<T>(schema: z.ZodType<T>, data: unknown, endpoint: string): T {
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }

  const issues = result.error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
    code: i.code,
  }))

  console.warn(`[memory:input-validation] ${endpoint}: ${issues.length} validation errors`, {
    endpoint,
    issues,
  })

  // Re-throw so the API layer can catch and return 422
  const error = new Error(`Validation failed for ${endpoint}: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`)
  ;(error as any).code = "VALIDATION_ERROR"
  ;(error as any).issues = issues
  throw error
}

/**
 * Validate output against a Zod schema. Logs drift warnings but
 * does NOT throw — the response is still returned so callers
 * aren't broken by schema additions.
 *
 * This is drift detection: if the backend response shape drifts
 * from the schema, we log it but don't crash.
 */
export function validateOutput<T>(
  schema: z.ZodType<T>,
  data: T,
  endpoint: string
): ValidationResult<T> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { data, warnings: [], driftCount: 0 }
  }

  const warnings = result.error.issues.map((issue) => {
    const path = issue.path.join(".")
    return `${endpoint}.${path}: ${issue.message} (got ${issue.code})`
  })

  console.warn(`[memory:output-drift] ${endpoint}: ${warnings.length} schema violations`, {
    endpoint,
    issues: result.error.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      expected: "expected" in i ? i.expected : undefined,
      received: "received" in i ? i.received : undefined,
    })),
  })

  return { data, warnings, driftCount: warnings.length }
}

/**
 * Validate an array of output items, aggregating all drift warnings.
 */
export function validateOutputArray<T>(
  schema: z.ZodType<T>,
  items: T[],
  endpoint: string
): ValidationResult<T[]> {
  const allWarnings: string[] = []
  let totalDrift = 0

  const validated = items.map((item) => {
    const result = validateOutput(schema, item, endpoint)
    allWarnings.push(...result.warnings)
    totalDrift += result.driftCount
    return result.data
  })

  return { data: validated, warnings: allWarnings, driftCount: totalDrift }
}
