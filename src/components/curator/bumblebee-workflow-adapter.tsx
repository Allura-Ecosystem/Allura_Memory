import type { BumblebeeModuleView } from "@/lib/curator/module-contract"

/**
 * Host-owned adapter for the sole allowlisted Bumblebee workflow. It chooses
 * approved surfaces and supplies only the server-issued view; the module never
 * controls routes, scope, storage, identity, or authority.
 */
export function BumblebeeWorkflowAdapter({ module }: { module: BumblebeeModuleView }) {
  // Edge-case guard: only render the summary when the server actually issued
  // an available module WITH data. An available-without-summary state would
  // otherwise crash the whole curator page on summary.sources.
  if (module.state !== "available" || !module.summary) {
    return <section aria-label={module.title}><h2>{module.title}</h2><p>Bumblebee is currently unavailable.</p></section>
  }

  const summary = module.summary!
  return (
    <section aria-label={module.title} data-testid="host-owned-bumblebee-adapter">
      <h2>{module.title}</h2>
      <dl aria-label="Bumblebee workspace summary">
        <div><dt>Sources</dt><dd>{summary.sources} sources</dd></div>
        <div><dt>Open exposures</dt><dd>{summary.openExposures} open exposures</dd></div>
        <div><dt>Unpinned actions</dt><dd>{summary.unpinnedActions} unpinned actions</dd></div>
        <div><dt>Incidents</dt><dd>{summary.incidents} incidents</dd></div>
        <div><dt>Receipts</dt><dd>{summary.receipts} receipts</dd></div>
      </dl>
    </section>
  )
}
