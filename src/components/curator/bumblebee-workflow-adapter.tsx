import {
  ExposuresSurface,
  IncidentsSurface,
  PolicyDraftsSurface,
  ReceiptsSurface,
  SourcesSurface,
} from "@/components/bumblebee/surfaces"
import type { BumblebeeModuleView } from "@/lib/curator/module-contract"

/**
 * Host-owned adapter for the sole allowlisted Bumblebee workflow. It chooses
 * approved surfaces and supplies only the server-issued view; the module never
 * controls routes, scope, storage, identity, or authority.
 */
export function BumblebeeWorkflowAdapter({ module }: { module: BumblebeeModuleView }) {
  if (module.state === "unavailable") {
    return <section aria-label={module.title}><h2>{module.title}</h2><p>Bumblebee is currently unavailable.</p></section>
  }

  const summary = module.summary!
  return (
    <section aria-label={module.title} data-testid="host-owned-bumblebee-adapter">
      <h2>{module.title}</h2>
      <p>{summary.sources} sources</p>
      <p>{summary.openExposures} open exposures</p>
      <SourcesSurface rows={[]} />
      <ExposuresSurface rows={[]} />
      <PolicyDraftsSurface drafts={[]} />
      <IncidentsSurface rows={[]} />
      <ReceiptsSurface rows={[]} />
    </section>
  )
}
