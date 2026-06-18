"use client"

/**
 * GraphNodeCard — custom React Flow node rendered as a warm card.
 *
 * Anatomy:
 *   ┌──────────────────────────────────┐
 *   │ ● Platform              [built]  │
 *   │ Allura Memory Engine             │
 *   │ Stores what your agents learn…   │
 *   │ ──────────────────────────────   │
 *   │ Connected: 5                     │
 *   └──────────────────────────────────┘
 *   Left border = category accent color
 */

import type { ReactElement } from "react"
import { Handle, Position } from "@xyflow/react"
import type { Node, NodeProps } from "@xyflow/react"
import type { NodeStatus, RiskLevel } from "@/lib/graph/types"
import { CATEGORY_STYLES, STATUS_COLORS, RISK_COLORS } from "@/lib/graph/types"
import type { NodeCategory } from "@/lib/graph/types"

// The data payload attached to each React Flow node.
// Must satisfy Record<string, unknown> for React Flow compatibility.
export interface GraphNodeData extends Record<string, unknown> {
  id: string
  label: string
  type: NodeCategory
  status?: NodeStatus
  riskLevel?: RiskLevel
  qualityScore?: number
  owner?: string
  summary: string
  evidenceIds?: string[]
  docLinks?: string[]
  connected?: number
}

function StatusBadge({ status }: { status: NodeStatus }): ReactElement {
  const s = STATUS_COLORS[status]
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        padding: "2px 6px",
        borderRadius: 999,
        background: s.bg,
        color: s.text,
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {status.replace("_", " ")}
    </span>
  )
}

function RiskBadge({ level }: { level: RiskLevel }): ReactElement {
  const r = RISK_COLORS[level]
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        padding: "2px 6px",
        borderRadius: 999,
        background: r.bg,
        color: r.text,
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {level}
    </span>
  )
}

export function GraphNodeCard({ data, selected }: NodeProps<Node<GraphNodeData>>): ReactElement {
  const nodeData = data as GraphNodeData
  const style = CATEGORY_STYLES[nodeData.type] ?? CATEGORY_STYLES.ops

  return (
    <div
      style={{
        background: "#fffdf8",
        border: `1px solid ${selected ? style.accent : "#d1c7b2"}`,
        borderLeft: `4px solid ${style.accent}`,
        borderRadius: 10,
        padding: "12px 14px",
        width: 220,
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        boxShadow: selected
          ? `0 4px 16px rgba(0,0,0,0.12), 0 0 0 2px ${style.accent}33`
          : "0 1px 4px rgba(27,29,33,0.06)",
        cursor: "pointer",
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      {/* Source + target handles — invisible but required for edge routing */}
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      {/* Row 1: category badge + status badges */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "2px 7px",
            borderRadius: 999,
            background: style.bg,
            color: style.accent,
            lineHeight: 1.4,
          }}
        >
          {style.label}
        </span>

        <div style={{ display: "flex", gap: 4, flexWrap: "nowrap" }}>
          {nodeData.status && <StatusBadge status={nodeData.status} />}
          {nodeData.riskLevel && nodeData.riskLevel !== "low" && (
            <RiskBadge level={nodeData.riskLevel} />
          )}
        </div>
      </div>

      {/* Row 2: node label */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#1b1d21",
          lineHeight: 1.3,
          wordBreak: "break-word",
        }}
      >
        {nodeData.label}
      </div>

      {/* Row 3: summary */}
      <div
        style={{
          fontSize: 11,
          color: "#6b6e73",
          lineHeight: 1.55,
          wordBreak: "break-word",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {nodeData.summary}
      </div>

      {/* Footer: connection count + owner */}
      {typeof nodeData.connected === "number" && (
        <div
          style={{
            borderTop: "1px solid #e8e3d8",
            paddingTop: 6,
            fontSize: 10,
            color: "#9ca3af",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
            <circle cx="8" cy="8" r="2.5" />
            <circle cx="2" cy="4" r="1.5" />
            <circle cx="14" cy="4" r="1.5" />
            <circle cx="2" cy="12" r="1.5" />
            <circle cx="14" cy="12" r="1.5" />
            <path d="M6 7 3.5 5M10 7l2.5-2M6 9 3.5 11M10 9l2.5 2" />
          </svg>
          <span>
            {nodeData.connected} connection{nodeData.connected !== 1 ? "s" : ""}
          </span>
          {nodeData.owner && (
            <>
              <span style={{ margin: "0 4px" }}>·</span>
              <span>{nodeData.owner}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
