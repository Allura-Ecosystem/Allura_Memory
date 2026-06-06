"use client"

import {
  ArrowRight,
  CheckCircle,
  Database,
  LayoutGrid,
  Moon,
  Network,
  Plus,
  Send,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react"
import Link from "next/link"
import type { ComponentType, CSSProperties } from "react"

interface AgentShortcut {
  title: string
  description: string
  href: string
  iconBg: string
  arrowColor: string
  icon: ComponentType<{ size?: number; style?: CSSProperties }>
}

const agentShortcuts: AgentShortcut[] = [
  {
    title: "Memory Curator",
    description: "Promote episodic notes into semantic memory.",
    href: "/dashboard/curator",
    iconBg: "#2563eb",
    arrowColor: "#2563eb",
    icon: Network,
  },
  {
    title: "Dream Runner",
    description: "Run consolidation and duplicate detection scans.",
    href: "/dashboard/dreams",
    iconBg: "#ea580c",
    arrowColor: "#ea580c",
    icon: Moon,
  },
  {
    title: "Governance Auditor",
    description: "Check lineage, policy gates, and evidence chains.",
    href: "/dashboard/governance",
    iconBg: "#2563eb",
    arrowColor: "#2563eb",
    icon: Shield,
  },
  {
    title: "Agent Contracts",
    description: "Review agent permissions and boundaries.",
    href: "/dashboard/agents",
    iconBg: "#16a34a",
    arrowColor: "#16a34a",
    icon: Users,
  },
  {
    title: "Kanban Planner",
    description: "Plan and track work across your projects.",
    href: "/dashboard/kanban",
    iconBg: "#d97706",
    arrowColor: "#d97706",
    icon: LayoutGrid,
  },
]

interface DreamRow {
  name: string
  scope: string
  type: string
  status: "Completed" | "Running" | "Pending"
  results: number
  updated: string
}

const recentDreams: DreamRow[] = [
  { name: "Memory Consolidation Run", scope: "allura-system", type: "Consolidation", status: "Completed", results: 42, updated: "2h ago" },
  { name: "Duplicate Detection Sweep", scope: "allura-agents", type: "Detection", status: "Completed", results: 17, updated: "5h ago" },
  { name: "Contradiction Scan v2", scope: "allura-system", type: "Analysis", status: "Completed", results: 8, updated: "1d ago" },
  { name: "Agent Boundary Review", scope: "allura-ops", type: "Governance", status: "Completed", results: 23, updated: "2d ago" },
  { name: "Insight Extraction Pass", scope: "allura-system", type: "Extraction", status: "Completed", results: 61, updated: "3d ago" },
]

function StatusDot({ status }: { status: DreamRow["status"] }) {
  const colors: Record<DreamRow["status"], string> = {
    Completed: "#16a34a",
    Running: "#2563eb",
    Pending: "#d97706",
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: colors[status],
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      {status}
    </span>
  )
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        background: "#f3f4f6",
        color: "#374151",
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  )
}

export default function DreamsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f1e6", padding: "32px 32px 48px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "#ea580c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Moon size={18} style={{ color: "#fff" }} />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.02em" }}>
              Dreams
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            Allura&apos;s background intelligence. Discover. Analyze. Recommend.
          </p>
        </div>
        <button
          type="button"
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            fontSize: 13,
            fontWeight: 500,
            color: "#374151",
            cursor: "pointer",
          }}
        >
          Dream History
        </button>
      </div>

      {/* Prompt area */}
      <div
        style={{
          maxWidth: 680,
          margin: "0 auto 32px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#1a1a1a", margin: "0 0 16px", letterSpacing: "-0.01em" }}>
          What should Allura dream on?
        </h2>
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #e8e3d8",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <textarea
            placeholder="Ask Allura to analyze memories, sessions, projects, or agents..."
            style={{
              width: "100%",
              minHeight: 80,
              padding: "14px 16px 0",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 14,
              color: "#374151",
              background: "transparent",
              fontFamily: "inherit",
            }}
            aria-label="Dream prompt"
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <button
              type="button"
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "#2563eb",
                border: "none",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
              aria-label="Attach"
            >
              <Plus size={13} />
            </button>

            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: 12,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Scope: Allura Memory
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <div style={{ flex: 1 }} />

            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: 12,
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Time Range: Last 7 days
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "#2563eb",
                border: "none",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
              aria-label="Send"
            >
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Agent shortcut cards — horizontal scroll */}
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 8,
          marginBottom: 32,
          scrollbarWidth: "none",
        }}
      >
        {agentShortcuts.map((agent) => {
          const Icon = agent.icon
          return (
            <Link
              key={agent.href}
              href={agent.href}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 14,
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e8e3d8",
                textDecoration: "none",
                minWidth: 180,
                flexShrink: 0,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: agent.iconBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={15} style={{ color: "#fff" }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.2, paddingRight: 20 }}>
                {agent.title}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                {agent.description}
              </div>
              <ArrowRight
                size={14}
                style={{ color: agent.arrowColor, position: "absolute", top: 14, right: 14 }}
              />
            </Link>
          )
        })}
      </div>

      {/* Bottom two-column section */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left: Recent Dreams table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e8e3d8",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Recent Dreams</span>
              <Link href="/dashboard/dreams/history" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}>
                View all →
              </Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                    {["DREAM", "SCOPE", "TYPE", "STATUS", "RESULTS", "UPDATED"].map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#9ca3af",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentDreams.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: i < recentDreams.length - 1 ? "1px solid #f9fafb" : "none",
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <Moon size={13} style={{ color: "#ea580c", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 500, whiteSpace: "nowrap" }}>
                            {row.name}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>{row.scope}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <TypeBadge label={row.type} />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <StatusDot status={row.status} />
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151", textAlign: "right" }}>
                        {row.results}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                        {row.updated}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Dream Insights panel */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e8e3d8",
              padding: 16,
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
              Dream Insights
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Stat 1 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Database size={16} style={{ color: "#2563eb" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Memories analyzed</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>3,842</span>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#dcfce7",
                        color: "#16a34a",
                        fontSize: 11,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <TrendingUp size={10} />
                      18%
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>vs last 7 days</div>
                </div>
              </div>

              {/* Stat 2 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#fff7ed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <TrendingUp size={16} style={{ color: "#ea580c" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Insights generated</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>158</span>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#dcfce7",
                        color: "#16a34a",
                        fontSize: 11,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <TrendingUp size={10} />
                      24%
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>vs last 7 days</div>
                </div>
              </div>

              {/* Stat 3 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "#f0fdf4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <CheckCircle size={16} style={{ color: "#16a34a" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>Promotions recommended</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>27</span>
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#dcfce7",
                        color: "#16a34a",
                        fontSize: 11,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <TrendingUp size={10} />
                      12%
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>vs last 7 days</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
