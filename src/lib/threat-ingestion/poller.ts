/**
 * Advisory polling orchestration (Story 26.4 Slice B + AC-2).
 *
 * Enumerates verified+fresh inventory package/version pairs for a tenant,
 * queries all three approved advisory sources (per the security-owner
 * approval record, docs/governance/2026-08-27-story-26-4-security-owner-approval.md),
 * and hands the merged ThreatAdvisory list to Slice A's runDiscoveryCycle
 * (src/lib/threat-discovery/worker.ts) unchanged -- this module produces
 * inputs for that worker; it does not duplicate its matching/persistence
 * logic.
 *
 * CHECKPOINT SEMANTICS (AC-2). Partial progress inside a cycle is never
 * thrown away:
 *   - Across sources: each of the three runs independently; one source
 *     exhausting its retries never discards the other two's results.
 *   - Within OSV: already per-target (one request per package/version), so a
 *     single bad target costs exactly that target.
 *   - Within GitHub: already per-package, with its own internal try/catch.
 *   - Within npm: the bulk endpoint is a single all-or-nothing request, so
 *     this module CHUNKS npm targets and retries each chunk independently.
 *     Without chunking, one transient failure on a ~1200-package body would
 *     silently discard every npm result for the whole cycle -- that is not a
 *     checkpoint, it is an all-or-nothing batch, which is exactly what AC-2
 *     asks us not to ship.
 *
 * Retry policy itself is operator-configured and worker-immutable -- see
 * ./retry.ts.
 */

import { MAX_PACKAGES_PER_CYCLE, queryGithubAdvisories } from "./github-advisories-adapter"
import { queryNpmAudit } from "./npm-audit-adapter"
import { queryOsv } from "./osv-adapter"
import { resolveRetryConfig, type RetryConfig, type Sleeper, withRetry } from "./retry"
import type { InventoryQueryTarget } from "./schemas"
import type { InventoryProvider } from "../exposure/matcher"
import type { ThreatAdvisory } from "../exposure/types"
import type { TenantScope } from "../inventory/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/**
 * npm's bulk advisories endpoint accepts many packages per request. Chunking
 * bounds the blast radius of a single failed request without turning the
 * cycle into one-request-per-package (which would defeat the point of a bulk
 * endpoint and burn rate limit).
 */
export const NPM_CHUNK_SIZE = 100

/** Per-source retry/attempt accounting, surfaced for audit evidence. */
export interface SourceRetryStat {
  attempts: number
  succeeded: boolean
  lastError: string | null
}

export interface PollRetrySummary {
  osv: SourceRetryStat
  npm: SourceRetryStat
  github: SourceRetryStat
  /** npm chunks that exhausted retries; >0 means a real partial result. */
  npmChunksFailed: number
  npmChunksTotal: number
  config: RetryConfig
}

export interface PollResult {
  advisories: ThreatAdvisory[]
  targetsQueried: number
  osvCount: number
  npmCount: number
  githubCount: number
  retrySummary: PollRetrySummary
}

/**
 * Build the list of exact (ecosystem, package, version) targets to query
 * from an already-verified+fresh inventory. Provisional, rejected, stale,
 * or degraded records are excluded -- there is no value in checking
 * advisories against inventory the matcher would reject anyway (Story
 * 26.3 only matches verified+fresh on both sides).
 */
export function buildQueryTargets(
  scope: TenantScope,
  inventoryProvider: InventoryProvider,
): InventoryQueryTarget[] {
  const result = inventoryProvider.queryInventory(scope, {})
  const seen = new Set<string>()
  const targets: InventoryQueryTarget[] = []

  for (const record of result.records) {
    if (record.trust_state !== "verified" || record.freshness_state !== "fresh") continue
    const key = `${record.ecosystem}::${record.package}::${record.version}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({ ecosystem: record.ecosystem, package: record.package, version: record.version })
  }

  return targets
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export interface PollOptions {
  config?: RetryConfig
  sleep?: Sleeper
}

/**
 * Poll all three approved advisory sources for the given inventory targets
 * and return the merged, deduplicated ThreatAdvisory list ready for
 * runDiscoveryCycle, along with per-source retry accounting for audit.
 */
export async function pollAdvisorySources(
  targets: readonly InventoryQueryTarget[],
  options: PollOptions = {},
): Promise<PollResult> {
  const fetchedAt = new Date().toISOString()
  const config = options.config ?? resolveRetryConfig()
  const retryOpts = { config, sleep: options.sleep }

  const npmTargets = targets.filter((t) => t.ecosystem.toLowerCase() === "npm")
  const npmChunks = chunk(npmTargets, NPM_CHUNK_SIZE)

  const [osvOutcome, npmChunkOutcomes, githubOutcome] = await Promise.all([
    // OSV is already per-target fail-soft inside the adapter (it returns []
    // rather than throwing), so retry wraps the whole fan-out: it only
    // re-runs if the fan-out itself rejects, which the adapter's own
    // try/catch makes rare. The attempt count is still reported for audit.
    withRetry(
      () => Promise.all(targets.map((target) => queryOsv(target, fetchedAt))).then((r) => r.flat()),
      retryOpts,
    ),
    // Each npm chunk retries and checkpoints independently -- a failed chunk
    // costs only its own ~NPM_CHUNK_SIZE packages, not the whole source.
    Promise.all(npmChunks.map((c) => withRetry(() => queryNpmAudit(c, fetchedAt), retryOpts))),
    withRetry(() => queryGithubAdvisories(targets, fetchedAt), retryOpts),
  ])

  const osvResults = osvOutcome.value ?? []
  const githubResults = githubOutcome.value ?? []

  const npmResults: ThreatAdvisory[] = []
  let npmChunksFailed = 0
  let npmAttempts = 0
  let npmLastError: string | null = null
  for (const outcome of npmChunkOutcomes) {
    npmAttempts += outcome.attempts
    if (outcome.succeeded && outcome.value) {
      npmResults.push(...outcome.value)
    } else {
      npmChunksFailed += 1
      npmLastError = outcome.lastError
    }
  }

  const merged = new Map<string, ThreatAdvisory>()
  for (const advisory of [...osvResults, ...npmResults, ...githubResults]) {
    merged.set(advisory.id, advisory)
  }

  return {
    advisories: [...merged.values()],
    targetsQueried: targets.length,
    osvCount: osvResults.length,
    npmCount: npmResults.length,
    githubCount: githubResults.length,
    retrySummary: {
      osv: { attempts: osvOutcome.attempts, succeeded: osvOutcome.succeeded, lastError: osvOutcome.lastError },
      npm: {
        attempts: npmAttempts,
        // A source counts as succeeded only if every chunk landed. Reporting
        // "succeeded" on a partial result would hide real data loss.
        succeeded: npmChunks.length > 0 && npmChunksFailed === 0,
        lastError: npmLastError,
      },
      github: {
        attempts: githubOutcome.attempts,
        succeeded: githubOutcome.succeeded,
        lastError: githubOutcome.lastError,
      },
      npmChunksFailed,
      npmChunksTotal: npmChunks.length,
      config,
    },
  }
}

export { MAX_PACKAGES_PER_CYCLE }
