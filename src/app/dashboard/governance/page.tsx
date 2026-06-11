import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Governance",
}

export default function GovernancePage() {
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
          Governance
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
          Governance
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Policy gates, approvals, provenance, and evidence trails.
        </p>
      </div>

      {/* Pending approvals strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "rgba(17, 148, 90, 0.06)",
          border: "1px solid rgba(17, 148, 90, 0.22)",
          borderRadius: "8px",
          marginBottom: "24px",
          width: "min(100%, 800px)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--allura-green)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "13px", color: "#0a5c38", fontWeight: 600 }}>
          HITL gate active
        </span>
        <span style={{ fontSize: "12px", color: "var(--allura-gray-500)", marginLeft: "4px" }}>
          &mdash; 0 proposals pending curator review &mdash; scope:{" "}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>allura-system</code>
        </span>
      </div>

      {/* Queue placeholder grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "12px",
          marginBottom: "24px",
          width: "min(100%, 800px)",
        }}
      >
        {(
          [
            { label: "Pending", value: "—", accent: "var(--allura-gold)" },
            { label: "Approved (7d)", value: "—", accent: "var(--allura-green)" },
            { label: "Rejected (7d)", value: "—", accent: "var(--allura-red)" },
          ] as const
        ).map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "16px",
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              display: "grid",
              gap: "4px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "var(--allura-gray-500)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {stat.label}
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: stat.accent,
              }}
            >
              {stat.value}
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
          width: "min(100%, 800px)",
        }}
      >
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0 0 8px" }}>
          This surface is being built. Check back soon.
        </p>
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
          Governance surfaces promotion proposals from the curator pipeline, approval queues,
          policy audit trails, and provenance for every canonical Neo4j write.
        </p>
      </div>
    </div>
  )
}
