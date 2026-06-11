import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Search",
}

export default function SearchPage() {
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
          Memory Search
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
          Search
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Search, inspect, and govern what Allura should remember.
        </p>
      </div>

      {/* Search input placeholder */}
      <div
        style={{
          width: "min(100%, 720px)",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            background: "rgba(255, 255, 255, 0.72)",
            border: "1px solid var(--dashboard-border)",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(17, 24, 39, 0.05)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: 0, color: "var(--allura-gray-500)" }}
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ flex: 1, fontSize: "14px", color: "var(--allura-gray-500)", userSelect: "none" }}>
            Search memories, entities, traces&hellip;
          </span>
          <span
            style={{
              padding: "2px 6px",
              background: "rgba(17, 24, 39, 0.06)",
              borderRadius: "4px",
              fontSize: "11px",
              color: "var(--allura-gray-500)",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            hybrid
          </span>
        </div>
        <p style={{ marginTop: "8px", fontSize: "12px", color: "var(--allura-gray-500)" }}>
          Search mode: hybrid (vector ANN + BM25 RRF fusion) &mdash; scope:{" "}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>allura-system</code>
        </p>
      </div>

      {/* Empty state */}
      <div
        style={{
          padding: "48px",
          textAlign: "center",
          background: "var(--allura-paper)",
          borderRadius: "12px",
          border: "1px solid var(--allura-cream)",
          width: "min(100%, 720px)",
        }}
      >
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0 0 8px" }}>
          No results yet. Enter a query to search the memory graph.
        </p>
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
          Results will include episodic traces (PostgreSQL) and canonical insights (Neo4j).
        </p>
      </div>
    </div>
  )
}
