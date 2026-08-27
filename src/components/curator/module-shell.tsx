import { BumblebeeWorkflowAdapter } from "@/components/curator/bumblebee-workflow-adapter"
import type { CuratorModuleIssue, CuratorShellState } from "@/lib/curator/module-contract"

const STATE_COPY: Record<CuratorShellState, string> = {
  loading: "Loading curator workflows…",
  empty: "No curator workflows are available for this workspace.",
  denied: "Curator workflow access was denied.",
  stale: "Curator workflow data is stale.",
  partial: "Curator workflow data is partial.",
  degraded: "Curator workflow data is degraded.",
  conflict: "Curator workflow data has a conflict.",
  error: "Curator workflow data is temporarily unavailable.",
  complete: "Curator workflows are ready.",
}

/** Host-owned shell: module adapters cannot replace its truthful states. */
export function CuratorModuleShell({ issue }: { issue: CuratorModuleIssue }) {
  return (
    <main aria-labelledby="curator-console-heading" data-shell-state={issue.state}>
      <h1 id="curator-console-heading">Curator console</h1>
      <p aria-live="polite" role="status">{issue.message ?? STATE_COPY[issue.state]}</p>
      {issue.modules.map((module) => <BumblebeeWorkflowAdapter key={module.id} module={module} />)}
    </main>
  )
}
