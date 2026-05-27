"use client"

import Link from "next/link"
import { Activity, Brain, Lightbulb, PlusCircle, Router, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MetricSummaryCard, type MetricTone } from "../_components/metric-summary-card"
import { buildDashboardRouteState } from "@/lib/dashboard/empty-states"
import { loadGraphNodes } from "@/lib/dashboard/queries"
import type { DashboardResult, GraphEdge, GraphNode } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

function confidencePercent(node: GraphNode) {
  const c = Number(node.metadata?.confidence ?? node.metadata?.score ?? 0)
  if (!Number.isFinite(c)) return "—"
  return `${Math.round(c * 100)}%`
}

interface AgentMetric {
  label: string
  value: string
  tone: MetricTone
  icon: React.ComponentType<{ className?: string }>
}

function buildMetrics(nodes: GraphNode[], _edges: GraphEdge[]): AgentMetric[] {
  const total = nodes.length
  const active = nodes.filter((n) => {
    const s = String(n.metadata?.status ?? "").toLowerCase()
    return s === "active" || s === "online"
  }).length
  const pending = nodes.filter((n) => {
    const s = String(n.metadata?.status ?? "").toLowerCase()
    return s === "pending" || s === "proposed"
  }).length
  const avgConfidence =
    total > 0
      ? (
          nodes.reduce((sum, n) => {
            const c = Number(n.metadata?.confidence ?? n.metadata?.score ?? 0)
            return sum + (Number.isFinite(c) ? c : 0)
          }, 0) / total
        ).toFixed(0)
      : "0"
  return [
    { label: "Total Agents", value: String(total), tone: "blue", icon: Users },
    { label: "Active", value: String(active), tone: "green", icon: Activity },
    { label: "Pending", value: String(pending), tone: "orange", icon: Lightbulb },
    { label: "Avg Confidence", value: `${avgConfidence}%`, tone: "charcoal", icon: Brain },
  ]
}

function AgentCard({
  node,
  connectionCount,
}: {
  node: GraphNode
  connectionCount: number
}) {
  const tone =
    (node.metadata?.status as string | undefined)?.toLowerCase() === "active"
      ? "green"
      : "orange"
  return (
    <article className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg text-white",
            tone === "green" ? "bg-[var(--dashboard-cta-approval)]" : "bg-[var(--dashboard-cta-primary)]"
          )}>
            <span className="text-xs font-bold tracking-tight">
              {(node.label ?? "A").charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{node.label}</span>
            <span className="text-xs text-[var(--dashboard-text-secondary)]">{node.type}</span>
          </div>
        </div>
        <span className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
          tone === "green"
            ? "border-green-500/20 bg-green-500/10 text-green-600"
            : "border-orange-500/20 bg-orange-500/10 text-orange-600"
        )}>
          {String(node.metadata?.status ?? "unknown")}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-[var(--dashboard-border)] p-3">
          <span className="text-xs text-[var(--dashboard-text-muted)]">Confidence</span>
          <p className="mt-1 font-semibold text-[var(--dashboard-text-primary)]">{confidencePercent(node)}</p>
        </div>
        <div className="rounded-lg border border-[var(--dashboard-border)] p-3">
          <span className="text-xs text-[var(--dashboard-text-muted)]">Connections</span>
          <p className="mt-1 font-semibold text-[var(--dashboard-text-primary)]">{connectionCount}</p>
        </div>
      </div>
    </article>
  )
}

export default function AgentsPage() {
  const [state, setState] = useState<DashboardResult<{ nodes: GraphNode[]; edges: GraphEdge[] }> | null>(null)
  const emptyState = buildDashboardRouteState("agents")
  const errorState = buildDashboardRouteState("agents", { kind: "degraded", reason: state?.error ?? state?.warnings?.[0]?.message ?? undefined })

  useEffect(() => {
    loadGraphNodes("agent").then(setState)
  }, [])

  const metrics = useMemo(() => {
    if (!state?.data) return []
    return buildMetrics(state.data.nodes, state.data.edges)
  }, [state])

  if (!state) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Agents</h1>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">Loading...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (state.error || state.degraded) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Agents</h1>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{errorState.title}</p>
          <p className="mt-2 text-sm text-red-600">{errorState.description}</p>
          <Button variant="outline" className="mt-4" onClick={() => loadGraphNodes("agent").then(setState)}>
            Retry
          </Button>
          <Button asChild variant="outline" className="mt-4 ml-2">
            <Link href={errorState.actionHref ?? "/dashboard/health"}>{errorState.actionLabel}</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { nodes, edges } = state.data ?? { nodes: [], edges: [] }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Agents</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">Active memory agents and their status.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <MetricSummaryCard key={m.label} {...m} variant="metric" />
        ))}
      </div>

      {state.warnings.length > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <ul className="space-y-1">
            {state.warnings.map((w, i) => (
              <li key={i} className="text-sm text-yellow-700">{w.message || String(w)}</li>
            ))}
          </ul>
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-12 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-muted)]">
            <Users className="size-7" aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-[var(--dashboard-text-primary)]">{emptyState.title}</h3>
          <p className="mt-2 max-w-md mx-auto text-xs text-[var(--dashboard-text-secondary)] leading-5">
            {emptyState.description} Agents are discovered from the <strong className="text-[var(--dashboard-text-primary)]">Neo4j semantic graph</strong> when they create memories, perform actions, or are explicitly registered.
          </p>

          <div className="mt-5 grid gap-3 max-w-sm mx-auto text-left">
            <div className="flex items-start gap-3 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--dashboard-cta-primary)]/10 text-[var(--dashboard-cta-primary)] text-xs font-bold">1</div>
              <div>
                <p className="text-xs font-medium text-[var(--dashboard-text-primary)]">Create your first memory</p>
                <p className="text-[11px] text-[var(--dashboard-text-secondary)] mt-0.5">Use the builder to add a memory with an agent attribution — it auto-registers in the graph.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--dashboard-cta-primary)]/10 text-[var(--dashboard-cta-primary)] text-xs font-bold">2</div>
              <div>
                <p className="text-xs font-medium text-[var(--dashboard-text-primary)]">Run onboarding script</p>
                <p className="text-[11px] text-[var(--dashboard-text-secondary)] mt-0.5">Execute <code className="rounded bg-[var(--dashboard-surface)] px-1 py-0.5 text-[10px]">scripts/openclaw-onboard.ts</code> to seed agents and connections.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--dashboard-cta-primary)]/10 text-[var(--dashboard-cta-primary)] text-xs font-bold">3</div>
              <div>
                <p className="text-xs font-medium text-[var(--dashboard-text-primary)]">Check graph health</p>
                <p className="text-[11px] text-[var(--dashboard-text-secondary)] mt-0.5">Verify Neo4j is connected and the <code className="rounded bg-[var(--dashboard-surface)] px-1 py-0.5 text-[10px]">agent</code> node type exists in the semantic store.</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/health" className="inline-flex items-center gap-1.5">
                <Router className="size-3.5" aria-hidden="true" />
                Check health
              </Link>
            </Button>
            <Button asChild size="sm" className="bg-[var(--dashboard-cta-primary)] text-white hover:bg-[var(--allura-orange-hover)]">
              <Link href="/dashboard/skills" className="inline-flex items-center gap-1.5">
                <PlusCircle className="size-3.5" aria-hidden="true" />
                {emptyState.actionLabel}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {nodes.map((node) => {
            const edgeCount = edges.filter(
              (e) => e.source === node.id || e.target === node.id
            ).length
            return <AgentCard key={node.id} node={node} connectionCount={edgeCount} />
          })}
        </div>
      )}
    </div>
  )
}
