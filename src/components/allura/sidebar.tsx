"use client"

import {
  Activity,
  ArrowRightLeft,
  Clock,
  FileText,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  FolderKanban,
  Play,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, CSSProperties } from "react"

// Canon (Phase 0, AD): the visible product identity must use the approved
// Allura brand asset from public/brand/ — never a drawn or generated
// replacement logo. This restores the approved lettermark.
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
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "Work",
    items: [
      { href: "/dashboard/mission-control", label: "Command Center", icon: LayoutDashboard },
      { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
      { href: "/dashboard/work-board", label: "Work Board", icon: LayoutGrid },
      { href: "/dashboard/runs", label: "Runs", icon: Play },
      { href: "/dashboard/execution", label: "Execution", icon: Activity },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/dashboard/handoffs", label: "Handoffs", icon: ArrowRightLeft },
      { href: "/dashboard/evidence", label: "Evidence", icon: FileText },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/dashboard/search", label: "Search", icon: Search },
      { href: "/dashboard/dreams", label: "Dreams", icon: Sparkles },
      { href: "/dashboard/graph", label: "Knowledge Graph", icon: GitBranch },
    ],
  },
  {
    label: "Crew",
    items: [{ href: "/dashboard/teams", label: "Teams", icon: Users }],
  },
  {
    label: "Operations",
    items: [{ href: "/dashboard/scheduled-tasks", label: "Schedules", icon: Clock }],
  },
  {
    label: "Hosted",
    items: [{ href: "/dashboard/guard", label: "Allura Guard", icon: KeyRound }],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    return pathname.startsWith(href)
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
      {/* Logo */}
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

      {/* Grouped nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }} aria-label="Primary navigation">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && (
              <div style={{ height: 1, background: "#f0ece0", margin: "4px 16px" }} />
            )}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#9ca3af",
                padding: "16px 10px 4px",
              }}
            >
              {group.label}
            </div>
            <div style={{ padding: "0 8px" }}>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: active ? 600 : 400,
                      color: active ? "#2563eb" : "#374151",
                      background: active ? "#eff6ff" : "transparent",
                      marginBottom: 2,
                      transition: "background 0.15s, color 0.15s",
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div style={{ padding: "8px 8px", borderTop: "1px solid #f0ece0" }}>
        <Link
          href="/dashboard/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: isActive("/dashboard/settings") ? 600 : 400,
            color: isActive("/dashboard/settings") ? "#2563eb" : "#374151",
            background: isActive("/dashboard/settings") ? "#eff6ff" : "transparent",
            marginBottom: 4,
          }}
          aria-current={isActive("/dashboard/settings") ? "page" : undefined}
        >
          <Settings size={16} style={{ flexShrink: 0 }} />
          Settings
        </Link>

        {/* User row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#1a1a1a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            AL
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.2 }}>Allura Admin</div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              admin@allura.ai
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </aside>
  )
}
