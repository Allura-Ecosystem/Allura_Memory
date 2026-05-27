import { createDefaultRegistry, getAdapter } from "@/lib/adapter-registry"
import type { AdapterDeclaration } from "@/lib/adapter-registry"

export type AlluraRouteSectionId =
  | "memories"
  | "insights"
  | "trace-logs"
  | "provenance"
  | "extracted-facts"
  | "approval-queue"

export interface AlluraRouteSection {
  id: AlluraRouteSectionId
  label: string
  description: string
  sourceOfTruth: AdapterDeclaration["system_of_record"]
  readMode: "live" | "derived"
  usesSampleData: false
}

export type DashboardWorkflowNavLabel =
  | "Overview"
  | "Memories"
  | "Graph"
  | "Insights"
  | "Evidence"
  | "Review"
  | "Agents"
  | "Projects"
  | "Skills"
  | "Settings"

export interface DashboardWorkflowNavItem {
  id: string
  label: DashboardWorkflowNavLabel
  href: string
  sourceOfTruth: "dashboard-visual-spec-v2"
  shellRole: "thin-workflow-navigation"
}

export type DashboardShellPanelId = "memory-search" | "recent-memories" | "approvals-provenance" | "mission-board"

export interface DashboardShellPanelContract {
  id: DashboardShellPanelId
  label: string
  backingSource: string
  degradedBehavior: string
  usesSampleData: false
}

export interface DashboardRouteCutoverBoundary {
  dashboardRoute: "/dashboard"
  alluraRoute: "/allura"
  dashboardMayTargetAllura: false
  protectedPort: "3100"
  replacementStatus: "blocked"
  unblockRequirement: string
  requiredEvidence: string[]
}

export const DASHBOARD_ROUTE_CUTOVER_BOUNDARY: DashboardRouteCutoverBoundary = {
  dashboardRoute: "/dashboard",
  alluraRoute: "/allura",
  dashboardMayTargetAllura: false,
  protectedPort: "3100",
  replacementStatus: "blocked",
  unblockRequirement: "Epic 5 cutover evidence must pass before replacing 3100.",
  requiredEvidence: [
    "route parity",
    "visual parity",
    "adapter/source-of-truth declarations",
    "auth validation",
    "smoke tests",
    "no-fabricated-data checks",
    "rollback documentation",
  ],
}

export function assertDashboardNavigationPreservesAlluraSeparation(items: DashboardWorkflowNavItem[]): void {
  const conflictingItem = items.find((item) => {
    const [withoutHash] = item.href.split("#")
    const [pathname] = withoutHash.split("?")
    return pathname === "/allura" || pathname.startsWith("/allura/")
  })

  if (conflictingItem) {
    throw new Error(`/dashboard navigation cannot target /allura without an explicit /allura ownership story: ${conflictingItem.id}`)
  }
}

export const DASHBOARD_WORKFLOW_NAV_ITEMS: DashboardWorkflowNavItem[] = [
  { id: "dashboard", label: "Overview", href: "/dashboard", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "memories", label: "Memories", href: "/dashboard/memory", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "graph", label: "Graph", href: "/dashboard/graph", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "insights", label: "Insights", href: "/dashboard/insights", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "evidence", label: "Evidence", href: "/dashboard/evidence", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "review", label: "Review", href: "/dashboard/review", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "agents", label: "Agents", href: "/dashboard/agents", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "projects", label: "Projects", href: "/dashboard/projects", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "skills", label: "Skills", href: "/dashboard/skills", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "settings", label: "Settings", href: "/dashboard/settings", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
]

export const DASHBOARD_PANEL_CONTRACTS: DashboardShellPanelContract[] = [
  {
    id: "memory-search",
    label: "Memory search",
    backingSource: "Allura Brain memory search/list APIs scoped by group_id",
    degradedBehavior: "Show empty, unknown, or unavailable state; never fabricate memory counts.",
    usesSampleData: false,
  },
  {
    id: "recent-memories",
    label: "Recent memories",
    backingSource: "Governed episodic/semantic memory reads via dashboard query layer",
    degradedBehavior: "Show failed or empty state with retry/next-action copy when reads are unavailable.",
    usesSampleData: false,
  },
  {
    id: "approvals-provenance",
    label: "Approvals and provenance",
    backingSource: "Curator proposal queue and insight provenance APIs",
    degradedBehavior: "Show pending, empty, or unavailable state; do not imply approvals exist without data.",
    usesSampleData: false,
  },
  {
    id: "mission-board",
    label: "Mission board",
    backingSource: "Derived local dashboard grouping from loaded memories, proposals, and review status",
    degradedBehavior: "Show blocked/failed lane items when source reads fail and empty lane copy when no items load.",
    usesSampleData: false,
  },
]

export const ALLURA_ROUTE_SECTIONS: AlluraRouteSection[] = [
  {
    id: "memories",
    label: "Memories",
    description: "Approved and episodic memories returned by the governed memory APIs.",
    sourceOfTruth: "allura-brain",
    readMode: "live",
    usesSampleData: false,
  },
  {
    id: "insights",
    label: "Insights",
    description: "Curated insight records and active semantic knowledge.",
    sourceOfTruth: "allura-brain",
    readMode: "live",
    usesSampleData: false,
  },
  {
    id: "trace-logs",
    label: "Trace Logs",
    description: "Append-only trace evidence from PostgreSQL-backed memory events.",
    sourceOfTruth: "allura-brain",
    readMode: "live",
    usesSampleData: false,
  },
  {
    id: "provenance",
    label: "Provenance",
    description: "Agent, project, and graph relationships derived from memory evidence.",
    sourceOfTruth: "allura-brain",
    readMode: "derived",
    usesSampleData: false,
  },
  {
    id: "extracted-facts",
    label: "Extracted Facts",
    description: "Fact-like evidence surfaced from traces and insight candidates.",
    sourceOfTruth: "allura-brain",
    readMode: "derived",
    usesSampleData: false,
  },
  {
    id: "approval-queue",
    label: "Approval Queue",
    description: "Pending canonical proposals requiring curator/HITL approval.",
    sourceOfTruth: "allura-brain",
    readMode: "live",
    usesSampleData: false,
  },
]

export function getAlluraRoutePolicy(): AdapterDeclaration {
  const registry = createDefaultRegistry()
  const adapter = getAdapter(registry, "allura-brain")

  if (!adapter) {
    throw new Error("Allura Brain adapter is not registered")
  }

  return adapter
}
