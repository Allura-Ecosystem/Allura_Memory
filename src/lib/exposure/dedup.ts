/**
 * Deterministic deduplication for exposure alerts.
 *
 * One alert per unique exposure:
 *   group_id + workspace_id + inventory record id + artifact ref + match type
 * Re-matching the same advisory against the same inventory record yields the
 * same dedup_key, so alert creation is idempotent.
 */

import { createHash } from "crypto";
import type { ExposureMatch } from "./types";
import type { TenantScope } from "../inventory/types";

/**
 * Join components with length prefixes so `|` in a component cannot collide
 * with a component boundary.
 */
function lengthPrefixedJoin(components: string[]): string {
  return components.map((c) => `${c.length}:${c}`).join("|");
}

/**
 * Compute a stable SHA-256 deduplication key for an exposure.
 */
export function computeDedupKey(
  scope: TenantScope,
  inventoryRef: string,
  artifactRef: string,
  matchType: ExposureMatch["match_type"],
): string {
  const payload = lengthPrefixedJoin([
    scope.group_id,
    scope.workspace_id,
    inventoryRef,
    artifactRef,
    matchType,
  ]).normalize("NFC");

  return createHash("sha256").update(payload, "utf-8").digest("hex");
}

/**
 * Derive an alert id from a dedup key and creation timestamp.
 * Unique per alert creation; not stable across re-matches.
 */
export function deriveAlertId(dedupKey: string, createdAt: string): string {
  const payload = lengthPrefixedJoin([dedupKey, createdAt]).normalize("NFC");
  return createHash("sha256").update(payload, "utf-8").digest("hex").slice(0, 32);
}
