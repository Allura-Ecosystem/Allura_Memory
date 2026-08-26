/**
 * Zod schemas for the read-only supply-chain inventory.
 *
 * External-boundary validation only. Internal code uses the inferred types.
 */

import { z } from "zod";

/**
 * Artifact kinds covered by the inventory.
 */
export const ArtifactType = z.enum([
  "sbom",
  "lockfile",
  "package_manifest",
  "ci_workflow",
  "container_metadata",
  "extension",
  "mcp_manifest",
  "skill",
  "plugin",
  "model_artifact",
]);

/**
 * Trust lifecycle state for an inventory record.
 */
export const TrustState = z.enum([
  "provisional",
  "verified",
  "rejected",
]);

/**
 * Freshness state — explicitly surfaces stale/degraded/missing rather than
 * silently omitting records.
 */
export const FreshnessState = z.enum([
  "fresh",
  "stale",
  "degraded",
  "unknown",
]);

/**
 * Tenant scope derived from the authenticated principal.
 */
export const TenantScope = z.object({
  group_id: z.string().regex(/^allura-[a-z0-9-]+$/),
  workspace_id: z.string().min(1),
});

/**
 * Normalized inventory record shape.
 */
export const InventoryRecord = z.object({
  id: z.string().min(1),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  artifact_type: ArtifactType,
  ecosystem: z.string().min(1),
  package: z.string().min(1),
  version: z.string().min(1),
  hash: z.string().min(1),
  publisher: z.string().min(1),
  workflow_reference: z.string().min(1),
  source_ref: z.string().min(1),
  trust_state: TrustState,
  freshness_state: FreshnessState,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * Declared source record supplied to the service. The service normalizes it into
 * an InventoryRecord. The source is a declaration, not a filesystem scan.
 */
export const InventorySourceRecord = z.object({
  id: z.string().min(1),
  artifact_type: ArtifactType,
  ecosystem: z.string().min(1),
  package: z.string().min(1),
  version: z.string().min(1),
  hash: z.string().min(1),
  publisher: z.string().min(1),
  workflow_reference: z.string().min(1),
  source_ref: z.string().min(1),
  trust_state: TrustState,
  freshness_state: FreshnessState,
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

/**
 * Query filters for inventory reads. Tenant scope is derived server-side and
 * is never caller-authoritative.
 */
export const InventoryQuery = z.object({
  artifact_type: ArtifactType.optional(),
  ecosystem: z.string().min(1).optional(),
  package: z.string().min(1).optional(),
});

/**
 * Query result contract.
 */
export const InventoryQueryResult = z.object({
  records: z.array(InventoryRecord),
  total: z.number().int().nonnegative(),
  degraded: z.boolean(),
  warnings: z.array(z.string()),
});
