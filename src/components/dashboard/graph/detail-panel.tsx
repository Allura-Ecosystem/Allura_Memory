"use client"

import type { EntityNodeData, EntityType } from "./node-card"

interface Connection {
  id: string
  label: string
  type: EntityType
  relationship: string
}

interface RelatedMemory {
  id: string
  content: string
  status: "promoted" | "raw"
  timestamp?: string
}

export interface SelectedNode {
  id: string
  data: EntityNodeData
  connections?: Connection[]
  relatedMemories?: RelatedMemory[]
  firstSeen?: string
  lastActive?: string
}

interface DetailPanelProps {
  node: SelectedNode | null
  onClose: () => void
}

const TYPE_BG: Record<EntityType, string> = {
  person:  "var(--allura-blue)",
  org:     "var(--allura-orange)",
  insight: "var(--allura-green)",
  memory:  "var(--allura-green)",
  agent:   "var(--allura-type-project)",
  project: "var(--c-gold)",
  event:   "var(--allura-gray-500)",
  system:  "var(--allura-charcoal)",
}

function initials2(label: string): string {
  const parts = label.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
}

function MemoryIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--allura-white)" strokeWidth="2" strokeLinecap="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--allura-gray-500)",
      marginBottom: "10px",
      opacity: .7,
    }}>
      {children}
    </div>
  )
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "11px", color: "var(--allura-gray-500)", marginBottom: "2px", opacity: .7 }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: "var(--allura-charcoal)", fontWeight: 500 }}>
        {value}
      </div>
    </div>
  )
}

export function DetailPanel({ node, onClose }: DetailPanelProps) {
  const panelStyle: React.CSSProperties = {
    width: node ? "340px" : "0px",
    minWidth: node ? "340px" : "0px",
    background: "var(--allura-paper)",
    borderLeft: "1px solid var(--dashboard-border)",
    display: "flex",
    flexDirection: "column",
    overflowY: node ? "auto" : "hidden",
    overflowX: "hidden",
    flexShrink: 0,
    transition: "width .2s, min-width .2s",
    fontFamily: '"IBM Plex Sans", sans-serif',
  }

  if (!node) return <div style={panelStyle} aria-hidden="true" />

  const { data } = node
  const avatarBg = TYPE_BG[data.type] ?? "var(--allura-gray-500)"
  const isMemory = data.type === "memory" || data.type === "insight"

  return (
    <aside style={panelStyle} aria-label="Entity details">
      {/* Header */}
      <div style={{
        padding: "20px",
        borderBottom: "1px solid var(--dashboard-border)",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        flexShrink: 0,
      }}>
        {/* Avatar */}
        <div style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
          fontWeight: 700,
          color: "var(--allura-white)",
          background: avatarBg,
          flexShrink: 0,
        }}>
          {isMemory ? <MemoryIcon size={22} /> : initials2(data.label)}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            {data.label}
          </div>
          {data.description && (
            <div style={{ fontSize: "13px", color: "var(--allura-gray-500)", marginTop: "2px" }}>
              {data.description}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          style={{
            padding: "6px",
            border: "1px solid var(--dashboard-border)",
            borderRadius: "6px",
            background: "transparent",
            cursor: "pointer",
            color: "var(--allura-gray-500)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Details section */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--dashboard-border)" }}>
        <SectionTitle>Details</SectionTitle>
        {data.email && <FieldRow label="Email" value={
          <a href={`mailto:${data.email}`} style={{ color: "var(--allura-blue)", textDecoration: "none" }}>
            {data.email}
          </a>
        } />}
        {data.org && <FieldRow label="Organization" value={data.org} />}
        <FieldRow label="Type" value={data.type.charAt(0).toUpperCase() + data.type.slice(1)} />
        {node.firstSeen && <FieldRow label="First seen" value={node.firstSeen} />}
        {node.lastActive && <FieldRow label="Last active" value={node.lastActive} />}
      </div>

      {/* Connections */}
      {node.connections && node.connections.length > 0 && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--dashboard-border)" }}>
          <SectionTitle>Connections ({node.connections.length})</SectionTitle>
          {node.connections.map((conn) => {
            const connBg = TYPE_BG[conn.type] ?? "var(--allura-gray-500)"
            return (
              <div key={conn.id} style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 0",
                borderBottom: "1px solid rgba(17,24,39,.06)",
              }}>
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "var(--allura-white)",
                  background: connBg,
                  flexShrink: 0,
                }}>
                  {initials2(conn.label)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--allura-charcoal)" }}>
                    {conn.label}
                  </div>
                  <div style={{
                    fontSize: "11px",
                    color: "var(--allura-gray-500)",
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}>
                    {conn.relationship}
                  </div>
                </div>
                <span style={{ color: "var(--allura-gray-500)", flexShrink: 0 }}>
                  <ChevronRightIcon />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Related memories */}
      {node.relatedMemories && node.relatedMemories.length > 0 && (
        <div style={{ padding: "16px 20px" }}>
          <SectionTitle>Related Memories</SectionTitle>
          {node.relatedMemories.map((mem) => (
            <div key={mem.id} style={{
              background: "rgba(17,24,39,.03)",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "8px",
              border: "1px solid rgba(17,24,39,.06)",
            }}>
              <div style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: mem.status === "promoted" ? "var(--allura-green)" : "var(--allura-gray-500)",
                marginBottom: "4px",
              }}>
                {mem.status === "promoted" ? "Insight · Promoted" : "Raw Memory · Episodic"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--allura-charcoal)", lineHeight: 1.5 }}>
                {mem.content}
              </div>
              {mem.timestamp && (
                <div style={{ fontSize: "10px", color: "var(--allura-gray-500)", marginTop: "4px" }}>
                  {mem.timestamp}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty connections state */}
      {(!node.connections || node.connections.length === 0) &&
       (!node.relatedMemories || node.relatedMemories.length === 0) && (
        <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--allura-gray-500)", fontSize: "13px" }}>
          No connections or memories recorded for this entity.
        </div>
      )}
    </aside>
  )
}
