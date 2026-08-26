/**
 * Zod schemas for the read-only exposure matcher.
 *
 * External-boundary validation only. Internal code uses the inferred types.
 * Story 26.3 constraints:
 * - Matching is read-only: no DB writes, no subprocesses, no policy activation.
 * - Advisories that are not verified+fresh produce no matches (fail-closed).
 * - Tenant scope is server-derived and stamped on every match/alert.
 */

import { z } from "zod";
import { TenantScope } from "../inventory/schemas";

/**
 * Trust lifecycle state for a threat advisory.
 * Only `verified` advisories may yield exposure matches.
 */
export const TrustState = z.enum([
  "provisional",
  "verified",
  "rejected",
]);

/**
 * Freshness state for a threat advisory.
 * `stale` or `degraded` advisories fail closed and produce no matches.
 */
export const FreshnessState = z.enum([
  "fresh",
  "stale",
  "degraded",
  "unknown",
]);

/**
 * Indicator kinds that an advisory can carry.
 */
export const IndicatorType = z.enum([
  "cve",
  "package",
  "version",
  "hash",
  "publisher",
  "workflow_reference",
  "credential",
  "install_hook",
  "action_ref",
]);

/**
 * Normalized indicator from a threat advisory.
 */
export const Indicator = z.object({
  type: IndicatorType,
  value: z.string().min(1),
});

/**
 * Severity of an exposure, carried from the advisory.
 */
export const Severity = z.enum(["low", "medium", "high", "critical"]);

/**
 * Input advisory contract, aligned with the Story 26.1
 * `ThreatAdvisoryEvidence` shape.
 */
export const ThreatAdvisory = z.object({
  id: z.string().min(1),
  source_id: z.string().min(1),
  source_url: z.string().min(1),
  publisher: z.string().min(1),
  published_at: z.string().datetime(),
  fetched_at: z.string().datetime(),
  source_revision: z.string().min(1),
  content_hash: z.string().min(1),
  trust_state: TrustState,
  freshness_state: FreshnessState,
  classification: z.string().min(1),
  retention_disposition: z.string().min(1),
  severity: Severity,
  evidence_ids: z.array(z.string().min(1)).default([]),
  indicators: z.array(Indicator),
});

/**
 * Match-type classification.
 */
export const MatchType = z.enum([
  "package_version",
  "package_hash",
  "workflow_reference",
  "indicator",
  "publisher",
]);

/**
 * A single exact match between an inventory record and an advisory.
 */
export const ExposureMatch = z.object({
  inventory_ref: z.string().min(1),
  artifact_ref: z.string().min(1),
  advisory_ref: z.string().min(1),
  match_type: MatchType,
  confidence: z.number().min(0).max(1),
  severity: Severity,
  evidence_ids: z.array(z.string().min(1)),
});

/**
 * Lifecycle state for a deduplicated exposure alert.
 */
export const AlertState = z.enum([
  "open",
  "acknowledged",
  "resolved",
  "suppressed",
]);

/**
 * A deduplicated exposure alert. One alert per unique exposure
 * (scope + inventory record + artifact + match type). Multiple
 * advisories pointing at the same exposure are collapsed into one alert
 * with merged advisory and evidence references.
 */
export const ExposureAlert = z.object({
  id: z.string().min(1),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  inventory_ref: z.string().min(1),
  artifact_ref: z.string().min(1),
  advisory_refs: z.array(z.string().min(1)),
  match_type: MatchType,
  confidence: z.number().min(0).max(1),
  severity: Severity,
  evidence_ids: z.array(z.string().min(1)),
  dedup_key: z.string().min(1),
  state: AlertState,
  created_at: z.string().datetime(),
});

/**
 * Minimal query filters for exposure alert inspection.
 * Scope is validated here; principal-binding is enforced at the API boundary
 * (Story 26.1).
 */
export const ExposureQuery = z.object({
  severity: Severity.optional(),
  state: AlertState.optional(),
});
