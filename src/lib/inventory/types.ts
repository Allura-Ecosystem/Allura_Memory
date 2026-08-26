/**
 * Normalized supply-chain inventory record types.
 *
 * Story 26.2: read-only metadata inventory for approved software and AI
 * supply-chain artifacts. No executable scanning, no package-manager calls.
 */

import type { z } from "zod";
import type {
  ArtifactType,
  FreshnessState,
  InventoryQuery,
  InventoryQueryResult,
  InventoryRecord,
  InventorySourceRecord,
  TenantScope,
  TrustState,
} from "./schemas";

// Re-export inferred types from the Zod schemas so consumers can import either
// the schemas file or this file for type-only usage.
export type ArtifactType = z.infer<typeof ArtifactType>;
export type TrustState = z.infer<typeof TrustState>;
export type FreshnessState = z.infer<typeof FreshnessState>;
export type InventoryRecord = z.infer<typeof InventoryRecord>;
export type InventoryQuery = z.infer<typeof InventoryQuery>;
export type InventoryQueryResult = z.infer<typeof InventoryQueryResult>;
export type InventorySourceRecord = z.infer<typeof InventorySourceRecord>;
export type TenantScope = z.infer<typeof TenantScope>;
