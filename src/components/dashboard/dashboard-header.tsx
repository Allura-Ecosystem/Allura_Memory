"use client"

import { ChevronDown, Clock, FileText } from "lucide-react"
import { useState } from "react"

interface DashboardHeaderProps {
  /** Active group / organization name */
  orgName?: string
  /** Name of the live data source (e.g. "allura-system") */
  sourceName?: string
  /** Freshness label (e.g. "just now" or "12s ago") */
  sourceFresh?: string
  /** How fresh the source is: "live" | "stale" | "unknown" */
  sourceFreshness?: "live" | "stale" | "unknown"
  /** Receipt / activity count */
  receiptCount?: number
}

type DataState = "Live" | "Loading" | "Empty" | "Error"

const DATA_STATES: DataState[] = ["Live", "Loading", "Empty", "Error"]

export function DashboardHeader({
  orgName = "allura-system",
  sourceName = "allura-system",
  sourceFresh = "just now",
  sourceFreshness = "live",
  receiptCount = 0,
}: DashboardHeaderProps): React.ReactElement {
  const [activeDataState, setActiveDataState] = useState<DataState>("Live")
  const [activityOpen, setActivityOpen] = useState(false)

  const freshColor =
    sourceFreshness === "live"
      ? "var(--c-green)"
      : sourceFreshness === "stale"
      ? "var(--c-orange)"
      : "var(--c-muted)"

  return (
    <header
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 18,
        height: 64,
        padding: "0 26px",
        background: "var(--c-card)",
        borderBottom: "1px solid var(--c-border)",
        fontFamily: "var(--sans)",
      }}
    >
      {/* Organization switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--c-muted)",
          }}
        >
          Organization
        </span>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 34,
            padding: "0 12px",
            background: "var(--c-bg)",
            border: "1px solid var(--c-border)",
            borderRadius: 9,
            cursor: "pointer",
            fontFamily: "var(--sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--c-ink)",
          }}
          aria-label={`Switch organization — current: ${orgName}`}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f1ece0")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--c-bg)")}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--c-green)",
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          {orgName}
          <ChevronDown size={13} style={{ color: "var(--c-muted)" }} aria-hidden="true" />
        </button>
      </div>

      {/* Source + freshness */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 16,
          borderLeft: "1px solid var(--c-border-soft)",
        }}
      >
        <FileText size={14} style={{ color: "var(--c-muted)", flexShrink: 0 }} aria-hidden="true" />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-ink)" }}>
            Source · {sourceName}
          </span>
          <span style={{ fontSize: 11, color: freshColor }}>{sourceFresh}</span>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Data state switch */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--c-bg)",
          border: "1px solid var(--c-border)",
          borderRadius: 10,
          padding: 3,
        }}
        role="group"
        aria-label="Data state selector"
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--c-muted)",
            padding: "0 6px 0 8px",
          }}
        >
          Data
        </span>
        {DATA_STATES.map((ds) => {
          const active = activeDataState === ds
          return (
            <button
              key={ds}
              onClick={() => setActiveDataState(ds)}
              title={`Switch to ${ds} state`}
              style={{
                height: 26,
                padding: "0 10px",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: "var(--sans)",
                fontSize: 12,
                fontWeight: 600,
                background: active ? "var(--c-ink)" : "transparent",
                color: active ? "#fff" : "var(--c-muted)",
                transition: "background 0.12s, color 0.12s",
              }}
            >
              {ds}
            </button>
          )
        })}
      </div>

      {/* Activity button */}
      <button
        onClick={() => setActivityOpen(!activityOpen)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 38,
          padding: "0 13px",
          background: activityOpen ? "var(--c-bg)" : "var(--c-card)",
          border: "1px solid var(--c-border)",
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: "var(--sans)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--c-ink)",
          transition: "background 0.15s",
        }}
        title="Activity and receipts"
        aria-pressed={activityOpen}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--c-bg)")}
        onMouseLeave={(e) => {
          if (!activityOpen) (e.currentTarget as HTMLElement).style.background = "var(--c-card)"
        }}
      >
        <Clock size={14} style={{ color: "var(--c-muted)" }} aria-hidden="true" />
        Activity
        {receiptCount > 0 && (
          <span
            style={{
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 9,
              background: "var(--c-blue)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label={`${receiptCount} receipts`}
          >
            {receiptCount}
          </span>
        )}
      </button>
    </header>
  )
}
