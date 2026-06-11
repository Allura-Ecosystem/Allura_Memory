import type { Metadata } from "next"

import { APP_CONFIG } from "@/config/app-config"
import { SettingsResources, SettingsTelemetry } from "@/components/dashboard/settings-resources"

export const metadata: Metadata = {
  title: "Settings",
}

export default function SettingsPage() {
  const sections = [
    {
      heading: "Runtime",
      rows: [
        { key: "Default Group ID", value: APP_CONFIG.defaultGroupId },
        { key: "App Version", value: APP_CONFIG.version },
        { key: "PostgreSQL", value: "localhost:5432" },
        { key: "Neo4j", value: "bolt://localhost:7687" },
        { key: "RuVector", value: "localhost:5433" },
      ],
    },
    {
      heading: "Embedding",
      rows: [
        { key: "Provider", value: "Ollama (local)" },
        { key: "Model", value: "nomic-embed-text" },
        { key: "Dimensions", value: "768" },
      ],
    },
    {
      heading: "Auth",
      rows: [
        { key: "Provider", value: "DevAuthProvider (dev)" },
        { key: "Role", value: "admin" },
      ],
    },
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
          Configuration
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
          Settings
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Configure runtime, theme, and system preferences.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          width: "min(100%, 640px)",
        }}
      >
        {/* Static runtime config sections */}
        {sections.map((section) => (
          <div
            key={section.heading}
            style={{
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--allura-cream)",
                background: "rgba(17, 24, 39, 0.02)",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--allura-gray-500)",
                  fontFamily: '"IBM Plex Mono", monospace',
                }}
              >
                {section.heading}
              </span>
            </div>
            <div>
              {section.rows.map((row, i) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "12px 18px",
                    borderBottom: i < section.rows.length - 1 ? "1px solid rgba(17, 24, 39, 0.06)" : "none",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "var(--allura-charcoal)", fontWeight: 500 }}>
                    {row.key}
                  </span>
                  <code
                    style={{
                      fontSize: "12px",
                      fontFamily: '"IBM Plex Mono", monospace',
                      color: "var(--allura-gray-500)",
                      background: "rgba(17, 24, 39, 0.05)",
                      padding: "2px 8px",
                      borderRadius: "4px",
                    }}
                  >
                    {row.value}
                  </code>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Resources — live data from /api/health and /api/agents */}
        <div>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--allura-blue)",
              margin: "0 0 12px",
            }}
          >
            Resources
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <SettingsResources />
          </div>
        </div>

        {/* Telemetry stub */}
        <div>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--allura-blue)",
              margin: "0 0 12px",
            }}
          >
            Observability
          </p>
          <SettingsTelemetry />
        </div>
      </div>

      <p
        style={{
          marginTop: "20px",
          fontSize: "12px",
          color: "var(--allura-gray-500)",
          width: "min(100%, 640px)",
        }}
      >
        Editable settings and environment configuration are managed via environment variables
        and <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>.env</code>. No secrets are displayed here.
      </p>
    </div>
  )
}
