"use client"

import {
  Clock,
  LayoutGrid,
  MessageSquarePlus,
  Moon,
  Search,
  Settings,
  Shield,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType, CSSProperties } from "react"

function AlluraLogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="10" width="14" height="18" rx="4" fill="#ef4444" opacity="0.9" />
      <rect x="9" y="5" width="14" height="18" rx="4" fill="#f97316" opacity="0.85" />
      <rect x="16" y="10" width="14" height="18" rx="4" fill="#3b82f6" opacity="0.9" />
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>
}

const topNavItems: NavItem[] = [
  { href: "/dashboard", label: "New Chat", icon: MessageSquarePlus },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/scheduled-tasks", label: "Scheduled Tasks", icon: Clock },
]

const mainNavItems: NavItem[] = [
  { href: "/dashboard/governance", label: "Governance", icon: Shield },
  { href: "/dashboard/dreams", label: "Dreams", icon: Moon },
  { href: "/dashboard/kanban", label: "Kanban Board", icon: LayoutGrid },
]

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === "/dashboard"
    }
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

      {/* Top nav section */}
      <nav style={{ padding: "12px 8px 8px" }} aria-label="Primary navigation">
        {topNavItems.map((item) => {
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
              {item.href === "/dashboard" ? (
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={13} className="text-white" style={{ color: "#fff" }} />
                </span>
              ) : (
                <Icon size={16} style={{ flexShrink: 0 }} />
              )}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: "#f0ece0", margin: "4px 16px" }} />

      {/* Main nav section */}
      <nav style={{ padding: "8px 8px" }} aria-label="Features navigation">
        {mainNavItems.map((item) => {
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
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

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
