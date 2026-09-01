import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { emptyWhen, getTeams } from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

export default async function TeamsPage() {
  const { user, scope } = await requireDashboardScope("/dashboard/teams")
  const state = emptyWhen(await getTeams(scope), (data) => data.length === 0)

  return (
    <DashboardShell user={user} title="Teams">
      <SurfaceState
        state={state}
        emptyLabel="No agent activity yet."
        render={(data) => (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {data.map((team) => (
              <li key={team.agentId} style={{ borderBottom: "1px solid #e5e7eb", padding: "8px 0", fontSize: 14 }}>
                <strong>{team.agentId}</strong>
                <span style={{ color: "#6b7280", marginLeft: 8 }}>{team.events} events</span>
              </li>
            ))}
          </ul>
        )}
      />
    </DashboardShell>
  )
}
