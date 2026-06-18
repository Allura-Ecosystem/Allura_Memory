// Scoped search. Every search is bound to org group_id + workspace_id and every
// hit must carry provenance IDs (governance gate: no provenance-free results).

import type { AlluraScope } from "@allura/types";
import { assertScope, auditContext, type AuditContext } from "./policy.ts";

export interface SearchHit {
  id: string;
  score: number;
  provenance_ids: string[];
}

export interface SearchResult {
  hits: SearchHit[];
  audit: AuditContext;
}

/**
 * Stub: real impl delegates ANN ranking to RuVector, but Allura injects scope,
 * checks `memory:read`, and guarantees provenance + audit (AD-09, ADR-003).
 */
export async function search(
  scope: AlluraScope,
  query: string,
  hits: SearchHit[] = [],
): Promise<SearchResult> {
  assertScope(scope);
  if (!scope.scopes.includes("memory:read")) {
    throw new Error("scope memory:read required for search");
  }
  for (const h of hits) {
    if (h.provenance_ids.length === 0) {
      throw new Error(`hit ${h.id} missing provenance`);
    }
  }
  return { hits, audit: auditContext(scope, `search:${query.length}`) };
}
