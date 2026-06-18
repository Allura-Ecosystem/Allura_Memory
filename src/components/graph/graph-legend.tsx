"use client"

import type { ReactElement } from "react"
import { CATEGORY_STYLES, EDGE_STYLES } from "@/lib/graph/types"
import type { NodeCategory, EdgeRelationship } from "@/lib/graph/types"

const VISIBLE_CATEGORIES: NodeCategory[] = [
  "platform", "security", "memory", "agent", "policy", "audit", "ops",
]

const VISIBLE_EDGES: EdgeRelationship[] = [
  "OWNS", "GUARDS", "WRITES", "READS", "APPROVES", "GOVERNED_BY", "DEPENDS_ON",
]

export function GraphLegend(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "var(--sans, 'IBM Plex Sans', sans-serif)",
      }}
    >
      {/* Show categories section */}
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--c-muted, #6b6e73)",
            marginBottom: 11,
          }}
        >
          Show categories
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {VISIBLE_CATEGORIES.map((cat) => {
            const s = CATEGORY_STYLES[cat]
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px" }}>
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: s.accent,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--c-ink, #1b1d21)" }}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Relationships */}
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--c-muted, #6b6e73)",
            marginBottom: 10,
          }}
        >
          Relationships
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {VISIBLE_EDGES.map((rel) => {
            const e = EDGE_STYLES[rel]
            return (
              <div key={rel} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <svg width="22" height="8" style={{ flexShrink: 0 }}>
                  <line
                    x1="1" y1="4" x2="21" y2="4"
                    stroke={e.color}
                    strokeWidth="2.5"
                    strokeDasharray={e.dashed ? "4,3" : undefined}
                    strokeLinecap="round"
                  />
                </svg>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "var(--c-ink, #1b1d21)",
                    fontFamily: "var(--mono, monospace)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {e.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
