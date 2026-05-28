"use client"

import { useState } from "react"
import { Scale, Shield, AlertTriangle, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { brandRules, wcagPairs, forbiddenVoice, components, signOffs, cssTokens } from "./data"
import type { BrandRule, RuleStatus } from "./data"

/* ── Status Badge ──────────────────────────────────────────────── */

function StatusBadge({ status }: { status: RuleStatus }) {
  const variants: Record<RuleStatus, { label: string; style: { backgroundColor: string; color: string; borderColor: string } }> = {
    compliant: {
      label: "Compliant",
      style: {
        backgroundColor: "color-mix(in srgb, var(--allura-green) 10%, transparent)",
        color: "var(--allura-green)",
        borderColor: "color-mix(in srgb, var(--allura-green) 30%, transparent)",
      },
    },
    violation: {
      label: "Violation",
      style: {
        backgroundColor: "color-mix(in srgb, var(--dashboard-danger) 10%, transparent)",
        color: "var(--dashboard-danger)",
        borderColor: "color-mix(in srgb, var(--dashboard-danger) 30%, transparent)",
      },
    },
    pending: {
      label: "Pending",
      style: {
        backgroundColor: "color-mix(in srgb, var(--allura-gold) 10%, transparent)",
        color: "var(--allura-gold-text)",
        borderColor: "color-mix(in srgb, var(--allura-gold) 30%, transparent)",
      },
    },
    "not-checked": {
      label: "Not Checked",
      style: {
        backgroundColor: "color-mix(in srgb, var(--allura-gray-500) 10%, transparent)",
        color: "var(--allura-gray-500)",
        borderColor: "color-mix(in srgb, var(--allura-gray-500) 30%, transparent)",
      },
    },
  }
  const v = variants[status]
  return (
    <Badge variant="outline" className="text-xs font-medium border" style={v.style}>
      {v.label}
    </Badge>
  )
}

/* ── Status Icon ───────────────────────────────────────────────── */

function StatusIcon({ status }: { status: RuleStatus }) {
  const colorMap: Record<Exclude<RuleStatus, "not-checked">, string> & { "not-checked": string } = {
    compliant: "var(--allura-green)",
    violation: "var(--dashboard-danger)",
    pending: "var(--allura-gold)",
    "not-checked": "var(--allura-gray-500)",
  }
  const color = colorMap[status]
  switch (status) {
    case "compliant": return <CheckCircle2 className="size-4" style={{ color }} aria-hidden="true" />
    case "violation": return <XCircle className="size-4" style={{ color }} aria-hidden="true" />
    case "pending":   return <Clock className="size-4" style={{ color }} aria-hidden="true" />
    default:          return <AlertTriangle className="size-4" style={{ color }} aria-hidden="true" />
  }
}

/* ── Rule Row (expandable) ──────────────────────────────────────── */

function RuleRow({ rule }: { rule: BrandRule }) {
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen(!open)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggle()
    }
  }
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-[var(--dashboard-surface-muted)]/50 transition-colors"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={`${rule.id} ${rule.title}. ${open ? "Expanded" : "Collapsed"}. Press Enter or Space to toggle.`}
      >
        <TableCell className="font-mono text-xs text-[var(--dashboard-text-muted)]">{rule.id}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
            <span className="font-medium text-sm text-[var(--dashboard-text-primary)]">{rule.title}</span>
          </div>
        </TableCell>
        <TableCell className="text-sm text-[var(--dashboard-text-secondary)]">{rule.statement.slice(0, 80)}…</TableCell>
        <TableCell><StatusBadge status={rule.status} /></TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <StatusIcon status={rule.status} />
            <span className="text-xs text-[var(--dashboard-text-muted)]">
              {rule.lastChecked ? rule.lastChecked.toLocaleDateString() : "—"}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-[var(--dashboard-surface-muted)]/30">
          <TableCell colSpan={5} className="p-0">
            <div className="px-6 py-5 space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">
                  Statement
                </h4>
                <p className="text-sm text-[var(--dashboard-text-primary)] leading-relaxed">{rule.statement}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">
                    Enforcement
                  </h4>
                  <p className="text-sm text-[var(--dashboard-text-secondary)]">{rule.enforcement}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">
                    Failure Mode
                  </h4>
                  <p className="text-sm text-[var(--dashboard-text-secondary)]">{rule.failureMode}</p>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">
                  Evidence Required
                </h4>
                <ul className="space-y-1">
                  {rule.evidence.map((e, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--dashboard-text-secondary)]">
                      <span className="mt-1.5 size-1.5 rounded-full bg-[var(--dashboard-accent)] shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/* ── Overview Cards ───────────────────────────────────────────── */

function OverviewCards() {
  const counts = {
    compliant: brandRules.filter((r) => r.status === "compliant").length,
    violation: brandRules.filter((r) => r.status === "violation").length,
    pending:   brandRules.filter((r) => r.status === "pending").length,
    unchecked: brandRules.filter((r) => r.status === "not-checked").length,
  }
  const cards = [
    { label: "Total Rules", value: brandRules.length, icon: Scale, accent: "var(--allura-gray-500)" },
    { label: "Compliant", value: counts.compliant, icon: CheckCircle2, accent: "var(--allura-green)" },
    { label: "Violations", value: counts.violation, icon: XCircle, accent: "var(--dashboard-danger)" },
    { label: "Pending", value: counts.pending, icon: Clock, accent: "var(--allura-gold)" },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
          <CardContent className="p-5 flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--dashboard-text-muted)]">{c.label}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color: c.accent }}>{c.value}</p>
            </div>
            <c.icon className="size-5 mt-1" style={{ color: c.accent }} aria-hidden="true" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ── Token Audit Panel ──────────────────────────────────────────── */

function TokenAuditPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">CSS Custom Properties</h3>
        <Badge variant="outline" className="text-xs">{cssTokens.length} tokens</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cssTokens.map((t) => (
          <div
            key={t.name}
            className="flex items-center gap-3 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-3 py-2.5"
          >
            <div
              className="size-6 rounded-md border border-[var(--dashboard-border)] shrink-0"
              style={{ backgroundColor: t.value.startsWith("#") ? t.value : undefined }}
            />
            <div className="min-w-0">
              <p className="text-xs font-mono font-medium text-[var(--dashboard-text-primary)] truncate">{t.name}</p>
              <p className="text-[10px] text-[var(--dashboard-text-muted)] truncate">{t.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)]/50 p-3">
        <p className="text-xs text-[var(--dashboard-text-muted)]">
          <strong className="text-[var(--dashboard-text-primary)]">Detection:</strong>{" "}
          Run <code className="font-mono text-[10px] bg-[var(--dashboard-surface)] px-1 py-0.5 rounded">grep -r "dark-green\|brand-gold\|Poppins\|Montserrat" src/app/(main)/dashboard/</code>{" "}
          — must return empty.
        </p>
      </div>
    </div>
  )
}

/* ── Voice Audit Panel ──────────────────────────────────────────── */

function VoiceAuditPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">Forbidden Voice Patterns</h3>
        <Badge variant="outline" className="text-xs">{forbiddenVoice.length} entries</Badge>
      </div>
      <div className="space-y-2">
        {forbiddenVoice.map((v, i) => (
          <div key={i} className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <XCircle className="size-4 shrink-0" style={{ color: "var(--dashboard-danger)" }} aria-hidden="true" />
              <span className="text-sm font-medium" style={{ color: "var(--dashboard-danger)" }}>{v.forbidden}</span>
              <span className="text-xs text-[var(--dashboard-text-muted)]">— {v.why}</span>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <CheckCircle2 className="size-4 shrink-0" style={{ color: "var(--allura-green)" }} aria-hidden="true" />
              <span className="text-sm" style={{ color: "var(--allura-green)" }}>{v.approved}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Accessibility Panel ───────────────────────────────────────── */

function AccessibilityPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">WCAG AA Token Pairs</h3>
        <Badge variant="outline" className="text-xs">{wcagPairs.length} combinations</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Foreground</TableHead>
              <TableHead className="text-xs">Background</TableHead>
              <TableHead className="text-xs">Ratio</TableHead>
              <TableHead className="text-xs">AA Pass</TableHead>
              <TableHead className="text-xs">Usage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wcagPairs.map((p, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="size-4 rounded border border-[var(--dashboard-border)]" style={{ backgroundColor: p.foreground }} />
                    <span className="text-xs font-mono">{p.foreground}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="size-4 rounded border border-[var(--dashboard-border)]" style={{ backgroundColor: p.background }} />
                    <span className="text-xs font-mono">{p.background}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{p.ratio}</TableCell>
                <TableCell>
                  {p.passesAa ? (
                    <Badge variant="outline" className="text-xs border" style={{ backgroundColor: "color-mix(in srgb, var(--allura-green) 10%, transparent)", color: "var(--allura-green)", borderColor: "color-mix(in srgb, var(--allura-green) 30%, transparent)" }}>Pass</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs border" style={{ backgroundColor: "color-mix(in srgb, var(--dashboard-danger) 10%, transparent)", color: "var(--dashboard-danger)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 30%, transparent)" }}>Fail</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-[var(--dashboard-text-secondary)]">{p.usage}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="rounded-lg border p-3 flex items-start gap-2" style={{ borderColor: "color-mix(in srgb, var(--allura-gold) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--allura-gold) 5%, transparent)" }}>
        <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--allura-gold-text)" }} aria-hidden="true" />
        <p className="text-xs" style={{ color: "var(--allura-gold-text)" }}>
          <strong>Critical:</strong> Allura Gold <code className="font-mono">#C89B3C</code> on Cream{" "}
          <code className="font-mono">#F5F1E6</code> = <strong>2.1:1 — FAILS AA for all text sizes.</strong>{" "}
          Gold may only be used for decorative borders, icons (with text label), and non-text UI elements.
        </p>
      </div>
    </div>
  )
}

/* ── Component Inventory Panel ──────────────────────────────────── */

function ComponentPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">Component Inventory</h3>
        <Badge variant="outline" className="text-xs">{components.length} components</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {components.map((c) => (
          <div key={c.name} className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 space-y-1">
            <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{c.name}</p>
            <p className="text-xs text-[var(--dashboard-text-muted)]">{c.source}</p>
            <p className="text-xs text-[var(--dashboard-text-secondary)]">{c.reuseRule}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Sign-off Panel ─────────────────────────────────────────────── */

function SignOffPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dashboard-text-primary)]">Durham Gate — Sign-off</h3>
        <Badge variant="outline" className="text-xs">{signOffs.filter((s) => s.checked).length}/{signOffs.length} signed</Badge>
      </div>
      <div className="space-y-2">
        {signOffs.map((s) => (
          <div
            key={s.role}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            style={s.checked
              ? { borderColor: "color-mix(in srgb, var(--allura-green) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--allura-green) 5%, transparent)" }
              : undefined
            }
          >
            <div className="flex items-center gap-3">
              {s.checked ? (
                <CheckCircle2 className="size-5" style={{ color: "var(--allura-green)" }} aria-hidden="true" />
              ) : (
                <div className="size-5 rounded-full border-2 border-[var(--dashboard-border)]" />
              )}
              <div>
                <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">{s.role}</p>
                <p className="text-xs text-[var(--dashboard-text-muted)]">{s.name}</p>
              </div>
            </div>
            <div className="text-xs text-[var(--dashboard-text-muted)]">
              {s.date ? s.date.toLocaleDateString() : "Pending"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────────── */

export default function GovernancePage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Shield className="size-5 text-[var(--dashboard-accent)]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Governance</h1>
        </div>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">
          Brand rules, accessibility standards, and quality gates for the Allura Dashboard.
        </p>
      </div>

      {/* Overview */}
      <OverviewCards />

      {/* Rules Table */}
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader>
          <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Brand Rules</CardTitle>
          <CardDescription className="text-sm text-[var(--dashboard-text-secondary)]">
            Click a rule to expand details. Status updates require manual review.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px] text-xs">ID</TableHead>
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Statement</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandRules.map((rule) => (
                <RuleRow key={rule.id} rule={rule} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Tabs */}
      <Tabs defaultValue="tokens" className="w-full">
        <TabsList className="bg-[var(--dashboard-surface)] border border-[var(--dashboard-border)]">
          <TabsTrigger value="tokens" className="text-xs">Token Audit</TabsTrigger>
          <TabsTrigger value="voice" className="text-xs">Voice Audit</TabsTrigger>
          <TabsTrigger value="accessibility" className="text-xs">Accessibility</TabsTrigger>
          <TabsTrigger value="components" className="text-xs">Components</TabsTrigger>
          <TabsTrigger value="signoff" className="text-xs">Sign-off</TabsTrigger>
        </TabsList>
        <TabsContent value="tokens">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
            <TokenAuditPanel />
          </Card>
        </TabsContent>
        <TabsContent value="voice">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
            <VoiceAuditPanel />
          </Card>
        </TabsContent>
        <TabsContent value="accessibility">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
            <AccessibilityPanel />
          </Card>
        </TabsContent>
        <TabsContent value="components">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
            <ComponentPanel />
          </Card>
        </TabsContent>
        <TabsContent value="signoff">
          <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5">
            <SignOffPanel />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
