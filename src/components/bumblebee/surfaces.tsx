/**
 * Bumblebee operator module surfaces (Story 26.7 AC-1).
 *
 * Five presentational surfaces: Sources, Exposures, Policy Drafts, Incidents,
 * and Receipts. These are pure presentation -- they receive already-scoped,
 * already-fetched rows and render them. They never query, never authorize,
 * never mutate, and hold no client-side state, which is what keeps them
 * compatible with the module contract Epic 25's registry will eventually
 * enforce (REQ-MOD-002: modules "may define presentation and typed workflow
 * descriptors but cannot load arbitrary client code, query storage, select
 * scope, map identity, authorize, evaluate policy, mutate state, issue
 * receipts, or redefine standard truth states").
 *
 * ACCESSIBILITY (AC-5). Every surface is a landmark `<section>` with an
 * accessible name, every table has a `<caption>`, and column headers use
 * `scope="col"`. Empty states are rendered as real text rather than an empty
 * table, so a screen-reader user gets "no exposures" rather than silence --
 * which is also the honest operational answer (an empty table and a table
 * that failed to load must never look identical).
 */

import type { ExposureRow, ReceiptRow, SourceRow } from "@/lib/curator/operator-read-service"
import type { MitigationDraft } from "@/lib/mitigation/types"

function EmptyState({ message }: { message: string }) {
  return <p data-testid="empty-state">{message}</p>
}

function Surface({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  const headingId = `${id}-heading`
  return (
    <section aria-labelledby={headingId} data-testid={`surface-${id}`}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  )
}

export function SourcesSurface({ rows }: { rows: readonly SourceRow[] }) {
  return (
    <Surface id="sources" title="Sources">
      {rows.length === 0 ? (
        <EmptyState message="No supply-chain artifacts have been inventoried for this workspace yet." />
      ) : (
        <table>
          <caption>Inventoried supply-chain artifacts</caption>
          <thead>
            <tr>
              <th scope="col">Artifact</th>
              <th scope="col">Type</th>
              <th scope="col">Version</th>
              <th scope="col">Pinning</th>
              <th scope="col">Trust</th>
              <th scope="col">Freshness</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.package}</th>
                <td>{row.artifact_type}</td>
                <td>{row.version}</td>
                <td>
                  {row.artifact_type === "ci_workflow"
                    ? row.hash === "unpinned"
                      ? "Mutable tag"
                      : "SHA-pinned"
                    : "n/a"}
                </td>
                <td>{row.trust_state}</td>
                <td>{row.freshness_state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  )
}

export function ExposuresSurface({ rows }: { rows: readonly ExposureRow[] }) {
  return (
    <Surface id="exposures" title="Exposures">
      {rows.length === 0 ? (
        <EmptyState message="No exposures have been matched for this workspace." />
      ) : (
        <table>
          <caption>Matched exposures</caption>
          <thead>
            <tr>
              <th scope="col">Artifact</th>
              <th scope="col">Match type</th>
              <th scope="col">Severity</th>
              <th scope="col">State</th>
              <th scope="col">First seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.artifact_ref}</th>
                <td>{row.match_type}</td>
                <td>{row.severity}</td>
                <td>{row.lifecycle_state}</td>
                <td>{row.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  )
}

export function PolicyDraftsSurface({ drafts }: { drafts: readonly MitigationDraft[] }) {
  return (
    <Surface id="policy-drafts" title="Policy Drafts">
      <p data-testid="drafts-authority-note">
        Drafts are simulated only. Activating one requires a separate approval and is not
        possible from this surface.
      </p>
      {drafts.length === 0 ? (
        <EmptyState message="No mitigation drafts have been generated for this workspace." />
      ) : (
        <table>
          <caption>Simulated mitigation policy drafts</caption>
          <thead>
            <tr>
              <th scope="col">Template</th>
              <th scope="col">Alert</th>
              <th scope="col">Authority</th>
              <th scope="col">Approval</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr key={draft.id}>
                <th scope="row">{draft.template_id}</th>
                <td>{draft.alert_id}</td>
                <td>{draft.authority_state}</td>
                <td>{draft.approval_state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  )
}

export function IncidentsSurface({ rows }: { rows: readonly ExposureRow[] }) {
  return (
    <Surface id="incidents" title="Incidents">
      {rows.length === 0 ? (
        <EmptyState message="No exposures have progressed beyond initial detection." />
      ) : (
        <table>
          <caption>Exposures under active handling</caption>
          <thead>
            <tr>
              <th scope="col">Artifact</th>
              <th scope="col">Severity</th>
              <th scope="col">State</th>
              <th scope="col">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.artifact_ref}</th>
                <td>{row.severity}</td>
                <td>{row.lifecycle_state}</td>
                <td>{row.updated_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  )
}

export function ReceiptsSurface({ rows }: { rows: readonly ReceiptRow[] }) {
  return (
    <Surface id="receipts" title="Receipts">
      {rows.length === 0 ? (
        <EmptyState message="No governed decisions have been recorded for this workspace." />
      ) : (
        <table>
          <caption>Immutable governed decision receipts</caption>
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Action</th>
              <th scope="col">Subject</th>
              <th scope="col">Actor</th>
              <th scope="col">Approval</th>
              <th scope="col">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.kind}-${row.id}`}>
                <th scope="row">{row.kind}</th>
                <td>{row.action}</td>
                <td>{row.subject_ref}</td>
                <td>
                  {row.actor_id} ({row.actor_role})
                </td>
                <td>{row.approval_ref}</td>
                <td>{row.occurred_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Surface>
  )
}
