import type { DashboardState } from "@/lib/dashboard/read-service"

/**
 * Renders a server-owned dashboard read state truthfully.
 *
 * - live: the surface's data (rendered by the caller via `render`)
 * - empty: an explicit zero-data state with source/freshness and next action
 * - degraded: the route stays navigable and reports the dependency problem
 * - error: an explicit failure state without fabricating success
 */
export function SurfaceState<T>({
  state,
  render,
  emptyLabel,
}: {
  state: DashboardState<T>
  render: (data: T) => React.ReactNode
  emptyLabel: string
}): React.ReactElement {
  if (state.state === "degraded") {
    return (
      <div role="alert" data-surface-state="degraded" style={{ color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: 16 }}>
        <strong>Data temporarily unavailable.</strong>
        <p style={{ margin: "8px 0 0" }}>{state.message}</p>
      </div>
    )
  }

  if (state.state === "error") {
    return (
      <div role="alert" data-surface-state="error" style={{ color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: 16 }}>
        <strong>This surface could not load.</strong>
        <p style={{ margin: "8px 0 0" }}>{state.message}</p>
      </div>
    )
  }

  if (state.state === "empty") {
    return (
      <div data-surface-state="empty" style={{ color: "#374151", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
        <strong>{emptyLabel}</strong>
        <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
          No records exist for this tenant and workspace yet. Data will appear once governed activity begins.
        </p>
        <p style={{ margin: "8px 0 0", color: "#6b7280", fontSize: 12 }}>Fetched {state.fetchedAt}</p>
      </div>
    )
  }

  return (
    <div data-surface-state="live">
      {render(state.data)}
      <p style={{ margin: "16px 0 0", color: "#6b7280", fontSize: 12 }}>Fetched {state.fetchedAt}</p>
    </div>
  )
}
