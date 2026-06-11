import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "New Chat",
}

export default function NewChatPage() {
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
            marginBottom: "8px",
            margin: "0 0 8px",
          }}
        >
          Chat
        </p>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--allura-charcoal)",
            letterSpacing: "-0.01em",
            marginBottom: "4px",
            margin: "0 0 4px",
          }}
        >
          New Chat
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Ask Allura about your memory graph.
        </p>
      </div>

      {/* Chat input placeholder */}
      <div
        style={{
          width: "min(100%, 720px)",
          marginBottom: "32px",
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
          <span
            style={{
              flex: 1,
              fontSize: "14px",
              color: "var(--allura-gray-500)",
              userSelect: "none",
            }}
          >
            Ask about memories, graph entities, traces, or governance&hellip;
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              background: "rgba(17, 24, 39, 0.06)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--allura-gray-500)",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            ⌘K
          </span>
        </div>
        <p
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "var(--allura-gray-500)",
          }}
        >
          Scope: <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>allura-system</code> &mdash; memories
          sourced from PostgreSQL episodic layer and Neo4j semantic graph.
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
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          No conversation yet. Start by asking a question above.
        </p>
      </div>
    </div>
  )
}
