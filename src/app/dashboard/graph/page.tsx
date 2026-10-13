import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { KnowledgeMapWorkspace } from "@/components/dashboard/knowledge-map/knowledge-map-workspace"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"

export const dynamic = "force-dynamic"

export default async function GraphPage() {
  const { user } = await requireDashboardScope("/dashboard/graph")

  return (
    <DashboardShell user={user} title="Graph" wide>
      <KnowledgeMapWorkspace />
    </DashboardShell>
  )
}
