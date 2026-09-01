import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { emptyWhen, getRecentMemories } from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

export default async function SearchPage() {
  const { user, scope } = await requireDashboardScope("/dashboard/search")
  const state = emptyWhen(await getRecentMemories(scope), (data) => data.length === 0)

  return (
    <DashboardShell user={user} title="Search">
      <SurfaceState
        state={state}
        emptyLabel="No memories yet."
        render={(data) => (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.map((memory) => (
              <li key={memory.id} style={{ borderBottom: "1px solid #e5e7eb", padding: "8px 0", fontSize: 14 }}>
                <span style={{ color: "#6b7280", fontSize: 12 }}>{memory.memoryType}</span>
                <p style={{ margin: "4px 0 0" }}>{memory.content}</p>
              </li>
            ))}
          </ul>
        )}
      />
    </DashboardShell>
  )
}
