"use client"

import { format, formatDistanceToNow } from "date-fns"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { MetricSummaryCard } from "../_components/metric-summary-card"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { loadPolicyEnforcement } from "@/lib/dashboard/queries"
import type { DashboardResult, PolicyEnforcementSummary, PolicyEnforcementEvent } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50

interface FilterOption {
  value: string
  count: number
}

function statusMeta(status: string) {
  switch (status) {
    case "allowed":
    case "pass":
    case "approved":
      return { tone: "green" as const, icon: ShieldCheck, label: "Allowed" }
    case "blocked":
    case "fail":
    case "failed":
    case "rejected":
      return { tone: "red" as const, icon: XCircle, label: "Blocked" }
    case "warning":
      return { tone: "orange" as const, icon: AlertTriangle, label: "Warning" }
    default:
      return { tone: "muted" as const, icon: Shield, label: "Unknown" }
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return formatDistanceToNow(date, { addSuffix: true })
}

function formatFullTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return format(date, "PPP p")
}

export default function GovernanceLogPage() {
  const [state, setState] = useState<DashboardResult<PolicyEnforcementSummary> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [eventType, setEventType] = useState("all")
  const [ruleFilter, setRuleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loadPolicyEnforcement()
      setState(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load governance events")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Extract filter options from data
  const { ruleOptions, agentOptions, filteredEvents, stats } = useMemo(() => {
    if (!state?.data) {
      return { ruleOptions: [], agentOptions: [], filteredEvents: [], stats: { total: 0, allowed: 0, blocked: 0, checks: 0, violations: 0 } }
    }

    const allEvents = state.data.recentEvents

    // Build filter options
    const ruleCounts = new Map<string, number>()
    const agentCounts = new Map<string, number>()
    for (const event of allEvents) {
      ruleCounts.set(event.ruleName, (ruleCounts.get(event.ruleName) ?? 0) + 1)
      agentCounts.set(event.agentId, (agentCounts.get(event.agentId) ?? 0) + 1)
    }

    const ruleOpts = Array.from(ruleCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)

    const agentOpts = Array.from(agentCounts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)

    // Apply filters
    let filtered = allEvents
    if (eventType !== "all") {
      filtered = filtered.filter((e) => e.eventType === eventType)
    }
    if (ruleFilter !== "all") {
      filtered = filtered.filter((e) => e.ruleName === ruleFilter)
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((e) => e.status === statusFilter)
    }
    if (agentFilter !== "all") {
      filtered = filtered.filter((e) => e.agentId === agentFilter)
    }
    if (from) {
      const fromDate = new Date(from)
      filtered = filtered.filter((e) => new Date(e.timestamp) >= fromDate)
    }
    if (to) {
      const toDate = new Date(to)
      filtered = filtered.filter((e) => new Date(e.timestamp) <= toDate)
    }

    const stats = {
      total: allEvents.length,
      allowed: allEvents.filter((e) => ["allowed", "pass", "approved"].includes(e.status)).length,
      blocked: allEvents.filter((e) => ["blocked", "fail", "failed", "rejected"].includes(e.status)).length,
      checks: state.data.checkCount,
      violations: state.data.violationCount,
    }

    return { ruleOptions: ruleOpts, agentOptions: agentOpts, filteredEvents: filtered, stats }
  }, [state, eventType, ruleFilter, statusFilter, agentFilter, from, to])

  const activeFilterCount = useMemo(() => {
    return [eventType !== "all", ruleFilter !== "all", statusFilter !== "all", agentFilter !== "all", Boolean(from), Boolean(to)].filter(Boolean).length
  }, [eventType, ruleFilter, statusFilter, agentFilter, from, to])

  const handleExport = () => {
    if (!filteredEvents.length) return
    const data = {
      exported_at: new Date().toISOString(),
      group_id: DEFAULT_GROUP_ID,
      filters: { eventType, ruleFilter, statusFilter, agentFilter, from, to },
      events: filteredEvents,
      stats,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `governance-log-${DEFAULT_GROUP_ID}-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-[var(--dashboard-cta-approval)]" />
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Governance Log</h1>
        </div>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">
          Policy checks, violations, and enforcement decisions for <code className="rounded bg-[var(--dashboard-surface-muted)] px-1 py-0.5 text-xs">{DEFAULT_GROUP_ID}</code>
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricSummaryCard
          label="Total Events"
          value={stats.total}
          icon={Shield}
          tone="charcoal"
          variant="stat"
        />
        <MetricSummaryCard
          label="Allowed"
          value={stats.allowed}
          icon={CheckCircle2}
          tone="green"
          variant="stat"
        />
        <MetricSummaryCard
          label="Blocked"
          value={stats.blocked}
          icon={XCircle}
          tone="red"
          variant="stat"
        />
        <MetricSummaryCard
          label="Checks"
          value={stats.checks}
          icon={ShieldCheck}
          tone="blue"
          variant="stat"
        />
        <MetricSummaryCard
          label="Violations"
          value={stats.violations}
          icon={ShieldAlert}
          tone="orange"
          variant="stat"
        />
      </div>

      {/* Filters */}
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-[var(--dashboard-text-muted)]">
            <Filter className="size-4" />
            Filter Events
            {activeFilterCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {activeFilterCount} active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="border-[var(--dashboard-border)] bg-[var(--dashboard-bg)]">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="policy_check">Policy Check</SelectItem>
                <SelectItem value="policy_violation">Policy Violation</SelectItem>
              </SelectContent>
            </Select>

            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="border-[var(--dashboard-border)] bg-[var(--dashboard-bg)]">
                <SelectValue placeholder="Rule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {ruleOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.value} ({opt.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="border-[var(--dashboard-border)] bg-[var(--dashboard-bg)]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="allowed">Allowed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="border-[var(--dashboard-border)] bg-[var(--dashboard-bg)]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agentOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.value} ({opt.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
              className="border-[var(--dashboard-border)] bg-[var(--dashboard-bg)]"
            />
            <Input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
              className="border-[var(--dashboard-border)] bg-[var(--dashboard-bg)]"
            />
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEventType("all")
                  setRuleFilter("all")
                  setStatusFilter("all")
                  setAgentFilter("all")
                  setFrom("")
                  setTo("")
                }}
                className="text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
              >
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--dashboard-text-muted)]">
          {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} in view
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadEvents}
            disabled={loading}
            className="border-[var(--dashboard-border)]"
          >
            {loading ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCw className="mr-1 size-3" />}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredEvents.length === 0}
            className="border-[var(--dashboard-border)]"
          >
            <Download className="mr-1 size-3" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadEvents}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredEvents.length === 0 && (
        <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-12 text-center">
          <Shield className="mx-auto size-8 text-[var(--dashboard-text-muted)]" />
          <p className="mt-3 text-sm font-medium text-[var(--dashboard-text-primary)]">No governance events</p>
          <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
            {activeFilterCount > 0
              ? "Try adjusting your filters to see more events."
              : "Policy checks and violations will appear here as they occur."}
          </p>
        </div>
      )}

      {/* Events list */}
      {!loading && !error && filteredEvents.length > 0 && (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({
  event,
  expanded,
  onToggle,
}: {
  event: PolicyEnforcementEvent
  expanded: boolean
  onToggle: () => void
}) {
  const meta = statusMeta(event.status)
  const Icon = meta.icon

  const badgeClass =
    meta.tone === "green"
      ? "border-green-500/20 bg-green-500/10 text-green-600"
      : meta.tone === "red"
        ? "border-red-500/20 bg-red-500/10 text-red-600"
        : meta.tone === "orange"
          ? "border-orange-500/20 bg-orange-500/10 text-orange-600"
          : "border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-muted)]"

  const iconColor =
    meta.tone === "green"
      ? "text-green-600"
      : meta.tone === "red"
        ? "text-red-600"
        : meta.tone === "orange"
          ? "text-orange-600"
          : "text-[var(--dashboard-text-muted)]"

  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 shrink-0", iconColor)}>
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={badgeClass}>
                {meta.label}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {event.eventType === "policy_violation" ? "Violation" : "Check"}
              </Badge>
              <span className="text-xs text-[var(--dashboard-text-muted)]">
                {formatTimestamp(event.timestamp)}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-[var(--dashboard-text-primary)]">
              {event.ruleName}
            </p>
            <p className="text-xs text-[var(--dashboard-text-secondary)]">
              Agent: {event.agentId}
            </p>
          </div>
          <div className="shrink-0 text-[var(--dashboard-text-muted)]">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--dashboard-border)] px-4 pb-4">
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--dashboard-text-muted)]">Event ID</p>
                <p className="mt-1 text-xs font-mono text-[var(--dashboard-text-primary)]">{event.id}</p>
              </div>
              <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--dashboard-text-muted)]">Timestamp</p>
                <p className="mt-1 text-xs text-[var(--dashboard-text-primary)]">{formatFullTimestamp(event.timestamp)}</p>
              </div>
              <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--dashboard-text-muted)]">Rule</p>
                <p className="mt-1 text-xs text-[var(--dashboard-text-primary)]">{event.ruleName}</p>
              </div>
              <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--dashboard-text-muted)]">Status</p>
                <p className="mt-1 text-xs font-medium text-[var(--dashboard-text-primary)]">{event.status}</p>
              </div>
            </div>
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--dashboard-text-muted)]">Metadata</p>
                <pre className="mt-1 overflow-auto rounded bg-[var(--dashboard-surface)] p-2 text-[10px] text-[var(--dashboard-text-primary)]">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
