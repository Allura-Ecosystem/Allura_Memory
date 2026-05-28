import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadProjectSummaries } from "@/lib/dashboard/project-queries"
import type { DashboardProjectSummary } from "@/lib/dashboard/types"

export default async function ProjectsPage() {
  let projects: DashboardProjectSummary[] = []
  let error: string | null = null

  try {
    projects = await loadProjectSummaries("allura-system")
  } catch {
    error = "Project telemetry is temporarily unavailable. Mission Control could not read scoped PostgreSQL events."
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Projects</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">
          Live project telemetry from scoped Allura events.
        </p>
      </div>

      {error ? (
        <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
          <CardHeader>
            <CardTitle className="text-base text-[var(--dashboard-text-primary)]">Project telemetry degraded</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--dashboard-text-secondary)]">{error}</p>
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
          <CardHeader>
            <CardTitle className="text-base text-[var(--dashboard-text-primary)]">No scoped project events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--dashboard-text-secondary)]">
              Mission Control queried PostgreSQL for allura-system project activity, but no project labels are populated yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.project} className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
              <CardHeader>
                <CardTitle className="text-base text-[var(--dashboard-text-primary)]">{project.project}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-semibold text-[var(--dashboard-text-primary)]">{project.eventCount}</div>
                <p className="text-sm text-[var(--dashboard-text-secondary)]">
                  Scoped events recorded for this project in the Allura system ledger.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
