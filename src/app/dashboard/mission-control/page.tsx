import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mission Control",
}

export default function MissionControlPage() {
  const panels = [
    { label: "System Health", status: "—", signal: "neutral" },
    { label: "Curation Queue", status: "—", signal: "neutral" },
    { label: "Policy Gates", status: "—", signal: "neutral" },
    { label: "Governance Log", status: "—", signal: "neutral" },
    { label: "Agent Activity", status: "—", signal: "neutral" },
    { label: "Chat Console", status: "—", signal: "neutral" },
  ] as const

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
          Operations
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
          Mission Control
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Dense operations console for health, curation, policy, governance logs, and chat.
        </p>
      </div>

      {/* Panel grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "24px",
          width: "min(100%, 1000px)",
        }}
      >
        {panels.map((panel) => (
          <div
            key={panel.label}
            style={{
              padding: "20px",
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              minHeight: "96px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--allura-gray-500)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {panel.label}
            </span>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--allura-charcoal)",
              }}
            >
              {panel.status}
            </span>
          </div>
        ))}
      </div>

      {/* Main placeholder */}
      <div
        style={{
          padding: "48px",
          textAlign: "center",
          background: "var(--allura-paper)",
          borderRadius: "12px",
          border: "1px solid var(--allura-cream)",
          width: "min(100%, 1000px)",
        }}
      >
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0 0 8px" }}>
          This surface is being built. Check back soon.
        </p>
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
          Mission Control will provide a single-pane view of system health (PostgreSQL + Neo4j + RuVector),
          live curation activity, policy gate status, governance audit logs, and an embedded chat console.
          Scope: <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>allura-system</code>.
        </p>
      </div>
    </div>
  )
}
