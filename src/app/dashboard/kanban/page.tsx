import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Kanban Board",
}

export default function KanbanPage() {
  const columns = ["Backlog", "In Progress", "Review", "Done"] as const

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ marginBottom: "24px" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--allura-blue)",
            margin: "0 0 8px",
          }}
        >
          Planning
        </p>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--allura-charcoal)",
            letterSpacing: "-0.01em",
            margin: "0 0 4px",
          }}
        >
          Kanban Board
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Plan and track work across your projects.
        </p>
      </div>

      {/* Board skeleton */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(200px, 1fr))",
          gap: "14px",
          overflowX: "auto",
          paddingBottom: "8px",
        }}
      >
        {columns.map((col) => (
          <div
            key={col}
            style={{
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              padding: "14px",
              minHeight: "320px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--allura-charcoal)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {col}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--allura-gray-500)",
                  background: "rgba(17, 24, 39, 0.06)",
                  borderRadius: "99px",
                  padding: "1px 7px",
                  fontFamily: '"IBM Plex Mono", monospace',
                }}
              >
                0
              </span>
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>Empty</span>
            </div>
          </div>
        ))}
      </div>

      <p
        style={{
          marginTop: "16px",
          fontSize: "12px",
          color: "var(--allura-gray-500)",
        }}
      >
        This surface is being built. Cards and task data will be loaded from the Allura Brain memory graph.
      </p>
    </div>
  )
}
