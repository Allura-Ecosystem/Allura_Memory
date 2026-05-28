"use client"

import { useState } from "react"
import {
  Scale,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/* ── Types ─────────────────────────────────────────────────────── */

type RuleStatus = "compliant" | "violation" | "pending" | "not-checked"

interface BrandRule {
  id: string
  title: string
  statement: string
  enforcement: string
  failureMode: string
  evidence: string[]
  status: RuleStatus
  lastChecked: Date | null
}

interface TokenPair {
  foreground: string
  background: string
  ratio: string
  passesAa: boolean
  usage: string
}

interface ForbiddenVoice {
  forbidden: string
  why: string
  approved: string
}

interface ComponentDef {
  name: string
  source: string
  reuseRule: string
}

interface SignOffRole {
  role: string
  name: string
  checked: boolean
  date: Date | null
}

/* ── Governance data ────────────────────────────────────────────── */

const brandRules: BrandRule[] = [
  {
    id: "BRAND-001",
    title: "Durham Token Exclusivity",
    statement:
      "Dashboard CSS may use only --durham-* / --allura-* custom properties. DD tokens (dark-green, brand-gold, Poppins, Inter when used as DD body, Montserrat for non-Allura contexts) are forbidden.",
    enforcement:
      "Stylelint rule declaration-property-value-no-unknown with custom property allowlist. CI gate: npm run lint:brand fails build on token leakage.",
    failureMode: "Build blocked. PR rejected.",
    evidence: [
      "lint:brand output showing zero DD token matches",
      "DevTools computed styles showing only --allura-* values",
    ],
    status: "not-checked",
    lastChecked: null,
  },
  {
    id: "BRAND-002",
    title: "Mission-Control Voice",
    statement:
      "Dashboard copy stays mission-control: factual, precise, operator-oriented. No fake certainty, no marketing fluff, no DD voice patterns.",
    enforcement:
      "Copy review in PR template. Munari QA pass includes voice audit. grep -i for forbidden phrases in dashboard source.",
    failureMode: "PR returned for copy revision.",
    evidence: [
      "QA report: Voice audit — 0 forbidden phrases found",
      "Screenshot of all visible dashboard copy",
    ],
    status: "not-checked",
    lastChecked: null,
  },
  {
    id: "BRAND-003",
    title: "Evidence-Gated Completion",
    statement:
      "No dashboard work is marked 'done' until the evidence packet exists: screenshot packet, mobile pass, accessibility pass, anti-drift audit, performance pass.",
    enforcement:
      "PR template checkbox 'Evidence packet attached'. Merge blocked without evidence packet link. RuVix POL-003 rejects claims without evidence.",
    failureMode: "PR cannot be merged. Status stays 'In Progress'.",
    evidence: [
      "evidence/ directory in PR with screenshots",
      "accessibility-report.json with 0 critical/serious violations",
      "brand-audit.log showing 0 DD token leaks",
    ],
    status: "not-checked",
    lastChecked: null,
  },
  {
    id: "BRAND-004",
    title: "Accessibility Mandatory",
    statement:
      "AA contrast, visible focus rings, keyboard-operable flows are required. No exceptions.",
    enforcement:
      "axe-core automated scan in CI. Manual keyboard navigation test. Focus ring visibility check: 2px solid --allura-orange.",
    failureMode: "PR rejected. Accessibility report must show 0 violations.",
    evidence: [
      "axe-core JSON report: 0 violations",
      "Keyboard navigation video/GIF showing Tab order",
      "Focus ring screenshot for each interactive element",
    ],
    status: "not-checked",
    lastChecked: null,
  },
  {
    id: "BRAND-005",
    title: "Component Consistency",
    statement:
      "Reuse established Durham patterns. No ad-hoc variants. Agent roster cards, stat cards, status badges, curator tables, kanban columns, task cards, chat lines, and activity feed rows.",
    enforcement:
      "Component audit in PR: list every UI element, map to inventory. Any 'new' component requires ADR and Munari approval. CSS custom properties only.",
    failureMode: "PR returned with component inventory mismatch.",
    evidence: [
      "Component audit spreadsheet mapping every rendered element to inventory item",
      "Screenshot showing consistent spacing (measurement overlay acceptable)",
    ],
    status: "not-checked",
    lastChecked: null,
  },
  {
    id: "BRAND-006",
    title: "Durham Gate Before Ship",
    statement: "Aaker + Glaser + Munari must pass before dashboard release.",
    enforcement:
      "Each agent signs off in PR with checklist comment. RuVix blocks merge until all three checkboxes are checked. Captain has final veto.",
    failureMode: "Any reviewer rejects → fix → re-review → re-evidence.",
    evidence: [
      "Aaker sign-off comment in PR",
      "Glaser sign-off comment in PR",
      "Munari sign-off comment in PR",
      "Evidence Collector screenshot packet attached",
    ],
    status: "not-checked",
    lastChecked: null,
  },
]

const wcagPairs: TokenPair[] = [
  { foreground: "charcoal token", background: "cream token", ratio: "15.2:1", passesAa: true,  usage: "Primary text" },
  { foreground: "blue token", background: "cream token", ratio: "5.8:1",  passesAa: true,  usage: "Links, accents" },
  { foreground: "orange token", background: "cream token", ratio: "3.1:1",  passesAa: false, usage: "Primary buttons (>=18px bold only)" },
  { foreground: "green token", background: "cream token", ratio: "4.8:1",  passesAa: true,  usage: "Success states" },
  { foreground: "decorative gold token", background: "cream token", ratio: "2.1:1",  passesAa: false, usage: "Decorative only — NOT for text" },
  { foreground: "white token", background: "charcoal token", ratio: "15.2:1", passesAa: true,  usage: "Dark mode text" },
  { foreground: "white token", background: "blue token", ratio: "4.5:1",  passesAa: true,  usage: "Blue button text" },
  { foreground: "gray token", background: "cream token", ratio: "4.6:1",  passesAa: true,  usage: "Secondary text" },
]

const forbiddenVoice: ForbiddenVoice[] = [
  { forbidden: "Revolutionary",          why: "Marketing fluff",      approved: "Replaces manual lookup with graph search" },
  { forbidden: "Seamlessly integrated",  why: "Fake certainty",       approved: "Connected to Neo4j via MCP bridge" },
  { forbidden: "Best-in-class",          why: "Unverifiable claim",   approved: "P@5 retrieval score: 0.867" },
  { forbidden: "Empower your workflow",  why: "DD voice pattern",     approved: "Query memory by agent, project, or time range" },
  { forbidden: "Unlock potential",       why: "Marketing speak",      approved: "Browse approved semantic memories" },
  { forbidden: "The future of memory",   why: "Hype",                 approved: "— (delete, replace with feature description)" },
]

const components: ComponentDef[] = [
  { name: "agent roster card",   source: "Durham design system",       reuseRule: "For agent roster panels; avatar + name + status + role" },
  { name: "stat card",           source: "Durham design system",       reuseRule: "For stat cards; value + label + trend indicator" },
  { name: "agency-badge",        source: "Durham design system",       reuseRule: "For status pills; online/standby/review/done" },
  { name: "curator-table",       source: "Durham design system",       reuseRule: "For approval queue; row per proposal with score + action" },
  { name: "kanban-column",       source: "Mission Control wireframe",  reuseRule: "For task board; header + task cards + drop zone" },
  { name: "task-card",           source: "Mission Control wireframe",  reuseRule: "For kanban items; title + meta + priority + assignee" },
  { name: "chat-line",           source: "Mission Control wireframe",  reuseRule: "For team chat; avatar + name + message + timestamp" },
  { name: "activity-feed-item",  source: "Mission Control wireframe",  reuseRule: "For live feed; dot + message + timestamp" },
]

const signOffs: SignOffRole[] = [
  { role: "Brand Strategy",     name: "Aaker",   checked: false, date: null },
  { role: "Visual Design",      name: "Glaser",  checked: false, date: null },
  { role: "QA / Accessibility", name: "Munari",  checked: false, date: null },
  { role: "Evidence Collector", name: "—",       checked: false, date: null },
  { role: "Ship Approval",      name: "Captain", checked: false, date: null },
]

const cssTokens = [
  { name: "--allura-blue",              value: "brand blue token" },
  { name: "--allura-orange",            value: "brand orange token" },
  { name: "--allura-green",             value: "brand green token" },
  { name: "--allura-charcoal",          value: "brand charcoal token" },
  { name: "--dashboard-warning",        value: "dashboard warning token" },
  { name: "--allura-cream",             value: "brand cream token" },
  { name: "--allura-white",             value: "brand white token" },
  { name: "--dashboard-bg",             value: "var(--allura-cream)" },
  { name: "--dashboard-surface",        value: "var(--allura-white)" },
  { name: "--dashboard-text-primary",   value: "var(--allura-charcoal)" },
  { name: "--dashboard-accent",         value: "var(--allura-orange)" },
  { name: "--dashboard-success",        value: "var(--allura-green)" },
  { name: "--dashboard-border",         value: "var(--allura-gray-200)" },
]

/* ── Static toggle (no interaction) ────────────────────────────── */

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        on ? "bg-[var(--dashboard-cta-primary)]" : "bg-[var(--dashboard-border)]"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </div>
  )
}

/* ── Governance sub-components ──────────────────────────────────── */

function StatusBadge({ status }: { status: RuleStatus }) {
  const variants: Record<RuleStatus, { label: string; style: React.CSSProperties }> = {
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
        backgroundColor: "color-mix(in srgb, var(--dashboard-warning) 10%, transparent)",
        color: "var(--dashboard-warning)",
        borderColor: "color-mix(in srgb, var(--dashboard-warning) 30%, transparent)",
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

function StatusIcon({ status }: { status: RuleStatus }) {
  const colorMap: Record<RuleStatus, string> = {
    compliant: "var(--allura-green)",
    violation: "var(--dashboard-danger)",
    pending: "var(--dashboard-warning)",
    "not-checked": "var(--allura-gray-500)",
  }
  const color = colorMap[status]
  switch (status) {
    case "compliant": return <CheckCircle2 className="size-4" style={{ color }} aria-hidden="true" />
    case "violation": return <XCircle      className="size-4" style={{ color }} aria-hidden="true" />
    case "pending":   return <Clock        className="size-4" style={{ color }} aria-hidden="true" />
    default:          return <AlertTriangle className="size-4" style={{ color }} aria-hidden="true" />
  }
}

function RuleRow({ rule }: { rule: BrandRule }) {
  const [open, setOpen] = useState(false)
  const toggle = () => setOpen((prev) => !prev)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle() }
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
        <TableCell className="text-sm text-[var(--dashboard-text-secondary)] hidden md:table-cell">{rule.statement.slice(0, 80)}…</TableCell>
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
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">Statement</h4>
                <p className="text-sm text-[var(--dashboard-text-primary)] leading-relaxed">{rule.statement}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">Enforcement</h4>
                  <p className="text-sm text-[var(--dashboard-text-secondary)]">{rule.enforcement}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">Failure Mode</h4>
                  <p className="text-sm text-[var(--dashboard-text-secondary)]">{rule.failureMode}</p>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--dashboard-text-muted)] mb-1.5">Evidence Required</h4>
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

/* ── Settings tab content ───────────────────────────────────────── */

function GeneralTab() {
  const sectionHeading = "text-sm font-semibold text-[var(--dashboard-text-primary)] mb-3"
  const rowClass = "flex items-center justify-between py-3 border-b border-[var(--dashboard-border)] last:border-0"
  const labelClass = "text-sm text-[var(--dashboard-text-secondary)]"
  const valueClass = "bg-[var(--allura-cream)] rounded-md px-3 py-1.5 text-sm text-[var(--dashboard-text-primary)]"

  return (
    <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6 space-y-6">
      {/* Workspace */}
      <div>
        <h3 className={sectionHeading}>Workspace</h3>
        <div>
          <div className={rowClass}>
            <span className={labelClass}>Team Name</span>
            <span className={valueClass}>Team Durham</span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Group ID</span>
            <span className={valueClass}>allura-system</span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Default Agent Model</span>
            <span className={valueClass}>claude-sonnet-4-6</span>
          </div>
        </div>
      </div>

      {/* Memory */}
      <div>
        <h3 className={sectionHeading}>Memory</h3>
        <div>
          <div className={rowClass}>
            <span className={labelClass}>PostgreSQL Retention</span>
            <span className={valueClass}>90 days</span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Neo4j Promotion Threshold</span>
            <span className={valueClass}>0.85</span>
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Auto-archive Old Events</span>
            <Toggle on={true} />
          </div>
        </div>
      </div>

      {/* Agents */}
      <div>
        <h3 className={sectionHeading}>Agents</h3>
        <div>
          <div className={rowClass}>
            <span className={labelClass}>Brooks (Architect)</span>
            <Toggle on={true} />
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Woz (Builder)</span>
            <Toggle on={true} />
          </div>
          <div className={rowClass}>
            <span className={labelClass}>Scout (Recon)</span>
            <Toggle on={true} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
      <p className="text-sm text-[var(--dashboard-text-secondary)]">
        {name} settings are governed by the current Allura policy baseline and will be exposed here after the controls are approved.
      </p>
    </div>
  )
}

function GovernanceTab() {
  const counts = {
    compliant: brandRules.filter((r) => r.status === "compliant").length,
    violation: brandRules.filter((r) => r.status === "violation").length,
    pending:   brandRules.filter((r) => r.status === "pending").length,
  }
  const overviewCards = [
    { label: "Total Rules", value: brandRules.length,  icon: Scale,         accent: "var(--allura-gray-500)" },
    { label: "Compliant",   value: counts.compliant,   icon: CheckCircle2,  accent: "var(--allura-green)" },
    { label: "Violations",  value: counts.violation,   icon: XCircle,       accent: "var(--dashboard-danger)" },
    { label: "Pending",     value: counts.pending,     icon: Clock,         accent: "var(--dashboard-warning)" },
  ]

  /* Inner tab state for governance detail panels */
  const governancePanels = ["tokens", "voice", "accessibility", "components", "signoff"] as const
  type GovernancePanel = typeof governancePanels[number]
  const [govPanel, setGovPanel] = useState<GovernancePanel>("tokens")

  const govPanelLabel: Record<GovernancePanel, string> = {
    tokens: "Token Audit",
    voice: "Voice Audit",
    accessibility: "Accessibility",
    components: "Components",
    signoff: "Sign-off",
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-[var(--dashboard-accent)]" aria-hidden="true" />
        <div>
          <p className="text-sm text-[var(--dashboard-text-secondary)]">
            Brand rules, accessibility standards, and quality gates for the Allura Dashboard.
          </p>
        </div>
      </div>

      {/* Overview stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overviewCards.map((c) => {
          const Icon = c.icon
          return (
            <div
              key={c.label}
              className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5 flex items-start justify-between"
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--dashboard-text-muted)]">{c.label}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color: c.accent }}>{c.value}</p>
              </div>
              <Icon className="size-5 mt-1" style={{ color: c.accent }} aria-hidden="true" />
            </div>
          )
        })}
      </div>

      {/* Brand rules table */}
      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <div className="px-6 py-4 border-b border-[var(--dashboard-border)]">
          <p className="text-base font-semibold text-[var(--dashboard-text-primary)]">Brand Rules</p>
          <p className="text-sm text-[var(--dashboard-text-secondary)] mt-0.5">
            Click a rule to expand details. Status updates require manual review.
          </p>
        </div>
        <div className="px-0 pb-0">
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
        </div>
      </div>

      {/* Detail panels — inner tab row */}
      <div>
        {/* Inner tab row */}
        <div className="flex gap-1 border-b border-[var(--dashboard-border)] mb-4">
          {governancePanels.map((panel) => (
            <button
              key={panel}
              onClick={() => setGovPanel(panel)}
              className={`px-3 py-2 text-xs font-medium rounded-t transition-colors ${
                govPanel === panel
                  ? "bg-[var(--dashboard-surface)] border border-b-[var(--dashboard-surface)] border-[var(--dashboard-border)] text-[var(--dashboard-text-primary)] -mb-px"
                  : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
              }`}
            >
              {govPanelLabel[panel]}
            </button>
          ))}
        </div>

        {/* Token Audit */}
        {govPanel === "tokens" && (
          <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5 space-y-4">
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
          </div>
        )}

        {/* Voice Audit */}
        {govPanel === "voice" && (
          <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5 space-y-4">
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
        )}

        {/* Accessibility */}
        {govPanel === "accessibility" && (
          <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5 space-y-4">
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
            <div className="rounded-lg border p-3 flex items-start gap-2" style={{ borderColor: "color-mix(in srgb, var(--dashboard-warning) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--dashboard-warning) 5%, transparent)" }}>
              <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "var(--dashboard-warning)" }} aria-hidden="true" />
              <p className="text-xs" style={{ color: "var(--dashboard-warning)" }}>
                <strong>Critical:</strong> Decorative gold on cream = <strong>2.1:1 — FAILS AA for all text sizes.</strong>{" "}
                Gold may only be used for decorative borders, icons (with text label), and non-text UI elements.
              </p>
            </div>
          </div>
        )}

        {/* Components */}
        {govPanel === "components" && (
          <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5 space-y-4">
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
        )}

        {/* Sign-off */}
        {govPanel === "signoff" && (
          <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-5 space-y-4">
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
        )}
      </div>
    </div>
  )
}

/* ── Top-level settings tabs ────────────────────────────────────── */

const SETTINGS_TABS = [
  "General",
  "Agents",
  "Memory",
  "Integrations",
  "Notifications",
  "Security",
  "Governance",
] as const

type SettingsTab = typeof SETTINGS_TABS[number]

/* ── Main page ──────────────────────────────────────────────────── */

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("General")

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Settings</h1>

      {/* Tab row */}
      <div className="flex gap-1 flex-wrap">
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                isActive
                  ? "bg-[var(--allura-charcoal)] text-white"
                  : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
              }`}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === "General" && <GeneralTab />}
      {activeTab === "Agents" && <PlaceholderTab name="Agents" />}
      {activeTab === "Memory" && <PlaceholderTab name="Memory" />}
      {activeTab === "Integrations" && <PlaceholderTab name="Integrations" />}
      {activeTab === "Notifications" && <PlaceholderTab name="Notifications" />}
      {activeTab === "Security" && <PlaceholderTab name="Security" />}
      {activeTab === "Governance" && <GovernanceTab />}
    </div>
  )
}
