"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HeartPulse,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getHealthMetrics } from "@/lib/dashboard/api"
import { loadGraphNodes } from "@/lib/dashboard/queries"
import type { DashboardResult, GraphEdge, GraphNode } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

interface HealthWidgetState {
  loading: boolean
  error: string | null
  policyViolations: number
  policyStatus: "healthy" | "violation"
  queuePending: number
  queueOldestHours: number
  agentsActive: number
  agentsTotal: number
  lastSync: string | null
}

function computeState(
  healthResult: Awaited<ReturnType<typeof getHealthMetrics>>,
  agentResult: DashboardResult<{ nodes: GraphNode[]; edges: GraphEdge[] }>
): HealthWidgetState {
  const health = healthResult.data ?? null
  const agents = agentResult.data ?? { nodes: [], edges: [] }

  const violations = health
    ? health.degraded.scope_error +
      health.degraded.promotion_failures_24h +
      health.degraded.neo4j_unavailable +
      health.degraded.embedding_failures
    : 0

  const totalAgents = agents.nodes.length
  const activeAgents = agents.nodes.filter((n) => {
    const s = String(n.metadata?.status ?? "").toLowerCase()
    return s === "active" || s === "online"
  }).length

  return {
    loading: false,
    error: null,
    policyViolations: violations,
    policyStatus: violations > 0 ? "violation" : "healthy",
    queuePending: health?.queue.pending_count ?? 0,
    queueOldestHours: health?.queue.oldest_age_hours ?? 0,
    agentsActive: activeAgents,
    agentsTotal: totalAgents,
    lastSync: health?.timestamp ?? null,
  }
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "Unavailable"
  const now = new Date()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unavailable"
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMinutes <= 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export default function GovernanceHealthWidget() {
  const [state, setState] = useState<HealthWidgetState>({ loading: true, error: null, policyViolations: 0, policyStatus: "healthy", queuePending: 0, queueOldestHours: 0, agentsActive: 0, agentsTotal: 0, lastSync: null })

  const refresh = () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    Promise.allSettled([getHealthMetrics(), loadGraphNodes("agent")])
      .then(([healthRes, agentRes]) => {
        const health = healthRes.status === "fulfilled" ? healthRes.value : null
        const agents = agentRes.status === "fulfilled" ? agentRes.value : null
        if (!health || healthRes.status === "rejected") {
          setState({
            loading: false,
            error: healthRes.status === "rejected" ? (healthRes.reason instanceof Error ? healthRes.reason.message : "Health fetch failed") : "Health unavailable",
            policyViolations: 0,
            policyStatus: "healthy",
            queuePending: 0,
            queueOldestHours: 0,
            agentsActive: 0,
            agentsTotal: 0,
            lastSync: null,
          })
          return
        }
        if (!agents || agentRes.status === "rejected") {
          setState({
            loading: false,
            error: agentRes.status === "rejected" ? (agentRes.reason instanceof Error ? agentRes.reason.message : "Agent fetch failed") : "Agents unavailable",
            policyViolations: 0,
            policyStatus: "healthy",
            queuePending: 0,
            queueOldestHours: 0,
            agentsActive: 0,
            agentsTotal: 0,
            lastSync: null,
          })
          return
        }
        setState(computeState(health, agents))
      })
      .catch((err) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }))
      })
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">Governance health</CardTitle>
          <button
            onClick={refresh}
            disabled={state.loading}
            className="inline-flex items-center gap-1 rounded-sm text-[10px] font-medium text-[var(--dashboard-text-secondary)] transition-colors hover:text-[var(--dashboard-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none disabled:opacity-50"
            aria-label="Refresh governance health"
          >
            {state.loading ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3" aria-hidden="true" />}
            Refresh
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {state.error ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <HealthMiniCard
                label="Policy"
                tone={state.policyStatus === "healthy" ? "green" : "red"}
                icon={ShieldCheck}
                value={state.policyStatus === "healthy" ? "All enforced" : `${state.policyViolations} violation${state.policyViolations === 1 ? "" : "s"}`}
              />
              <HealthMiniCard
                label="Queue"
                tone={state.queuePending > 0 ? "orange" : "green"}
                icon={Clock}
                value={state.queuePending > 0 ? `${state.queuePending} pending` : "Clear"}
                sub={state.queuePending > 0 ? `Oldest ${state.queueOldestHours}h` : undefined}
              />
              <HealthMiniCard
                label="Agents"
                tone={state.agentsTotal > 0 ? "blue" : "muted"}
                icon={Users}
                value={`${state.agentsActive}/${state.agentsTotal} active`}
              />
              <HealthMiniCard
                label="Sync"
                tone={state.lastSync ? "green" : "muted"}
                icon={HeartPulse}
                value={state.lastSync ? formatRelativeTime(state.lastSync) : "Unavailable"}
              />
            </div>
            <Link
              href="/dashboard/health"
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--dashboard-accent-secondary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
            >
              Open health details <ArrowRight className="size-3" />
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function HealthMiniCard({
  label,
  value,
  tone,
  icon: Icon,
  sub,
}: {
  label: string
  value: string
  tone: "green" | "orange" | "red" | "blue" | "muted"
  icon: React.ComponentType<{ className?: string }>
  sub?: string
}) {
  const iconColor =
    tone === "green"
      ? "text-[var(--dashboard-cta-approval)]"
      : tone === "orange"
        ? "text-[var(--dashboard-cta-primary)]"
        : tone === "red"
          ? "text-red-600"
          : tone === "blue"
            ? "text-[var(--dashboard-accent-secondary)]"
            : "text-[var(--dashboard-text-muted)]"

  const dotColor =
    tone === "green"
      ? "bg-[var(--dashboard-cta-approval)]"
      : tone === "orange"
        ? "bg-[var(--dashboard-cta-primary)]"
        : tone === "red"
          ? "bg-red-500"
          : tone === "blue"
            ? "bg-[var(--dashboard-accent-secondary)]"
            : "bg-[var(--dashboard-text-muted)]"

  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-2.5">
      <div className={cn("mt-0.5 shrink-0", iconColor)}>
        <Icon className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("inline-block size-1.5 rounded-full", dotColor)} aria-hidden="true" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--dashboard-text-muted)]">{label}</span>
        </div>
        <p className="mt-0.5 text-xs font-semibold text-[var(--dashboard-text-primary)]">{value}</p>
        {sub ? <p className="text-[10px] text-[var(--dashboard-text-secondary)]">{sub}</p> : null}
      </div>
    </div>
  )
}
