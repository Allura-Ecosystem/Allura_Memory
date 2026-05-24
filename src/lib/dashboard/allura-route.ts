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
  | "Dashboard"
  | "Memories"
  | "Insights"
  | "Trace logs"
  | "Provenance"
  | "Extracted"
  | "Agents"
  | "Approvals"
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

export const DASHBOARD_WORKFLOW_NAV_ITEMS: DashboardWorkflowNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "memories", label: "Memories", href: "/dashboard/memory-space", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "insights", label: "Insights", href: "/dashboard/insights", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "trace-logs", label: "Trace logs", href: "/dashboard/audit", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "provenance", label: "Provenance", href: "/dashboard/memory-space?view=provenance", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "extracted", label: "Extracted", href: "/dashboard/insights?tab=extracted", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "agents", label: "Agents", href: "/dashboard/agents", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
  { id: "approvals", label: "Approvals", href: "/dashboard/insights?tab=pending", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
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
