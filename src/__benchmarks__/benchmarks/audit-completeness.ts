/**
 * Benchmark 5 — Audit completeness.
 *
 * Exercises a memory's full lifecycle and proves every stage left a queryable,
 * append-only trace. For one run-unique agent we:
 *   1. write a memory   → expect a `memory_add` event
 *   2. check the gate    → expect a `governance_gate_checked` event
 *   3. read agent activity → expect both events aggregated under the agent
 *   4. retrieve the memory → close the add→search loop
 *
 * Events are matched by a run-unique agent_id and marker so the result is
 * isolated from prior runs sharing the group.
 */

import type { BenchmarkContext, BenchmarkResult } from "../lib/types"
import { markerFor } from "../lib/dataset"
import type { AddResult, SearchResult } from "../lib/seed"
import { gated, info, statusFromMetrics } from "../lib/metric-builder"

interface EventsResult {
  events: Array<{ event_type: string; agent_id: string | null; metadata: Record<string, unknown> }>
  count: number
}

interface GateResult {
  pass: boolean
  audit_logged: boolean
}

export async function run(ctx: BenchmarkContext): Promise<BenchmarkResult> {
  const start = performance.now()
  const notes: string[] = []
  const agentId = `bench-${ctx.runId}`
  const marker = markerFor(ctx.runId, "audit-lifecycle")
  const probeAction = `benchmark_probe_${ctx.runId}`

  try {
    // ── 1. Write ──────────────────────────────────────────────────────────────
    // Use tryCall so a transient write failure (e.g. a budget/circuit-breaker
    // tripped by a prior benchmark's load) degrades into a measured miss with a
    // clear note, rather than voiding the whole lifecycle trace with an opaque
    // error. The downstream "memory_add traced" stage then fails loudly instead.
    const write = await ctx.client.tryCall<AddResult>("memory_add", {
      group_id: ctx.groupId,
      user_id: ctx.userId,
      content: `Audit lifecycle probe memory ${marker}`,
      metadata: { source: "manual", agent_id: agentId },
    })
    if (!write.ok) {
      notes.push(`memory_add for lifecycle probe failed: ${write.error ?? "unknown error"}`)
    }

    // ── 2. Gate check (append-only governance event) ──────────────────────────
    const gate = await ctx.client.tryCall<GateResult>("governance_check_gate", {
      group_id: ctx.groupId,
      action: probeAction,
      context: { agent_id: agentId },
    })
    const gateLogged = gate.data?.audit_logged === true

    // ── 3a. memory_add trace present? ─────────────────────────────────────────
    const addEvents = await ctx.client.tryCall<EventsResult>("audit_query_events", {
      group_id: ctx.groupId,
      event_type: "memory_add",
      agent_id: agentId,
      limit: 50,
    })
    const addTraced = (addEvents.data?.events ?? []).some((e) =>
      String((e.metadata as { content?: unknown })?.content ?? "").includes(marker),
    )

    // ── 3b. governance_gate_checked trace present? ────────────────────────────
    const gateEvents = await ctx.client.tryCall<EventsResult>("audit_query_events", {
      group_id: ctx.groupId,
      event_type: "governance_gate_checked",
      agent_id: agentId,
      limit: 50,
    })
    const gateTraced = (gateEvents.data?.events ?? []).some(
      (e) => String((e.metadata as { action?: unknown })?.action ?? "") === probeAction,
    )

    // ── 3c. Agent activity aggregates the lifecycle ───────────────────────────
    const activity = await ctx.client.tryCall<EventsResult>("audit_agent_activity", {
      group_id: ctx.groupId,
      agent_id: agentId,
      limit: 50,
    })
    const activityTypes = new Set((activity.data?.events ?? []).map((e) => e.event_type))
    const activityComplete = activityTypes.has("memory_add") && activityTypes.has("governance_gate_checked")

    // ── 4. Retrieval closes the loop ──────────────────────────────────────────
    const search = await ctx.client.tryCall<SearchResult>("memory_search", {
      group_id: ctx.groupId,
      query: "audit lifecycle probe memory",
      limit: 10,
      status: "all",
    })
    const retrievable = (search.data?.results ?? []).some((r) => r.content.includes(marker))

    const lifecycleStages = [
      { name: "memory_add traced", ok: addTraced },
      { name: "gate_checked traced", ok: gateTraced },
      { name: "agent activity aggregated", ok: activityComplete },
    ]
    const stagesPassed = lifecycleStages.filter((s) => s.ok).length
    for (const s of lifecycleStages) {
      if (!s.ok) notes.push(`missing lifecycle trace: ${s.name}`)
    }
    notes.push(`gate audit_logged=${gateLogged}; memory retrievable=${retrievable}`)

    const metrics = [
      gated("Lifecycle stages traced", stagesPassed, "gte", lifecycleStages.length, ` / ${lifecycleStages.length}`),
      info("Memory retrievable", retrievable ? 1 : 0, ""),
    ]

    return {
      id: "audit-completeness",
      title: "Audit Completeness (trace full lifecycle)",
      status: statusFromMetrics(metrics),
      durationMs: performance.now() - start,
      metrics,
      notes,
    }
  } catch (err) {
    return {
      id: "audit-completeness",
      title: "Audit Completeness (trace full lifecycle)",
      status: "error",
      durationMs: performance.now() - start,
      metrics: [],
      notes,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
