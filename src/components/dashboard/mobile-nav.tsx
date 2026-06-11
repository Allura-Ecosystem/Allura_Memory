"use client"

import { LayoutGrid, MessageSquarePlus, Network, Search, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface MobileNavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number }>
}

const NAV_ITEMS: MobileNavItem[] = [
  { href: "/dashboard", label: "Chat", icon: MessageSquarePlus },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/graph", label: "Graph", icon: Network },
  { href: "/dashboard/governance", label: "Governance", icon: LayoutGrid },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className="mobile-nav-item"
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
