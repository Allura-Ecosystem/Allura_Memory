"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Inbox,
  Network,
  Sparkles,
  FileSearch,
  Bot,
  FolderOpen,
  Zap,
  Settings2,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview",     href: "/dashboard",           icon: LayoutDashboard },
  { label: "Memory Feed",  href: "/dashboard/feed",      icon: Inbox },
  { label: "Graph",        href: "/dashboard/graph",     icon: Network },
  { label: "Insights",     href: "/dashboard/insights",  icon: Sparkles },
  { label: "Evidence",     href: "/dashboard/evidence",  icon: FileSearch },
  { label: "Agents",       href: "/dashboard/agents",    icon: Bot },
  { label: "Projects",     href: "/dashboard/projects",  icon: FolderOpen },
  { label: "Skills",       href: "/dashboard/skills",    icon: Zap },
  { label: "Settings",     href: "/dashboard/settings",  icon: Settings2 },
]

export function Sidebar(): React.ReactElement {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === "/dashboard"
    }
    return pathname.startsWith(href)
  }

  return (
    <aside
      className="flex h-full w-60 flex-col bg-[var(--allura-cream)] px-3 py-4"
      aria-label="Main navigation"
    >
      {/* Logo row */}
      <div className="mb-6 flex items-center gap-2 px-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--allura-blue)] text-xs font-bold text-white"
          aria-hidden="true"
        >
          AL
        </span>
        <span className="text-sm font-semibold text-[var(--dashboard-text-primary)]">
          Allura
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--allura-blue)] text-white"
                  : "text-[var(--allura-gray-500)] hover:bg-[var(--allura-gray-100)] hover:text-[var(--dashboard-text-primary)]",
              ].join(" ")}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="mt-4 flex items-center gap-2.5 px-2 pt-4 border-t border-[var(--allura-gray-200)]">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--allura-gray-200)] text-xs font-medium text-[var(--allura-gray-500)]"
          aria-hidden="true"
        >
          K
        </span>
        <span className="text-sm text-[var(--dashboard-text-secondary)]">Kotler</span>
      </div>
    </aside>
  )
}
