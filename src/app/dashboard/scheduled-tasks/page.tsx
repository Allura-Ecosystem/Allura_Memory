import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Scheduled Tasks",
}

export default function ScheduledTasksPage() {
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
          Background Intelligence
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
          Scheduled Tasks
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Allura&apos;s background intelligence. Discover. Analyze. Recommend.
        </p>
      </div>

      {/* Status strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "rgba(217, 154, 23, 0.08)",
          border: "1px solid rgba(217, 154, 23, 0.28)",
          borderRadius: "8px",
          marginBottom: "24px",
          width: "min(100%, 720px)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--allura-gold)",
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "13px", color: "#7a4f02", fontWeight: 600 }}>
          No scheduled tasks active
        </span>
        <span style={{ fontSize: "12px", color: "var(--allura-gray-500)", marginLeft: "4px" }}>
          &mdash; curator watchdog is idle
        </span>
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
          This surface is being built. Check back soon.
        </p>
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>
          Scheduled tasks will surface curator pipeline runs, embedding backfill jobs, and
          watchdog activity from the{" "}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>src/curator/</code> subsystem.
        </p>
      </div>
    </div>
  )
}
