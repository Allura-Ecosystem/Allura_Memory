"use client"

import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

export type EntityType = "agent" | "project" | "insight" | "memory" | "event" | "system" | "person" | "org"

export interface EntityNodeData {
  label: string
  type: EntityType
  description?: string
  email?: string
  org?: string
  connectionCount?: number
  tags?: string[]
  [key: string]: unknown
}

export type EntityNode = Node<EntityNodeData, "entity">

const TYPE_CONFIG: Record<EntityType, { bg: string; textColor: string; initials: (label: string) => string }> = {
  person:  { bg: "var(--allura-blue)",   textColor: "#fff", initials: initials2 },
  org:     { bg: "var(--allura-orange)", textColor: "#fff", initials: initials2 },
  insight: { bg: "var(--allura-green)",  textColor: "#fff", initials: () => "" },
  memory:  { bg: "var(--allura-green)",  textColor: "#fff", initials: () => "" },
  agent:   { bg: "#7C3AED",             textColor: "#fff", initials: initials2 },
  project: { bg: "var(--allura-gold)",   textColor: "#fff", initials: initials2 },
  event:   { bg: "var(--allura-gray-500)", textColor: "#fff", initials: initials2 },
  system:  { bg: "var(--allura-charcoal)", textColor: "#fff", initials: initials2 },
}

const TYPE_BADGE: Record<EntityType, { label: string; bg: string; color: string }> = {
  person:  { label: "Person",   bg: "rgba(29,78,216,.08)",   color: "var(--allura-blue)" },
  org:     { label: "Org",      bg: "rgba(255,90,46,.08)",   color: "var(--allura-orange)" },
  insight: { label: "Insight",  bg: "rgba(17,148,90,.08)",   color: "var(--allura-green)" },
  memory:  { label: "Memory",   bg: "rgba(17,148,90,.08)",   color: "var(--allura-green)" },
  agent:   { label: "Agent",    bg: "rgba(124,58,237,.08)",  color: "#7C3AED" },
  project: { label: "Project",  bg: "rgba(217,154,23,.12)",  color: "var(--allura-gold)" },
  event:   { label: "Event",    bg: "rgba(102,112,133,.08)", color: "var(--allura-gray-500)" },
  system:  { label: "System",   bg: "rgba(17,24,39,.08)",    color: "var(--allura-charcoal)" },
}

function initials2(label: string): string {
  const parts = label.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
}

function MemoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function ConnectionsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export const NodeCard = memo(function NodeCard({ data, selected }: NodeProps<EntityNode>) {
  const cfg = TYPE_CONFIG[data.type] ?? TYPE_CONFIG.event
  const badge = TYPE_BADGE[data.type] ?? TYPE_BADGE.event
  const isMemory = data.type === "memory" || data.type === "insight"

  const cardStyle: React.CSSProperties = {
    background: "var(--allura-paper)",
    border: selected
      ? "1.5px solid var(--allura-blue)"
      : "1.5px solid var(--dashboard-border)",
    borderRadius: "12px",
    padding: "14px 16px",
    minWidth: "200px",
    maxWidth: "260px",
    cursor: "grab",
    userSelect: "none",
    transition: "box-shadow .2s, border-color .2s, transform .2s",
    boxShadow: selected
      ? "0 0 0 3px rgba(29,78,216,.15), 0 4px 16px rgba(0,0,0,.1)"
      : "0 1px 3px rgba(0,0,0,.06)",
    fontFamily: '"IBM Plex Sans", sans-serif',
  }

  const avatarStyle: React.CSSProperties = {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: 700,
    color: cfg.textColor,
    background: cfg.bg,
    flexShrink: 0,
  }

  return (
    <div style={cardStyle} className="graph-node-card">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <div style={avatarStyle}>
          {isMemory ? <MemoryIcon /> : cfg.initials(data.label)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--allura-charcoal)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "170px",
          }}>
            {data.label}
          </div>
          {data.description && (
            <div style={{
              fontSize: "11px",
              color: "var(--allura-gray-500)",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "170px",
            }}>
              {data.description}
            </div>
          )}
        </div>
      </div>

      {/* Meta rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {data.email && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--allura-gray-500)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: .6 }}>
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
              {data.email}
            </span>
          </div>
        )}
        {data.org && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--allura-gray-500)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: .6 }}>
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {data.org}
          </div>
        )}
      </div>

      {/* Type badge */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" }}>
        <span style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          padding: "2px 8px",
          borderRadius: "999px",
          background: badge.bg,
          color: badge.color,
        }}>
          {badge.label}
        </span>
        {data.tags?.map((tag) => (
          <span key={tag} style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: "999px",
            background: "rgba(17,24,39,.06)",
            color: "var(--allura-gray-500)",
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Connection count */}
      {data.connectionCount !== undefined && (
        <div style={{
          marginTop: "8px",
          paddingTop: "8px",
          borderTop: "1px solid rgba(17,24,39,.08)",
          fontSize: "11px",
          color: "var(--allura-gray-500)",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}>
          <ConnectionsIcon />
          <strong style={{ color: "var(--allura-charcoal)" }}>{data.connectionCount}</strong>
          {" "}connections
        </div>
      )}
    </div>
  )
})
