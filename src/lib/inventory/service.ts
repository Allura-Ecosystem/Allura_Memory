/**
 * Read-only supply-chain inventory service.
 *
 * Story 26.2 constraints:
 * - Ingestion is declaration-only. No filesystem scanning, no package managers,
 *   no executable calls.
 * - Server-side only: the window guard throws if this module runs in a browser.
 * - Tenant scope is validated and stamped server-side; principal-binding is
 *   enforced at the API boundary, not by this service.
 */

import { z } from "zod";
import {
  InventorySourceRecord,
  InventoryQuery as InventoryQuerySchema,
  InventoryRecord as InventoryRecordSchema,
  InventoryQueryResult as InventoryQueryResultSchema,
  TenantScope as TenantScopeSchema,
} from "./schemas";
import type {
  InventoryRecord,
  InventoryQuery,
  InventoryQueryResult,
  TenantScope,
} from "./types";

if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

export interface InventoryService {
  queryInventory: (
    scope: TenantScope,
    query: InventoryQuery,
  ) => InventoryQueryResult;
  ingestSources: (
    scope: TenantScope,
    sources: Array<z.infer<typeof InventorySourceRecord>>,
  ) => Array<InventoryRecord>;
}

/**
 * Validate that a value is an acceptable tenant scope. Useful in API routes
 * before passing to the service. Delegates to the Zod schema so the regex and
 * shape rules have a single source of truth.
 */
export function isValidTenantScope(value: unknown): value is TenantScope {
  return TenantScopeSchema.safeParse(value).success;
}

function assertScope(scope: TenantScope): void {
  const parsed = TenantScopeSchema.safeParse(scope);
  if (!parsed.success) {
    throw new Error(`invalid tenant scope: ${parsed.error.message}`);
  }
}

function normalizeRecord(
  scope: TenantScope,
  source: z.infer<typeof InventorySourceRecord>,
  now: string,
): InventoryRecord {
  const parsed = InventorySourceRecord.safeParse(source);
  if (!parsed.success) {
    throw new Error(`invalid source record: ${parsed.error.message}`);
  }

  return InventoryRecordSchema.parse({
    id: parsed.data.id,
    group_id: scope.group_id,
    workspace_id: scope.workspace_id,
    artifact_type: parsed.data.artifact_type,
    ecosystem: parsed.data.ecosystem,
    package: parsed.data.package,
    version: parsed.data.version,
    hash: parsed.data.hash,
    publisher: parsed.data.publisher,
    workflow_reference: parsed.data.workflow_reference,
    source_ref: parsed.data.source_ref,
    trust_state: parsed.data.trust_state,
    freshness_state: parsed.data.freshness_state,
    created_at: parsed.data.created_at ?? now,
    updated_at: parsed.data.updated_at ?? now,
  });
}

function matchRecord(
  record: InventoryRecord,
  query: InventoryQuery,
): boolean {
  if (query.artifact_type && record.artifact_type !== query.artifact_type) {
    return false;
  }
  if (
    query.ecosystem &&
    record.ecosystem.toLowerCase() !== query.ecosystem.toLowerCase()
  ) {
    return false;
  }
  if (
    query.package &&
    record.package.toLowerCase() !== query.package.toLowerCase()
  ) {
    return false;
  }
  return true;
}

/**
 * Create an inventory service backed by declared metadata sources.
 *
 * The service never executes external commands, reads files, or mutates any
 * database. It normalizes and filters the supplied declaration list.
 */
export function createInventoryService(): InventoryService {
  const records: InventoryRecord[] = [];

  function queryInventory(
    scope: TenantScope,
    query: InventoryQuery,
  ): InventoryQueryResult {
    assertScope(scope);
    const parsedQuery = InventoryQuerySchema.parse(query);

    const filtered = records.filter(
      (record) =>
         record.group_id === scope.group_id &&
         record.workspace_id === scope.workspace_id &&
         matchRecord(record, parsedQuery),
    );

    return {
      records: filtered,
      total: filtered.length,
      degraded: false,
      warnings: [],
    };
  }

  function ingestSources(
    scope: TenantScope,
    sources: Array<z.infer<typeof InventorySourceRecord>>,
  ): InventoryRecord[] {
    assertScope(scope);

    const now = new Date().toISOString();
    const normalized = sources.map((source) =>
      normalizeRecord(scope, source, now),
    );

    for (const record of normalized) {
      const index = records.findIndex(
        (existing) =>
          existing.group_id === record.group_id &&
          existing.workspace_id === record.workspace_id &&
          existing.id === record.id,
      );
      if (index >= 0) {
        records[index] = record;
      } else {
        records.push(record);
      }
    }

    return normalized;
  }

  return { queryInventory, ingestSources };
}

