import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import {
  emptyWhen,
  getOverview,
  getTeams,
  getWorkItems,
  type OverviewData,
  type TeamRow,
  type WorkItemRow,
} from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

/**
 * Workspaces known to hold disposable, Docker-only fixture data (the founder
 * demo seed, `docker/portfolio-postgres/99-portfolio-demo-workspace.sql`).
 * Anything in these workspaces gets an explicit fixture label so a founder
 * reviewing this page never mistakes seeded rows for production activity.
 */
const FIXTURE_WORKSPACE_IDS = new Set(["workspace-allura", "epic30-local-workspace"])

const ATTENTION_STATUSES = new Set(["blocked", "in_review"])

function kpiCards(data: OverviewData): React.ReactElement {
  const cards: Array<{ label: string; value: number }> = [
    { label: "Memories", value: data.memories },
    { label: "Events", value: data.events },
    { label: "Work items", value: data.workItems },
    { label: "Proposals", value: data.proposals },
    { label: "Graph memories", value: data.graphMemories },
  ]
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, margin: 0 }}>
      {cards.map((card) => (
        <div key={card.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
          <dt style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</dt>
          <dd style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 700, color: "#0f1115" }}>{card.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function attentionSection(workItems: WorkItemRow[]): React.ReactElement {
  const attention = workItems.filter((item) => ATTENTION_STATUSES.has(item.status))
  if (attention.length === 0) {
    return (
      <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>No work items are blocked or in review.</p>
    )
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {attention.map((item) => (
        <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: item.status === "blocked" ? "#fef2f2" : "#fffbeb", borderRadius: 8, fontSize: 14 }}>
          <span>{item.title}</span>
          <span style={{ color: item.status === "blocked" ? "#991b1b" : "#92400e", fontWeight: 600, textTransform: "capitalize" }}>{item.status.replace("_", " ")}</span>
        </li>
      ))}
    </ul>
  )
}

function activityFeed(workItems: WorkItemRow[], teams: TeamRow[]): React.ReactElement {
  const recentWork = workItems.slice(0, 5)
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 15, margin: "0 0 8px", color: "#374151" }}>Recent work</h2>
        {recentWork.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>No work items yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {recentWork.map((item) => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: "#374151" }}>
                <span>{item.title}</span>
                <span style={{ color: "#6b7280", textTransform: "capitalize" }}>{item.status.replace("_", " ")} &middot; {item.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h2 style={{ fontSize: 15, margin: "0 0 8px", color: "#374151" }}>Active agents</h2>
        {teams.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>No agent activity recorded yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {teams.slice(0, 5).map((team) => (
              <li key={team.agentId} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: "#374151" }}>
                <span>{team.agentId}</span>
                <span style={{ color: "#6b7280" }}>{team.events} events</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default async function MissionControlPage() {
  const { user, scope } = await requireDashboardScope("/dashboard/mission-control")

  const [overviewState, workItemsState, teamsState] = await Promise.all([
    emptyWhen(await getOverview(scope), (data) => data.events === 0 && data.workItems === 0),
    getWorkItems(scope),
    getTeams(scope),
  ])

  const workItems = workItemsState.state === "live" ? workItemsState.data : []
  const teams = teamsState.state === "live" ? teamsState.data : []
  const isFixtureWorkspace = FIXTURE_WORKSPACE_IDS.has(scope.workspaceId)

  return (
    <DashboardShell user={user} title="Mission Control">
      {isFixtureWorkspace ? (
        <p
          data-fixture-notice="true"
          style={{ margin: "0 0 20px", padding: "10px 14px", background: "#eef2ff", color: "#3730a3", borderRadius: 8, fontSize: 13, fontWeight: 600 }}
        >
          Fixture data &mdash; this workspace holds disposable, Docker-only demo records. Nothing here is production activity.
        </p>
      ) : null}
      <SurfaceState
        state={overviewState}
        emptyLabel="No execution activity yet."
        emptyDescription="No execution events exist in this workspace and no work items exist in this tenant yet."
        render={(data) => (
          <div style={{ display: "grid", gap: 28 }}>
            {kpiCards(data)}
            <section>
              <h2 style={{ fontSize: 15, margin: "0 0 8px", color: "#374151" }}>Needs attention</h2>
              {attentionSection(workItems)}
            </section>
            <section>
              {activityFeed(workItems, teams)}
            </section>
          </div>
        )}
      />
    </DashboardShell>
  )
}
