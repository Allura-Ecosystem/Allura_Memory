"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, ShieldMinus, ShieldQuestion, Wrench, Info } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { loadPolicyEnforcement } from "@/lib/dashboard/queries"
import type { DashboardResult, PolicyEnforcementSummary } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

type RuleStatus = "Enforced" | "Advisory" | "Proposed" | "Drifted" | "Unknown"
type Severity = "critical" | "high" | "medium" | "low"

interface PolicyRule {
  id: string
  name: string
  status: RuleStatus
  severity: Severity
  rule: string
  source: string
  configurable?: string
}

const KERNEL_POLICIES: PolicyRule[] = [
  {
    id: "POL-001",
    name: "Tenant Isolation",
    status: "Enforced",
    severity: "critical",
    rule: "Every governed memory and audit request must include a group_id matching allura-[a-z0-9-]+. Missing group_id causes a CHECK constraint failure.",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-002",
    name: "Budget Enforcement",
    status: "Enforced",
    severity: "high",
    rule: "Operations must not exceed the per-call budget limit. Default: 1000 units. Operations without a budget_cost claim are exempt.",
    source: "src/kernel/policy.ts",
    configurable: "budgetLimit (context field, default 1000)",
  },
  {
    id: "POL-003",
    name: "Permission Tier Validation",
    status: "Enforced",
    severity: "critical",
    rule: "Kernel operations require kernel tier. Plugin operations require plugin or kernel tier. Skill operations allow any tier. Hierarchy: kernel > plugin > skill.",
    source: "src/kernel/policy.ts",
    configurable: "requiredTier (context field)",
  },
  {
    id: "POL-004",
    name: "Actor Validation",
    status: "Enforced",
    severity: "high",
    rule: "All operations must have a valid actor identifier — a UUID, a user-* prefixed ID, or an agent-* prefixed ID. Anonymous operations are blocked.",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-005",
    name: "Audit Trail",
    status: "Enforced",
    severity: "medium",
    rule: "All kernel operations must provide audit_context with at least one key. Operations without audit context are rejected.",
    source: "src/kernel/policy.ts",
    configurable: "requiresAudit (context field, default true)",
  },
  {
    id: "POL-006",
    name: "Debug Enforcement (Iron Law)",
    status: "Advisory",
    severity: "high",
    rule: "No fix may be submitted without a prior root cause investigation. Fix/hotfix/bugfix operations require debugRootCauseFound=true in context. In strict mode this blocks; in advisory mode it records a violation but allows.",
    source: "src/kernel/policy.ts",
    configurable: "strictDebugEnforcement (context field, default false)",
  },
  {
    id: "POL-007",
    name: "Source-of-Truth Pre-Flight Gate",
    status: "Enforced",
    severity: "critical",
    rule: "Before any write, the agent must have proven it read from the project's declared canonical source (e.g., Notion). Read operations are exempt to allow the initial pre-flight read.",
    source: "src/kernel/policy.ts",
    configurable: "projectManifest.sourcesOfTruth (ProjectManifest)",
  },
  {
    id: "POL-008",
    name: "Infrastructure Target Lock",
    status: "Enforced",
    severity: "critical",
    rule: "DB/deploy operations must target infrastructure declared in the project manifest. Prevents Docker Postgres when Neon is declared, local dev when Vercel is declared.",
    source: "src/kernel/policy.ts",
    configurable: "projectManifest.infrastructureTargets (ProjectManifest)",
  },
  {
    id: "POL-009",
    name: "Project Manifest Required",
    status: "Enforced",
    severity: "critical",
    rule: "No write operations are allowed on a project without a PROJECT.yaml or ruvix-manifest.yaml declaring sourcesOfTruth and infrastructureTargets. Read operations are exempt.",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-EMAIL-001",
    name: "Email Instruction Blocker",
    status: "Enforced",
    severity: "critical",
    rule: "Email-derived content cannot issue instructions to agents or tools. Content flagged as containing prompt injection or tool commands is blocked unless handling mode is evidence_only.",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-EMAIL-002",
    name: "Email Action Approval Gate",
    status: "Enforced",
    severity: "critical",
    rule: "Privileged or destructive actions derived from email require explicit Captain/HITL approval (captainApproval or hitlApproved flag in context).",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-EMAIL-003",
    name: "High-Risk Email Quarantine",
    status: "Enforced",
    severity: "high",
    rule: "High-risk emails (verdict=high) may only trigger quarantine, log, scan, or audit operations. No links, attachments, replies, promotions, or mutations.",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-EMAIL-004",
    name: "Email Memory Promotion Gate",
    status: "Enforced",
    severity: "high",
    rule: "Email-derived facts may be stored as raw episodic traces. Promotion to canonical Neo4j memory requires curator/HITL approval (curatorApproval or hitlApproved).",
    source: "src/kernel/policy.ts",
  },
  {
    id: "POL-EMAIL-005",
    name: "Attachment Sandbox Requirement",
    status: "Enforced",
    severity: "high",
    rule: "Email attachments may only be inspected in a quarantined and sandboxed context. Both quarantined and sandboxed flags must be true.",
    source: "src/kernel/policy.ts",
  },
]

const GOVERNANCE_SIGNALS = [
  { label: "Tenant", value: DEFAULT_GROUP_ID, tone: "blue" as const },
  { label: "Kernel version", value: "1.0.0-alpha", tone: "charcoal" as const },
  { label: "Total policies", value: String(KERNEL_POLICIES.length), tone: "green" as const },
  { label: "POL-006 mode", value: "Advisory", tone: "orange" as const },
]

function statusMeta(status: RuleStatus) {
  switch (status) {
    case "Enforced":
      return { tone: "green" as const, icon: ShieldCheck }
    case "Advisory":
      return { tone: "orange" as const, icon: ShieldMinus }
    case "Proposed":
      return { tone: "orange" as const, icon: ShieldMinus }
    case "Drifted":
      return { tone: "red" as const, icon: ShieldAlert }
    default:
      return { tone: "muted" as const, icon: ShieldQuestion }
  }
}

function severityBadgeClass(severity: Severity) {
  switch (severity) {
    case "critical": return "border-red-500/20 bg-red-500/10 text-red-600"
    case "high": return "border-orange-500/20 bg-orange-500/10 text-orange-600"
    case "medium": return "border-yellow-500/20 bg-yellow-500/10 text-yellow-700"
    case "low": return "border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-muted)]"
  }
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

  const statusBadgeClass =
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-semibold text-[var(--dashboard-text-muted)]">{policy.id}</span>
                <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">{policy.name}</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--dashboard-text-secondary)] line-clamp-2">
                {policy.rule}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                severityBadgeClass(policy.severity)
              )}
            >
              {policy.severity}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                statusBadgeClass
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
          {policy.configurable && (
            <div className="flex items-start gap-1.5 text-[var(--dashboard-text-secondary)]">
              <Info className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span className="font-medium shrink-0">Configurable via:</span>
              <code className="rounded bg-[var(--dashboard-surface)] px-1.5 py-0.5 text-[10px] text-[var(--dashboard-text-primary)] break-all">
                {policy.configurable}
              </code>
            </div>
          )}
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
          RuVix kernel enforcement policies. Every state mutation passes proof verification and all active policies before executing.
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
            Kernel Enforcement Policies
          </h2>
          <span className="text-xs text-[var(--dashboard-text-muted)]">
            {KERNEL_POLICIES.filter(p => p.status === "Enforced").length} enforced · {KERNEL_POLICIES.filter(p => p.status === "Advisory").length} advisory
          </span>
        </div>
        <div className="grid gap-3">
          {KERNEL_POLICIES.map((policy, idx) => (
            <RuleCard key={policy.id} policy={policy} index={idx} />
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
                  Events appear here when the kernel logs <code className="rounded bg-[var(--dashboard-surface-muted)] px-1 py-0.5 text-[10px]">policy_check</code> or <code className="rounded bg-[var(--dashboard-surface-muted)] px-1 py-0.5 text-[10px]">policy_violation</code> audit events.
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
                        {event.eventType.replace("_", " ")} · {event.agentId}
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
