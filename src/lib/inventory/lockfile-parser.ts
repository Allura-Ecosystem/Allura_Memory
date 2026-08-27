/**
 * bun.lock parser -- the first real inventory source (Bumblebee Guard,
 * per docs/allura/DESIGN-ALLURA.md's naming for inventory reconciliation).
 *
 * Story 26.2 built the normalization/matching primitive (ingestSources) but
 * never built anything that reads a real file into it -- this is that
 * first source. Deliberately scoped to bun.lock only; SBOMs, CI workflows,
 * container metadata, MCP manifests, skills, plugins, and model artifacts
 * are explicitly deferred to later work (see the story file for this
 * slice).
 *
 * bun.lock is JSON5, not strict JSON (trailing commas) -- parsed with the
 * `json5` package, not a hand-rolled regex strip, since this is
 * security-relevant data.
 *
 * Pure parsing only: no filesystem access happens in this module. The
 * caller reads the file and passes its content in, matching Story 26.2's
 * own read-only design (src/lib/inventory/service.ts never touches the
 * filesystem either).
 */

import JSON5 from "json5"
import type { InventorySourceRecord } from "./types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

const WORKFLOW_REFERENCE = "bun.lock"
const SOURCE_REF = "bun.lock"

interface BunLockPackageEntry {
  0: string // "name@version" or "name@workspace:path"
  1?: string
  2?: Record<string, unknown>
  3?: string // sha512 integrity hash
}

/**
 * Split a resolved "name@version" string into its parts. Handles scoped
 * packages (`@scope/name@1.0.0`) by splitting on the LAST `@`, not the
 * first (which would incorrectly split the scope's leading `@`).
 */
function splitNameVersion(resolved: string): { name: string; version: string } | null {
  const lastAt = resolved.lastIndexOf("@")
  if (lastAt <= 0) return null
  const name = resolved.slice(0, lastAt)
  const version = resolved.slice(lastAt + 1)
  if (!name || !version) return null
  return { name, version }
}

/**
 * Parse bun.lock content into normalized inventory source records. Skips
 * workspace-internal packages (no real external version/hash -- not a
 * supply-chain risk) and any entry missing a resolvable name/version/hash.
 * Never throws on a malformed individual entry; skips it and continues,
 * matching the fail-soft posture used throughout Story 26.4.
 */
export function parseBunLock(content: string, fetchedAt: string = new Date().toISOString()): InventorySourceRecord[] {
  let parsed: unknown
  try {
    parsed = JSON5.parse(content)
  } catch {
    return []
  }

  if (typeof parsed !== "object" || parsed === null || !("packages" in parsed)) return []
  const packages = (parsed as { packages: unknown }).packages
  if (typeof packages !== "object" || packages === null) return []

  // bun.lock's packages map keys are dependency PATHS, not identities --
  // the same real package@version can appear under multiple compound keys
  // when different parents resolve to the identical version. Dedupe by id
  // here so the parser's output reflects real distinct artifacts, not
  // dependency-path fan-out.
  const seen = new Map<string, InventorySourceRecord>()

  for (const value of Object.values(packages as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length === 0) continue
    const entry = value as unknown as BunLockPackageEntry
    const resolved = entry[0]
    if (typeof resolved !== "string") continue
    if (resolved.includes("@workspace:")) continue // internal package, not a supply-chain artifact

    const split = splitNameVersion(resolved)
    if (!split) continue

    const hash = entry[3]
    if (typeof hash !== "string" || !hash) continue // no integrity hash -- cannot record a hash field

    const id = `bunlock:${split.name}@${split.version}`
    if (seen.has(id)) continue // same real artifact already recorded via another dependency path

    seen.set(id, {
      id,
      artifact_type: "lockfile",
      ecosystem: "npm",
      package: split.name,
      version: split.version,
      hash,
      publisher: "npm registry",
      workflow_reference: WORKFLOW_REFERENCE,
      source_ref: SOURCE_REF,
      trust_state: "verified", // bun itself validated this integrity hash at install time
      freshness_state: "fresh", // just re-parsed now; reconciliation.ts ages this over cycles
      created_at: fetchedAt,
      updated_at: fetchedAt,
    })
  }

  return [...seen.values()]
}
