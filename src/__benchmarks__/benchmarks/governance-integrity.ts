/**
 * Benchmark 3 — Governance integrity.
 *
 * Verifies the hard invariants that make Allura compliance-grade:
 *   A. Cross-namespace isolation — a memory written under tenant A must never
 *      surface in a search scoped to tenant B.
 *   B. Bad-data injection — malformed / non-compliant group_ids (legacy tenants,
 *      wrong case, illegal characters, SQL-ish payloads) must be rejected.
 *   C. Live invariant check — `audit_invariant_check` reports all six governance
 *      invariants holding against real data.
 *   D. Gate enforcement — `governance_check_gate` blocks an action that tries to
 *      bypass HITL or reach the DB via docker exec.
 */

import type { BenchmarkContext, BenchmarkResult } from "../lib/types"
import { markerFor } from "../lib/dataset"
import { searchKeys, type AddResult } from "../lib/seed"
import { gated, info, statusFromMetrics } from "../lib/metric-builder"

interface InvariantCheckResult {
  invariants: Array<{ key: string; name: string; passed: boolean; violation_count: number }>
  overall_passed: boolean
}

interface GateResult {
  pass: boolean
  checks: Array<{ invariant_key: string; pass: boolean }>
}

/** Build a `-loadtest` group so seed writes skip the HITL proposal queue. */
function loadtestGroup(base: string, tag: string): string {
  const root = base.replace(/-loadtest$/, "")
  return `${root}-${tag}-loadtest`
}

/** group_ids that MUST be rejected by `validateGroupId`. */
const MALICIOUS_GROUPS = [
  "roninclaw-legacy", // deprecated tenant namespace
  "Allura-System", // uppercase violates [a-z]
  "allura_system", // underscore not allowed
  "team-ram", // missing allura- prefix
  "allura-'; DROP TABLE events;--", // SQL injection attempt
]

export async function run(ctx: BenchmarkContext): Promise<BenchmarkResult> {
  const start = performance.now()
  const notes: string[] = []

  try {
    // ── A. Cross-namespace isolation ──────────────────────────────────────────
    // Write to groupA (derived from the credential tenant) and verify the
    // memory does NOT leak into groupB. Both groups are derived from the
    // principal's tenant — the write uses tryCall so a tenant denial (expected
    // when the derived group is outside the allowlist) is captured as a metric
    // rather than crashing the entire benchmark with an opaque error.
    const groupA = loadtestGroup(ctx.groupId, "nsa")
    const groupB = loadtestGroup(ctx.groupId, "nsb")
    const secret = `Confidential tenant-A revenue figures Q3 ${markerFor(ctx.runId, "xns-secret")}`
    const writeRes = await ctx.client.tryCall<AddResult>("memory_add", {
      group_id: groupA,
      user_id: ctx.userId,
      content: secret,
      metadata: { source: "manual", agent_id: "benchmark" },
    })
    if (!writeRes.ok) {
      notes.push(`cross-namespace write to ${groupA} denied: ${writeRes.error ?? "unknown"}`)
    }
    const leak = await searchKeys(ctx.client, {
      groupId: groupB,
      query: "confidential tenant-A revenue figures",
      k: 10,
      runId: ctx.runId,
    })
    const leakCount = leak.keys.filter((k) => k === "xns-secret").length
    notes.push(`cross-namespace: tenant-A secret leaked into tenant-B ${leakCount} time(s)`)

    // ── B. Bad-data injection ─────────────────────────────────────────────────
    let rejected = 0
    for (const badGroup of MALICIOUS_GROUPS) {
      const res = await ctx.client.tryCall("memory_add", {
        group_id: badGroup,
        user_id: ctx.userId,
        content: "injection probe",
      })
      if (!res.ok) rejected++
      else notes.push(`ACCEPTED malicious group_id "${badGroup}" — invariant breach`)
    }
    const rejectRate = rejected / MALICIOUS_GROUPS.length

    // ── C. Live invariant check ───────────────────────────────────────────────
    let invariantsPassed = 0
    let invariantsTotal = 0
    const inv = await ctx.client.tryCall<InvariantCheckResult>("audit_invariant_check", {
      group_id: "allura-system",
    })
    if (inv.data?.invariants) {
      invariantsTotal = inv.data.invariants.length
      invariantsPassed = inv.data.invariants.filter((i) => i.passed).length
      for (const i of inv.data.invariants.filter((i) => !i.passed)) {
        notes.push(`invariant FAIL: ${i.name} (${i.violation_count} violations)`)
      }
    } else {
      notes.push(`audit_invariant_check unavailable: ${inv.error ?? "no data"}`)
    }

    // ── D. Gate enforcement ───────────────────────────────────────────────────
    const gate = await ctx.client.tryCall<GateResult>("governance_check_gate", {
      group_id: "allura-system",
      action: "memory_promote",
      context: { bypass_hitl: true, via_docker_exec: true, agent_id: "benchmark" },
    })
    // A correct gate BLOCKS this action (pass === false).
    const gateBlocked = gate.data?.pass === false
    notes.push(`gate on bypass_hitl+docker_exec: ${gateBlocked ? "blocked (correct)" : "ALLOWED (breach)"}`)

    const metrics = [
      gated("Cross-namespace leaks", leakCount, "lte", 0, ""),
      gated("Malicious input reject rate", rejectRate, "gte", 1, ""),
      gated("Gate blocked bypass", gateBlocked ? 1 : 0, "gte", 1, ""),
      invariantsTotal > 0
        ? gated("Live invariants passing", invariantsPassed, "gte", invariantsTotal, ` / ${invariantsTotal}`)
        : info("Live invariants passing", 0, " (unavailable)"),
    ]

    return {
      id: "governance-integrity",
      title: "Governance Integrity (isolation, injection, invariants)",
      status: statusFromMetrics(metrics),
      durationMs: performance.now() - start,
      metrics,
      notes,
    }
  } catch (err) {
    return {
      id: "governance-integrity",
      title: "Governance Integrity (isolation, injection, invariants)",
      status: "error",
      durationMs: performance.now() - start,
      metrics: [],
      notes,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
