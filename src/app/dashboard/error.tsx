"use client"

/**
 * Content-free dashboard error boundary.
 *
 * Every dashboard entry point derives its principal through
 * `requireDashboardScope`. When the identity provider cannot be consulted at
 * all, that seam raises rather than inventing a principal, and a page that
 * cannot degrade gracefully would otherwise fall through to the framework's
 * default handler — which renders the raw message and `cause` chain in
 * development, including provider identifiers.
 *
 * This boundary keeps the Epic 30 disclosure rule at the last hop: no scope,
 * no session, no resource, no backend detail crosses to the browser. The
 * digest is the framework's own opaque correlation id, not our error text.
 *
 * `/dashboard` handles the provider-outage case itself and renders the
 * truthful `degraded` surface; this boundary is the fallback for the entry
 * points that have no degraded rendering of their own.
 */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }): React.ReactElement {
  return (
    <main
      data-surface-state="error"
      role="alert"
      aria-live="assertive"
      style={{ padding: 24, fontSize: 14, color: "#374151" }}
    >
      <p style={{ fontWeight: 600, letterSpacing: "0.08em", fontSize: 12, color: "#6b7280", margin: 0 }}>
        WORKSPACE UNAVAILABLE
      </p>
      <h1 style={{ fontSize: 18, margin: "8px 0" }}>This workspace could not be loaded</h1>
      <p style={{ margin: "0 0 16px" }}>
        No document names, counts, snippets, or existence details are disclosed. Retry, or contact your workspace
        administrator if this persists.
      </p>
      <button type="button" onClick={reset} style={{ padding: "8px 14px", fontSize: 14 }}>
        Retry
      </button>
    </main>
  )
}
