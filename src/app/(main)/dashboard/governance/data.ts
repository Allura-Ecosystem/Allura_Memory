/* ── Governance / Brand Rules Data ───────────────────────────────
 * Typed data structure for BRAND-RULES-dashboard-v2.md
 * Source of truth: /docs/allura/BRAND-RULES-dashboard-v2.md
 * ──────────────────────────────────────────────────────────────── */

export type RuleStatus = "compliant" | "violation" | "pending" | "not-checked"

export interface BrandRule {
  id: string
  title: string
  statement: string
  enforcement: string
  failureMode: string
  evidence: string[]
  status: RuleStatus
  lastChecked: Date | null
}

export interface TokenPair {
  foreground: string
  background: string
  ratio: string
  passesAa: boolean
  usage: string
}

export interface ForbiddenVoice {
  forbidden: string
  why: string
  approved: string
}

export interface ComponentDef {
  name: string
  source: string
  reuseRule: string
}

export interface SignOffRole {
  role: string
  name: string
  checked: boolean
  date: Date | null
}

/* ── Rules ─────────────────────────────────────────────────────── */

export const brandRules: BrandRule[] = [
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
      "Reuse established Durham patterns. No ad-hoc variants. Agency-card, metric-card, agency-badge, curator-table, kanban-column, task-card, chat-line, activity-feed-item.",
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

/* ── WCAG Token Pairs ──────────────────────────────────────────── */

export const wcagPairs: TokenPair[] = [
  { foreground: "#111827", background: "#F5F1E6", ratio: "15.2:1", passesAa: true, usage: "Primary text" },
  { foreground: "#1D4ED8", background: "#F5F1E6", ratio: "5.8:1", passesAa: true, usage: "Links, accents" },
  { foreground: "#FF5A2E", background: "#F5F1E6", ratio: "3.1:1", passesAa: false, usage: "Primary buttons (≥18px bold only)" },
  { foreground: "#157A4A", background: "#F5F1E6", ratio: "4.8:1", passesAa: true, usage: "Success states" },
  { foreground: "#C89B3C", background: "#F5F1E6", ratio: "2.1:1", passesAa: false, usage: "Decorative only — NOT for text" },
  { foreground: "#FFFFFF", background: "#111827", ratio: "15.2:1", passesAa: true, usage: "Dark mode text" },
  { foreground: "#FFFFFF", background: "#1D4ED8", ratio: "4.5:1", passesAa: true, usage: "Blue button text" },
  { foreground: "#6B7280", background: "#F5F1E6", ratio: "4.6:1", passesAa: true, usage: "Secondary text" },
]

/* ── Forbidden Voice Patterns ──────────────────────────────────── */

export const forbiddenVoice: ForbiddenVoice[] = [
  { forbidden: "Revolutionary", why: "Marketing fluff", approved: "Replaces manual lookup with graph search" },
  { forbidden: "Seamlessly integrated", why: "Fake certainty", approved: "Connected to Neo4j via MCP bridge" },
  { forbidden: "Best-in-class", why: "Unverifiable claim", approved: "P@5 retrieval score: 0.867" },
  { forbidden: "Empower your workflow", why: "DD voice pattern", approved: "Query memory by agent, project, or time range" },
  { forbidden: "Unlock potential", why: "Marketing speak", approved: "Browse approved semantic memories" },
  { forbidden: "The future of memory", why: "Hype", approved: "— (delete, replace with feature description)" },
]

/* ── Component Inventory ───────────────────────────────────────── */

export const components: ComponentDef[] = [
  { name: "agency-card", source: "Durham design system", reuseRule: "For agent roster panels; avatar + name + status + role" },
  { name: "metric-card", source: "Durham design system", reuseRule: "For stat cards; value + label + trend indicator" },
  { name: "agency-badge", source: "Durham design system", reuseRule: "For status pills; online/standby/review/done" },
  { name: "curator-table", source: "Durham design system", reuseRule: "For approval queue; row per proposal with score + action" },
  { name: "kanban-column", source: "Mission Control wireframe", reuseRule: "For task board; header + task cards + drop zone" },
  { name: "task-card", source: "Mission Control wireframe", reuseRule: "For kanban items; title + meta + priority + assignee" },
  { name: "chat-line", source: "Mission Control wireframe", reuseRule: "For team chat; avatar + name + message + timestamp" },
  { name: "activity-feed-item", source: "Mission Control wireframe", reuseRule: "For live feed; dot + message + timestamp" },
]

/* ── Sign-off Block ────────────────────────────────────────────── */

export const signOffs: SignOffRole[] = [
  { role: "Brand Strategy", name: "Aaker", checked: false, date: null },
  { role: "Visual Design", name: "Glaser", checked: false, date: null },
  { role: "QA / Accessibility", name: "Munari", checked: false, date: null },
  { role: "Evidence Collector", name: "—", checked: false, date: null },
  { role: "Ship Approval", name: "Captain", checked: false, date: null },
]

/* ── CSS Token Map ─────────────────────────────────────────────── */

export const cssTokens = [
  { name: "--allura-blue", value: "#1D4ED8" },
  { name: "--allura-orange", value: "#FF5A2E" },
  { name: "--allura-green", value: "#157A4A" },
  { name: "--allura-charcoal", value: "#111827" },
  { name: "--allura-gold", value: "#C89B3C" },
  { name: "--allura-cream", value: "#F5F1E6" },
  { name: "--allura-white", value: "#ffffff" },
  { name: "--dashboard-bg", value: "var(--allura-cream)" },
  { name: "--dashboard-surface", value: "var(--allura-white)" },
  { name: "--dashboard-text-primary", value: "var(--allura-charcoal)" },
  { name: "--dashboard-accent", value: "var(--allura-orange)" },
  { name: "--dashboard-success", value: "var(--allura-green)" },
  { name: "--dashboard-border", value: "var(--allura-gray-200)" },
]
