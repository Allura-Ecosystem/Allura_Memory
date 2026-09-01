import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { emptyWhen, getGraphStats } from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

export default async function GraphPage() {
  const { user, scope } = await requireDashboardScope("/dashboard/graph")
  const state = emptyWhen(
    await getGraphStats(scope),
    (data) => data.memories === 0 && data.superseded === 0 && data.structuralNodes === 0 && data.structuralEdges === 0,
  )

  return (
    <DashboardShell user={user} title="Graph">
      <SurfaceState
        state={state}
        emptyLabel="No knowledge graph yet."
        render={(data) => (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", fontSize: 14, color: "#374151" }}>
            <dt style={{ fontWeight: 600 }}>Memories</dt>
            <dd style={{ margin: 0 }}>{data.memories}</dd>
            <dt style={{ fontWeight: 600 }}>Superseded</dt>
            <dd style={{ margin: 0 }}>{data.superseded}</dd>
            <dt style={{ fontWeight: 600 }}>Structural nodes</dt>
            <dd style={{ margin: 0 }}>{data.structuralNodes}</dd>
            <dt style={{ fontWeight: 600 }}>Structural edges</dt>
            <dd style={{ margin: 0 }}>{data.structuralEdges}</dd>
          </dl>
        )}
      />
    </DashboardShell>
  )
}
