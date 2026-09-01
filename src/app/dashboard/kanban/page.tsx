import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { emptyWhen, getWorkItems } from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

export default async function KanbanPage() {
  const { user, scope } = await requireDashboardScope("/dashboard/kanban")
  const state = emptyWhen(await getWorkItems(scope), (data) => data.length === 0)

  return (
    <DashboardShell user={user} title="Work Board">
      <SurfaceState
        state={state}
        emptyLabel="No work items yet."
        render={(data) => (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.map((item) => (
              <li key={item.id} style={{ borderBottom: "1px solid #e5e7eb", padding: "8px 0", fontSize: 14 }}>
                <strong>{item.title}</strong>
                <span style={{ color: "#6b7280", marginLeft: 8 }}>{item.status} · {item.priority}</span>
              </li>
            ))}
          </ul>
        )}
      />
    </DashboardShell>
  )
}
