import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Knowledge Graph",
}

export default function GraphPage() {
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
          Knowledge Graph
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
          Knowledge Graph
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Explore entities, connections, and memory relationships.
        </p>
      </div>

      {/* Graph status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "rgba(29, 78, 216, 0.05)",
          border: "1px solid rgba(29, 78, 216, 0.18)",
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
            background: "var(--allura-blue)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "13px", color: "var(--allura-blue)", fontWeight: 600 }}>
          Neo4j 5.26
        </span>
        <span style={{ fontSize: "12px", color: "var(--allura-gray-500)", marginLeft: "4px" }}>
          &mdash; bolt://localhost:7687 &mdash; scope:{" "}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>allura-system</code>
        </span>
      </div>

      {/* Canvas placeholder */}
      <div
        style={{
          width: "min(100%, 960px)",
          height: "480px",
          background: "var(--allura-paper)",
          border: "1px solid var(--allura-cream)",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        {/* Minimal graph illustration */}
        <svg
          width="80"
          height="60"
          viewBox="0 0 80 60"
          fill="none"
          aria-hidden="true"
          style={{ opacity: 0.25 }}
        >
          <circle cx="20" cy="30" r="8" fill="var(--allura-blue)" />
          <circle cx="60" cy="15" r="6" fill="var(--allura-orange)" />
          <circle cx="60" cy="45" r="6" fill="var(--allura-green)" />
          <line x1="28" y1="30" x2="54" y2="17" stroke="var(--allura-charcoal)" strokeWidth="1.5" />
          <line x1="28" y1="30" x2="54" y2="43" stroke="var(--allura-charcoal)" strokeWidth="1.5" />
        </svg>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Graph canvas loading requires Neo4j connection.
        </p>
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
          This surface is being built. The @xyflow/react graph renderer will display entity nodes
          and <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>SUPERSEDES</code> relationship edges.
        </p>
      </div>
    </div>
  )
}
