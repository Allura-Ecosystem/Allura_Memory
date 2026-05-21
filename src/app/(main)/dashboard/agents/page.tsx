"use client"

import { Activity, Brain, Lightbulb, Users } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
  tone: "blue" | "orange" | "green" | "charcoal"
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

function MetricCard({ label, value, tone, icon: Icon }: AgentMetric) {
  const toneClass =
    tone === "green"
      ? "text-green-600"
      : tone === "orange"
        ? "text-orange-600"
        : tone === "blue"
          ? "text-[var(--allura-blue)]"
          : "text-[var(--dashboard-text-primary)]"
  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", toneClass)} />
          <span className={cn("text-2xl font-bold", toneClass)}>{value}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AgentsPage() {
  const [state, setState] = useState<DashboardResult<{ nodes: GraphNode[]; edges: GraphEdge[] }> | null>(null)

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

  if (state.error) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Agents</h1>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{state.error}</p>
          <Button variant="outline" className="mt-4" onClick={() => loadGraphNodes("agent").then(setState)}>
            Retry
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
          <MetricCard key={m.label} {...m} />
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
          <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No agents found</p>
          <p className="mt-2 text-xs text-[var(--dashboard-text-secondary)]">No agents are active in this memory space.</p>
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
