/**
 * Read-only exposure matcher.
 *
 * Story 26.3: matches verified+fresh threat advisories against verified+fresh
 * supply-chain inventory records and returns deduplicated, evidence-backed
 * exposure alerts.
 *
 * Constraints:
 * - Server-side only (window guard).
 * - In-memory only: no DB writes, no filesystem, no subprocesses, no policy activation.
 * - Fail-closed: only `verified` + `fresh` records on BOTH sides produce matches.
 * - Scope is validated here; principal-binding is enforced at the API boundary
 *   (Story 26.1).
 */

import { computeDedupKey, deriveAlertId } from "./dedup";
import {
  ExposureAlert as ExposureAlertSchema,
  ExposureMatch as ExposureMatchSchema,
  ExposureQuery,
  ThreatAdvisory as ThreatAdvisorySchema,
} from "./schemas";
import type {
  ExposureAlert,
  ExposureMatch,
  Indicator,
  MatchType,
  Severity,
  ThreatAdvisory,
} from "./types";
import { TenantScope as TenantScopeSchema } from "../inventory/schemas";
import type { InventoryQuery, InventoryQueryResult, InventoryRecord, TenantScope } from "../inventory/types";

if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

export interface InventoryProvider {
  queryInventory: (scope: TenantScope, query: InventoryQuery) => InventoryQueryResult;
}

export interface ExposureMatcher {
  matchAdvisory: (
    scope: TenantScope,
    inventory: InventoryProvider,
    advisory: ThreatAdvisory,
  ) => ExposureMatch[];
  createAlerts: (scope: TenantScope, matches: ExposureMatch[]) => ExposureAlert[];
  queryAlerts: (
    scope: TenantScope,
    alerts: ExposureAlert[],
    query: Record<string, unknown>,
  ) => ExposureAlert[];
}

function assertScope(scope: TenantScope): void {
  const parsed = TenantScopeSchema.safeParse(scope);
  if (!parsed.success) {
    throw new Error(`invalid tenant scope: ${parsed.error.message}`);
  }
}

function isAdvisoryActive(advisory: ThreatAdvisory): boolean {
  return advisory.trust_state === "verified" && advisory.freshness_state === "fresh";
}

function isInventoryActive(record: InventoryRecord): boolean {
  return record.trust_state === "verified" && record.freshness_state === "fresh";
}

function exactMatch(value: string, fieldValue: string): boolean {
  return fieldValue === value;
}

function matchByPackageVersion(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
): ExposureMatch | null {
  const packageIndicators = advisory.indicators.filter(
    (indicator: Indicator) => indicator.type === "package" || indicator.type === "version",
  );

  const packageIndicator = packageIndicators.find((i) => i.type === "package");
  const versionIndicator = packageIndicators.find((i) => i.type === "version");

  if (
    packageIndicator &&
    versionIndicator &&
    exactMatch(packageIndicator.value, record.package) &&
    exactMatch(versionIndicator.value, record.version)
  ) {
    return buildMatch(record, advisory, "package_version");
  }

  return null;
}

function matchByPackageHash(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
): ExposureMatch | null {
  const hashIndicator = advisory.indicators.find((i) => i.type === "hash");
  if (hashIndicator && exactMatch(hashIndicator.value, record.hash)) {
    return buildMatch(record, advisory, "package_hash");
  }

  return null;
}

function matchByWorkflowReference(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
): ExposureMatch | null {
  const workflowIndicator = advisory.indicators.find(
    (i) => i.type === "workflow_reference" || i.type === "action_ref",
  );
  if (
    workflowIndicator &&
    exactMatch(workflowIndicator.value, record.workflow_reference)
  ) {
    return buildMatch(record, advisory, "workflow_reference");
  }

  return null;
}

function matchByPublisher(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
): ExposureMatch | null {
  const publisherIndicator = advisory.indicators.find((i) => i.type === "publisher");
  if (publisherIndicator && exactMatch(publisherIndicator.value, record.publisher)) {
    return buildMatch(record, advisory, "publisher");
  }

  return null;
}

function matchByIndicator(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
): ExposureMatch | null {
  const supportedIndicatorTypes: Indicator["type"][] = [
    "credential",
    "install_hook",
    "action_ref",
  ];

  const matchingIndicator = advisory.indicators.find((indicator) => {
    if (!supportedIndicatorTypes.includes(indicator.type)) {
      return false;
    }

    switch (indicator.type) {
      case "credential":
      case "install_hook":
        return exactMatch(indicator.value, record.hash);
      case "action_ref":
        return exactMatch(indicator.value, record.workflow_reference);
      default:
        return false;
    }
  });

  if (matchingIndicator) {
    return buildMatch(record, advisory, "indicator");
  }

  return null;
}

function buildMatch(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
  matchType: MatchType,
): ExposureMatch {
  return ExposureMatchSchema.parse({
    inventory_ref: record.id,
    artifact_ref: record.source_ref,
    advisory_ref: advisory.id,
    match_type: matchType,
    confidence: 1,
    severity: advisory.severity,
    evidence_ids: advisory.evidence_ids,
  });
}

function matchRecord(
  record: InventoryRecord,
  advisory: ThreatAdvisory,
): ExposureMatch[] {
  // Fail-closed on the inventory side as well as the advisory side.
  if (!isInventoryActive(record)) {
    return [];
  }

  // Ordered from most specific to most general. Stop at the first match so a
  // single record produces at most one match per advisory. `indicator` is a
  // fallback for indicators that do not map to a dedicated match type.
  const matchers = [
    matchByPackageVersion,
    matchByPackageHash,
    matchByWorkflowReference,
    matchByPublisher,
    matchByIndicator,
  ];

  for (const matcher of matchers) {
    const match = matcher(record, advisory);
    if (match) {
      return [match];
    }
  }

  return [];
}

const severityRank: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Create an in-memory exposure matcher.
 */
export function createExposureMatcher(): ExposureMatcher {
  function matchAdvisory(
    scope: TenantScope,
    inventory: InventoryProvider,
    advisory: ThreatAdvisory,
  ): ExposureMatch[] {
    assertScope(scope);
    const parsedAdvisory = ThreatAdvisorySchema.parse(advisory);

    if (!isAdvisoryActive(parsedAdvisory)) {
      return [];
    }

    const query: InventoryQuery = {};
    const result = inventory.queryInventory(scope, query);

    const matches: ExposureMatch[] = [];
    for (const record of result.records) {
      if (
        record.group_id !== scope.group_id ||
        record.workspace_id !== scope.workspace_id
      ) {
        continue;
      }

      matches.push(...matchRecord(record, parsedAdvisory));
    }

    return matches;
  }

  function createAlerts(scope: TenantScope, matches: ExposureMatch[]): ExposureAlert[] {
    assertScope(scope);

    const buckets = new Map<string, ExposureMatch[]>();

    for (const match of matches) {
      const dedupKey = computeDedupKey(
        scope,
        match.inventory_ref,
        match.artifact_ref,
        match.match_type,
      );

      const bucket = buckets.get(dedupKey);
      if (bucket) {
        bucket.push(match);
      } else {
        buckets.set(dedupKey, [match]);
      }
    }

    const alerts: ExposureAlert[] = [];
    const now = new Date().toISOString();

    for (const [dedupKey, bucket] of buckets) {
      const highestSeverity = bucket.reduce<Severity>((acc, match) => {
        return severityRank[match.severity] > severityRank[acc]
          ? match.severity
          : acc;
      }, "low");

      const advisoryRefs = [...new Set(bucket.map((m) => m.advisory_ref))].sort();
      const evidenceIds = [
        ...new Set(bucket.flatMap((m) => m.evidence_ids)),
      ].sort();

      const alertId = deriveAlertId(dedupKey, now);

      alerts.push(
        ExposureAlertSchema.parse({
          id: alertId,
          group_id: scope.group_id,
          workspace_id: scope.workspace_id,
          inventory_ref: bucket[0].inventory_ref,
          artifact_ref: bucket[0].artifact_ref,
          advisory_refs: advisoryRefs,
          match_type: bucket[0].match_type,
          confidence: 1,
          severity: highestSeverity,
          evidence_ids: evidenceIds,
          dedup_key: dedupKey,
          state: "open",
          created_at: now,
        }),
      );
    }

    return alerts;
  }

  function queryAlerts(
    scope: TenantScope,
    alerts: ExposureAlert[],
    query: Record<string, unknown>,
  ): ExposureAlert[] {
    assertScope(scope);
    const parsedQuery = ExposureQuery.parse(query);

    return alerts.filter((alert) => {
      if (alert.group_id !== scope.group_id || alert.workspace_id !== scope.workspace_id) {
        return false;
      }
      if (parsedQuery.severity && alert.severity !== parsedQuery.severity) {
        return false;
      }
      if (parsedQuery.state && alert.state !== parsedQuery.state) {
        return false;
      }
      return true;
    });
  }

  return { matchAdvisory, createAlerts, queryAlerts };
}
