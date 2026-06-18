"use client"

import {
  BookOpen,
  CheckCircle,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, CSSProperties } from "react"

// Canon: use the approved Allura brand asset — never a drawn replacement.
function AlluraMonogram() {
  return (
    <Image
      src="/brand/allura-lettermark-al-figma.png"
      alt="Allura"
      width={38}
      height={38}
      priority
      style={{ borderRadius: 9, flexShrink: 0 }}
    />
  )
}

interface NavItem {
  href: string
  label: string
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
  /** Badge count — shown in orange when > 0 */
  count?: number
}

// Primary nav — 5 items matching the design.
const NAV: NavItem[] = [
  { href: "/dashboard/overview",        label: "Overview",        icon: LayoutDashboard },
  { href: "/dashboard/search",          label: "Memory",          icon: BookOpen },
  { href: "/dashboard/knowledge-graph", label: "Knowledge Graph", icon: GitBranch },
  { href: "/dashboard/agents",          label: "Agents",          icon: Users },
  { href: "/dashboard/approvals",       label: "Approvals",       icon: CheckCircle },
]

// Footer nav — admin items.
const FOOTER: NavItem[] = [
  { href: "/dashboard/governance", label: "Governance",   icon: ShieldCheck },
  { href: "/dashboard/guard",      label: "Allura Guard", icon: KeyRound },
  { href: "/dashboard/settings",   label: "Settings",     icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/")
  }

  function navRow(item: NavItem) {
    const Icon = item.icon
    const active = isActive(item.href)
    const hasCount = typeof item.count === "number" && item.count > 0

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          height: 42,
          padding: "0 12px",
          borderRadius: 10,
          textDecoration: "none",
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          color: active ? "var(--c-blue)" : "var(--c-ink)",
          background: active ? "#f1ece0" : "transparent",
          transition: "background 0.15s",
          boxSizing: "border-box",
          fontFamily: "var(--sans)",
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "#f1ece0"
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"
        }}
      >
        {/* Orange left accent bar when active */}
        {active && (
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 9,
              bottom: 9,
              width: 3,
              borderRadius: 3,
              background: "var(--c-orange)",
            }}
            aria-hidden="true"
          />
        )}

        <Icon
          size={16}
          style={{
            flexShrink: 0,
            color: active ? "var(--c-blue)" : "var(--c-muted)",
          }}
        />
        <span style={{ flex: 1 }}>{item.label}</span>

        {hasCount && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--c-orange)",
              background: "var(--c-orange-soft)",
              borderRadius: 20,
              padding: "1px 8px",
            }}
          >
            {item.count}
          </span>
        )}
      </Link>
    )
  }

  function footerRow(item: NavItem) {
    const Icon = item.icon
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          height: 40,
          padding: "0 12px",
          borderRadius: 10,
          textDecoration: "none",
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          color: active ? "var(--c-blue)" : "var(--c-muted)",
          background: active ? "#f1ece0" : "transparent",
          transition: "background 0.15s",
          boxSizing: "border-box",
          fontFamily: "var(--sans)",
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "#f1ece0"
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"
        }}
      >
        <Icon size={16} style={{ flexShrink: 0, color: active ? "var(--c-blue)" : "var(--c-muted)" }} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <aside
      style={{
        width: 248,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--c-card)",
        borderRight: "1px solid var(--c-border)",
      }}
      aria-label="Main navigation"
    >
      {/* Brand header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "20px 18px 18px",
        }}
      >
        <AlluraMonogram />
        <div style={{ lineHeight: 1.1 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", display: "block", color: "var(--c-ink)" }}>
            Allura Memory
          </span>
          <span style={{ fontSize: 11, color: "var(--c-muted)", fontWeight: 500 }}>
            Command Center
          </span>
        </div>
      </div>

      {/* Primary nav */}
      <nav
        style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 12px" }}
        aria-label="Primary navigation"
      >
        {NAV.map(navRow)}
      </nav>

      {/* Footer nav + user row */}
      <div
        style={{
          marginTop: "auto",
          padding: 12,
          borderTop: "1px solid var(--c-border-soft)",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {FOOTER.map(footerRow)}

        {/* User row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 8px 4px",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--c-blue)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            RM
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--c-ink)" }}>Rosa Marín</span>
            <span style={{ fontSize: 11, color: "var(--c-muted)" }}>Curator · Admin</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
