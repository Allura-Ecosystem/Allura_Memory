"use client"

import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  Brain,
  Clock,
  Cloud,
  Cpu,
  Database,
  FileText,
  GitBranch,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Link2,
  List,
  Logs,
  Network,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  Users,
  Workflow,
  Zap,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, CSSProperties } from "react"

// Canon: use the approved Allura brand asset — never a drawn replacement.
function AlluraLogoIcon() {
  return (
    <Image
      src="/brand/allura-lettermark-al-figma.png"
      alt="Allura"
      width={32}
      height={32}
      priority
      style={{ borderRadius: 6 }}
    />
  )
}

interface NavItem {
  href: string
  label: string
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
  soon?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Routes that are not yet built (hit the [...planned] catch-all)
const SOON_ROUTES = new Set([
  "/dashboard/memory-inbox",
  "/dashboard/episodic",
  "/dashboard/semantic",
  "/dashboard/analytics",
  "/dashboard/agent-contracts",
  "/dashboard/agent-skills",
  "/dashboard/audit-log",
  "/dashboard/lineage",
  "/dashboard/gate-violations",
  "/dashboard/policy-center",
  "/dashboard/mcp-services",
  "/dashboard/model-routing",
  "/dashboard/health",
  "/dashboard/logs",
])

// BRIEF taxonomy: Mission Control / Memory / Agents / Governance / Operations / Settings
const navGroups: NavGroup[] = [
  {
    label: "Mission Control",
    items: [
      { href: "/dashboard/overview",         label: "Overview",        icon: LayoutDashboard },
      { href: "/dashboard/mission-control",  label: "Agent Status",    icon: Activity },
      { href: "/dashboard/execution",        label: "Sessions",        icon: Workflow },
      { href: "/dashboard/scheduled-tasks",  label: "Scheduled Tasks", icon: Clock },
    ],
  },
  {
    label: "Memory",
    items: [
      { href: "/dashboard/memory-inbox",     label: "Memory Inbox",    icon: Inbox },
      { href: "/dashboard/episodic",         label: "Episodic",        icon: Database },
      { href: "/dashboard/semantic",         label: "Semantic",        icon: Brain },
      { href: "/dashboard/knowledge-graph",  label: "Knowledge Graph", icon: GitBranch },
      { href: "/dashboard/dreams",           label: "Dreams",          icon: Sparkles },
      { href: "/dashboard/approvals",        label: "Promotions",      icon: ShieldCheck },
      { href: "/dashboard/search",           label: "Memory Search",   icon: Search },
      { href: "/dashboard/analytics",        label: "Memory Analytics",icon: BarChart2 },
    ],
  },
  {
    label: "Agents",
    items: [
      { href: "/dashboard/teams",            label: "Team RAM",        icon: Users },
      { href: "/dashboard/agents",           label: "Agent Registry",  icon: List },
      { href: "/dashboard/agent-contracts",  label: "Agent Contracts", icon: FileText },
      { href: "/dashboard/agent-skills",     label: "Agent Skills",    icon: Zap },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/dashboard/audit-log",        label: "Audit Log",       icon: BookOpen },
      { href: "/dashboard/lineage",          label: "Memory Lineage",  icon: Link2 },
      { href: "/dashboard/gate-violations",  label: "Gate Violations", icon: AlertTriangle },
      { href: "/dashboard/evidence",         label: "Evidence Chains", icon: Shield },
      { href: "/dashboard/policy-center",    label: "Policy Center",   icon: Tag },
      { href: "/dashboard/guard",            label: "Allura Guard",    icon: KeyRound },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/mcp-services",     label: "MCP Services",    icon: Cloud },
      { href: "/dashboard/model-routing",    label: "Model Routing",   icon: Cpu },
      { href: "/dashboard/health",           label: "API Health",      icon: Network },
      { href: "/dashboard/runs",             label: "Background Jobs", icon: Sliders },
      { href: "/dashboard/logs",             label: "Logs",            icon: Logs },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <aside
      style={{
        width: 240,
        minHeight: "100vh",
        height: "100%",
        background: "#ffffff",
        borderRight: "1px solid #e8e3d8",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "sticky",
        top: 0,
      }}
      aria-label="Main navigation"
    >
      {/* Logo header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "20px 16px 16px",
          borderBottom: "1px solid #f0ece0",
        }}
      >
        <AlluraLogoIcon />
        <div style={{ lineHeight: 1.1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", letterSpacing: "-0.01em" }}>Allura</div>
          <div style={{ fontWeight: 400, fontSize: 12, color: "#6b7280" }}>Memory</div>
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }} aria-label="Primary navigation">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && (
              <div style={{ height: 1, background: "#f0ece0", margin: "4px 16px" }} />
            )}
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                padding: "12px 18px 4px",
              }}
            >
              {group.label}
            </div>
            <div style={{ padding: "0 8px" }}>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                const soon = SOON_ROUTES.has(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "7px 10px",
                      borderRadius: 7,
                      textDecoration: "none",
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 400,
                      color: active ? "#2563eb" : soon ? "#9ca3af" : "#374151",
                      background: active ? "#eff6ff" : "transparent",
                      marginBottom: 1,
                      transition: "background 0.12s, color 0.12s",
                      opacity: soon ? 0.7 : 1,
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={15} style={{ flexShrink: 0, opacity: active ? 1 : soon ? 0.45 : 0.65 }} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {soon && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "#9ca3af",
                          background: "#f0ece0",
                          borderRadius: 999,
                          padding: "2px 6px",
                          lineHeight: 1.4,
                          flexShrink: 0,
                        }}
                      >
                        soon
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings + user footer */}
      <div style={{ padding: "8px 8px", borderTop: "1px solid #f0ece0" }}>
        <Link
          href="/dashboard/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "7px 10px",
            borderRadius: 7,
            textDecoration: "none",
            fontSize: 13.5,
            fontWeight: isActive("/dashboard/settings") ? 600 : 400,
            color: isActive("/dashboard/settings") ? "#2563eb" : "#374151",
            background: isActive("/dashboard/settings") ? "#eff6ff" : "transparent",
            marginBottom: 4,
          }}
          aria-current={isActive("/dashboard/settings") ? "page" : undefined}
        >
          <Settings size={15} style={{ flexShrink: 0, opacity: isActive("/dashboard/settings") ? 1 : 0.65 }} />
          Settings
        </Link>

        {/* User row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 7,
            cursor: "default",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "#1a1a1a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
              letterSpacing: "0.02em",
            }}
            aria-hidden="true"
          >
            AL
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.2 }}>Allura Admin</div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              allura-system
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
