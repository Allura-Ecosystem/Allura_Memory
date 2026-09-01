import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { emptyWhen, getOverview } from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

export default async function DashboardOverviewPage() {
  const { user, scope } = await requireDashboardScope("/dashboard")
  const state = emptyWhen(
    await getOverview(scope),
    (data) => data.memories === 0 && data.events === 0 && data.proposals === 0 && data.workItems === 0 && data.graphMemories === 0,
  )

  return (
    <DashboardShell user={user} title="Overview">
      <SurfaceState
        state={state}
        emptyLabel="No governed records yet."
        render={(data) => (
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", fontSize: 14, color: "#374151" }}>
            <dt style={{ fontWeight: 600 }}>Memories</dt>
            <dd style={{ margin: 0 }}>{data.memories}</dd>
            <dt style={{ fontWeight: 600 }}>Events</dt>
            <dd style={{ margin: 0 }}>{data.events}</dd>
            <dt style={{ fontWeight: 600 }}>Proposals</dt>
            <dd style={{ margin: 0 }}>{data.proposals}</dd>
            <dt style={{ fontWeight: 600 }}>Work items</dt>
            <dd style={{ margin: 0 }}>{data.workItems}</dd>
            <dt style={{ fontWeight: 600 }}>Graph memories</dt>
            <dd style={{ margin: 0 }}>{data.graphMemories}</dd>
          </dl>
        )}
      />
    </DashboardShell>
  )
}
