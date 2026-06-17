"use client"

import type { ReactElement } from "react"
import type { GraphNode, GraphEdge } from "@/lib/graph/types"
import { CATEGORY_STYLES, EDGE_STYLES, STATUS_COLORS, RISK_COLORS } from "@/lib/graph/types"

interface Props {
  node: GraphNode | null
  edges: GraphEdge[]
  nodes: GraphNode[]
  onClose: () => void
}

function InfoRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af" }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: "#1b1d21", lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

export function GraphInspector({ node, edges, nodes, onClose }: Props): ReactElement | null {
  if (!node) return null

  const style = CATEGORY_STYLES[node.type] ?? CATEGORY_STYLES.ops

  const outgoing = edges.filter((e) => e.source === node.id)
  const incoming = edges.filter((e) => e.target === node.id)

  function nodeLabel(id: string): string {
    return nodes.find((n) => n.id === id)?.label ?? id
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: style.accent,
              background: style.bg,
              padding: "2px 7px",
              borderRadius: 999,
              alignSelf: "flex-start",
            }}
          >
            {style.label}
          </span>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "#1b1d21",
              lineHeight: 1.3,
            }}
          >
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9ca3af",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 2px",
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Summary */}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "#6b6e73",
          lineHeight: 1.6,
          borderLeft: `3px solid ${style.accent}`,
          paddingLeft: 10,
        }}
      >
        {node.summary}
      </p>

      {/* Badges row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {node.status && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 999,
              background: STATUS_COLORS[node.status].bg,
              color: STATUS_COLORS[node.status].text,
            }}
          >
            {node.status.replace("_", " ")}
          </span>
        )}
        {node.riskLevel && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 999,
              background: RISK_COLORS[node.riskLevel].bg,
              color: RISK_COLORS[node.riskLevel].text,
            }}
          >
            {node.riskLevel} risk
          </span>
        )}
        {typeof node.qualityScore === "number" && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#e6f4ed",
              color: "#298f57",
            }}
          >
            quality {Math.round(node.qualityScore * 100)}%
          </span>
        )}
      </div>

      {/* Details */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {node.owner && <InfoRow label="Owner" value={node.owner} />}
        <InfoRow label="ID" value={node.id} />
        {typeof node.connected === "number" && (
          <InfoRow label="Connections" value={String(node.connected)} />
        )}
      </div>

      {/* Relationships */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#9ca3af",
            }}
          >
            Connections
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {outgoing.map((e) => {
              const es = EDGE_STYLES[e.relationship]
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "#1b1d21",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: es.color, fontWeight: 700, fontSize: 10 }}>→</span>
                  <span
                    style={{
                      color: es.color,
                      fontSize: 10,
                      background: `${es.color}18`,
                      padding: "1px 5px",
                      borderRadius: 4,
                      fontWeight: 600,
                    }}
                  >
                    {es.label}
                  </span>
                  <span style={{ color: "#6b6e73" }}>{nodeLabel(e.target)}</span>
                </div>
              )
            })}
            {incoming.map((e) => {
              const es = EDGE_STYLES[e.relationship]
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "#1b1d21",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 10 }}>←</span>
                  <span style={{ color: "#9ca3af" }}>{nodeLabel(e.source)}</span>
                  <span
                    style={{
                      color: es.color,
                      fontSize: 10,
                      background: `${es.color}18`,
                      padding: "1px 5px",
                      borderRadius: 4,
                      fontWeight: 600,
                    }}
                  >
                    {es.label}
                  </span>
                  <span style={{ color: "#6b6e73" }}>this</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Doc links */}
      {node.docLinks && node.docLinks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#9ca3af",
            }}
          >
            Docs
          </div>
          {node.docLinks.map((link) => (
            <a
              key={link}
              href={`/${link}`}
              style={{
                fontSize: 11,
                color: "#2961b8",
                textDecoration: "none",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {link}
            </a>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4, borderTop: "1px solid #e8e3d8" }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#9ca3af",
            marginBottom: 2,
          }}
        >
          Actions
        </div>
        <a
          href="/dashboard/approvals"
          style={{
            fontSize: 11,
            color: "#1b1d21",
            textDecoration: "none",
            padding: "7px 10px",
            borderRadius: 7,
            border: "1px solid #d1c7b2",
            background: "#f6f3ec",
            display: "block",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Open audit trail
        </a>
        {node.evidenceIds && node.evidenceIds.length > 0 && (
          <a
            href="/dashboard/evidence"
            style={{
              fontSize: 11,
              color: "#298f57",
              textDecoration: "none",
              padding: "7px 10px",
              borderRadius: 7,
              border: "1px solid #c3e6d4",
              background: "#e6f4ed",
              display: "block",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            View evidence ({node.evidenceIds.length})
          </a>
        )}
      </div>
    </div>
  )
}
