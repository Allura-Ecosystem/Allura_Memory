"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, ShieldMinus, ShieldQuestion, Wrench } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { loadPolicyEnforcement } from "@/lib/dashboard/queries"
import type { DashboardResult, PolicyEnforcementSummary } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

type RuleStatus = "Enforced" | "Proposed" | "Drifted" | "Unknown"

interface PolicyRule {
  name: string
  status: RuleStatus
  rule: string
  source: string
  updatedAt: string
}

const POLICY_RULES: PolicyRule[] = [
  {
    name: "Tenant namespace",
    status: "Enforced",
    rule: "Every governed memory and audit request must include a group_id matching allura-*.",
    source: "src/lib/memory/api-schemas.ts",
    updatedAt: "2026-05-18T09:30:00.000Z",
  },
  {
    name: "Agent identity",
    status: "Enforced",
    rule: "Memory writes require user_id so actions can be traced back to a human, service, or agent.",
    source: "src/lib/memory/api-schemas.ts",
    updatedAt: "2026-05-18T09:30:00.000Z",
  },
  {
    name: "Curator tiers",
    status: "Enforced",
    rule: "Promotion confidence tiers are emerging 0.60, adoption 0.75, and mainstream 0.85.",
    source: "src/lib/curator/score.ts",
    updatedAt: "2026-05-20T14:00:00.000Z",
  },
  {
    name: "Approval audit",
    status: "Proposed",
    rule: "Approval decisions are written as events with group_id, proposal, score, action, and curator identity.",
    source: "src/lib/memory/approval-audit.ts",
    updatedAt: "2026-05-21T08:15:00.000Z",
  },
]

const GOVERNANCE_SIGNALS = [
  { label: "Tenant", value: DEFAULT_GROUP_ID, tone: "blue" as const },
  { label: "Promotion", value: process.env.PROMOTION_MODE ?? "soc2", tone: "green" as const },
  { label: "Auto-approval", value: process.env.AUTO_APPROVAL_THRESHOLD ?? "0.85", tone: "orange" as const },
  { label: "Audit target", value: "events", tone: "charcoal" as const },
]

function statusMeta(status: RuleStatus) {
  switch (status) {
    case "Enforced":
      return { tone: "green" as const, icon: ShieldCheck }
    case "Proposed":
      return { tone: "orange" as const, icon: ShieldMinus }
    case "Drifted":
      return { tone: "red" as const, icon: ShieldAlert }
    default:
      return { tone: "muted" as const, icon: ShieldQuestion }
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "\u2014"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function EnforcementIcon({ status }: { status: string }) {
  if (status === "allowed") return <ShieldCheck className="size-4 text-green-500" aria-hidden="true" />
  if (status === "blocked") return <ShieldAlert className="size-4 text-red-500" aria-hidden="true" />
  return <ShieldQuestion className="size-4 text-yellow-500" aria-hidden="true" />
}

function RuleCard({ policy, index }: { policy: PolicyRule; index: number }) {
  const [open, setOpen] = useState(false)
  const meta = statusMeta(policy.status)
  const Icon = meta.icon

  const badgeToneClass =
    meta.tone === "green"
      ? "border-green-500/20 bg-green-500/10 text-green-600"
      : meta.tone === "orange"
        ? "border-orange-500/20 bg-orange-500/10 text-orange-600"
        : meta.tone === "red"
          ? "border-red-500/20 bg-red-500/10 text-red-600"
          : "border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-muted)]"

  const iconColorClass =
    meta.tone === "green"
      ? "text-green-600"
      : meta.tone === "orange"
        ? "text-orange-600"
        : meta.tone === "red"
          ? "text-red-600"
          : "text-[var(--dashboard-text-muted)]"

  return (
    <article className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full"
        aria-expanded={open}
        aria-controls={`rule-details-${index}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--dashboard-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-surface-muted)]",
                iconColorClass
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{policy.name}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--dashboard-text-secondary)] line-clamp-2">
                {policy.rule}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                badgeToneClass
              )}
            >
              {policy.status}
            </span>
            <span className="text-[var(--dashboard-text-muted)]" aria-hidden="true">
              {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </span>
          </div>
        </div>
      </button>
      <div
        id={`rule-details-${index}`}
        className={cn("px-4 pb-4 text-xs transition-all", open ? "block" : "hidden")}
      >
        <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[var(--dashboard-text-secondary)]">
            <Wrench className="size-3.5" aria-hidden="true" />
            <span className="font-medium">Source:</span>
            <code className="rounded bg-[var(--dashboard-surface)] px-1.5 py-0.5 text-[10px] text-[var(--dashboard-text-primary)]">
              {policy.source}
            </code>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--dashboard-text-secondary)]">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            <span className="font-medium">Last updated:</span>
            <time className="text-[var(--dashboard-text-primary)]" dateTime={policy.updatedAt}>
              {formatTimestamp(policy.updatedAt)}
            </time>
          </div>
          <p className="text-[11px] leading-5 text-[var(--dashboard-text-secondary)] pt-1">
            {policy.rule}
          </p>
        </div>
      </div>
    </article>
  )
}

export default function PolicyPage() {
  const [state, setState] = useState<DashboardResult<PolicyEnforcementSummary> | null>(null)

  useEffect(() => {
    void loadPolicyEnforcement().then(setState)
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Rules / Policy</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">
          Active governance rules that shape memory writes, curator promotion, and audit evidence.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {GOVERNANCE_SIGNALS.map((signal) => (
          <Card
            key={signal.label}
            className={cn(
              "border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] overflow-hidden",
              signal.tone === "blue" && "border-l-4 border-l-[var(--allura-blue)]",
              signal.tone === "green" && "border-l-4 border-l-[var(--dashboard-cta-approval)]",
              signal.tone === "orange" && "border-l-4 border-l-[var(--dashboard-cta-primary)]",
              signal.tone === "charcoal" && "border-l-4 border-l-[var(--dashboard-text-muted)]"
            )}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">{signal.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-lg font-semibold text-[var(--dashboard-text-primary)]">{signal.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
          Enforcement Rules
        </h2>
        <div className="grid gap-3">
          {POLICY_RULES.map((policy, idx) => (
            <RuleCard key={policy.name} policy={policy} index={idx} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
            Recent Enforcement
          </h2>
          {state?.data && (
            <div className="flex gap-3 text-xs text-[var(--dashboard-text-muted)]">
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3 text-green-500" />
                {state.data.checkCount} checks
              </span>
              <span className="flex items-center gap-1">
                <ShieldAlert className="size-3 text-red-500" />
                {state.data.violationCount} violations
              </span>
            </div>
          )}
        </div>

        {!state ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : state.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-600">{state.error}</p>
          </div>
        ) : (
          <>
            {state.warnings.length > 0 && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <ul className="space-y-1">
                  {state.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-yellow-700">{w.message || String(w)}</li>
                  ))}
                </ul>
              </div>
            )}

            {(state.data?.recentEvents ?? []).length === 0 ? (
              <div className="rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-12 text-center">
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No enforcement events yet</p>
                <p className="mt-2 text-xs text-[var(--dashboard-text-secondary)]">
                  Policy checks and violations will appear here as they occur.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {state.data!.recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-3"
                  >
                    <EnforcementIcon status={event.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{event.ruleName}</p>
                      <p className="text-xs text-[var(--dashboard-text-secondary)]">
                        {event.eventType.replace("_", " ")} \u00b7 {event.agentId}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--dashboard-text-muted)]">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {state.data && Object.keys(state.data.violationCountByRule).length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4">
                <h3 className="text-xs font-semibold uppercase text-[var(--dashboard-text-muted)] mb-3">
                  Violation count per rule
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(state.data.violationCountByRule).map(([rule, count]) => (
                    <div key={rule} className="flex items-center justify-between rounded-lg border border-[var(--dashboard-border)] p-3">
                      <span className="text-xs text-[var(--dashboard-text-secondary)] truncate max-w-[80%]" title={rule}>
                        {rule}
                      </span>
                      <span className="text-sm font-semibold text-red-500">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
