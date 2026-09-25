import { MyWorkWorkspace, type WorkspaceDocument } from "@/components/dashboard/my-work-workspace"
import { requireDashboardScope } from "@/lib/dashboard/page-guard"
import { mapAuthorizedWorkspaceProviderState, readAuthorizedWorkspaceState } from "@/lib/digital-brain/read-service"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { SurfaceState } from "@/components/dashboard/surface-state"
import { emptyWhen, getOverview } from "@/lib/dashboard/read-service"

export const dynamic = "force-dynamic"

function localDatabaseIsExplicitlyEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ALLURA_EPIC30_LOCAL_DB === "enabled"
}

/** Epic 30 local-only vertical slice. Authority and database scope remain server-derived. */
export default async function DashboardOverviewPage(): Promise<React.ReactElement> {
  const { user, scope } = await requireDashboardScope("/dashboard")

  if (!localDatabaseIsExplicitlyEnabled()) {
    const state = emptyWhen(await getOverview(scope), (data) =>
      data.memories === 0 && data.events === 0 && data.proposals === 0 && data.workItems === 0 && data.graphMemories === 0)
    return <DashboardShell user={user} title="Overview">
      <SurfaceState state={state} emptyLabel="No governed records yet." render={(data) => (
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "8px 16px", fontSize: 14, color: "#374151" }}>
          <dt style={{ fontWeight: 600 }}>Memories</dt><dd style={{ margin: 0 }}>{data.memories}</dd>
          <dt style={{ fontWeight: 600 }}>Events</dt><dd style={{ margin: 0 }}>{data.events}</dd>
          <dt style={{ fontWeight: 600 }}>Proposals</dt><dd style={{ margin: 0 }}>{data.proposals}</dd>
          <dt style={{ fontWeight: 600 }}>Work items</dt><dd style={{ margin: 0 }}>{data.workItems}</dd>
          <dt style={{ fontWeight: 600 }}>Graph memories</dt><dd style={{ margin: 0 }}>{data.graphMemories}</dd>
        </dl>
      )} />
    </DashboardShell>
  }

  try {
    const result = mapAuthorizedWorkspaceProviderState(scope, await readAuthorizedWorkspaceState(scope))
    const documents: WorkspaceDocument[] = result.documents.map((document) => ({
      ...document,
      updatedAt: document.updatedAt.toISOString(),
    }))
    return <MyWorkWorkspace documents={documents} dataState={result.state} {...(process.env.ALLURA_EPIC30_PROCESS_ID ? { processRunId: process.env.ALLURA_EPIC30_PROCESS_ID } : {})} />
  } catch {
    // Do not leak connection, schema, scope, or resource details to the browser.
    console.error("[Epic30] synthetic local database read unavailable")
    return <MyWorkWorkspace documents={[]} dataState="error" processRunId={process.env.ALLURA_EPIC30_PROCESS_ID} />
  }
}
