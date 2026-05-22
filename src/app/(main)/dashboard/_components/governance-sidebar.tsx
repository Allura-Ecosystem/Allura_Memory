"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType } from "react"
import { Activity, Blocks, ClipboardCheck, FileCheck2, HeartPulse, Home, ScrollText, ShieldCheck, Users } from "lucide-react"

import type { AuthUser } from "@/lib/auth/types"
import { cn } from "@/lib/utils"

type SidebarLink = {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  exact?: boolean
}

type SidebarSection = {
  label: string
  links: SidebarLink[]
}

const SECTIONS: SidebarSection[] = [
  {
    label: "Dashboard",
    links: [
      { label: "Overview", href: "/dashboard", icon: Home, exact: true },
      { label: "Queue", href: "/dashboard/insights", icon: ClipboardCheck },
      { label: "Builder", href: "/dashboard/builder", icon: Blocks },
      { label: "Audit Trail", href: "/dashboard/audit", icon: FileCheck2 },
    ],
  },
  {
    label: "Memory",
    links: [{ label: "Memory Space", href: "/dashboard/memory-space", icon: Activity }],
  },
  {
    label: "Governance",
    links: [
      { label: "Agents", href: "/dashboard/agents", icon: Users },
      { label: "Rules / Policy", href: "/dashboard/policy", icon: ShieldCheck },
      { label: "Governance Log", href: "/dashboard/governance-log", icon: ScrollText },
      { label: "Health", href: "/dashboard/health", icon: HeartPulse },
    ],
  },
]

function isActive(pathname: string, item: SidebarLink): boolean {
  if (item.exact) {
    return pathname === item.href
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function UserInitial({ user }: { user: AuthUser | null }) {
  const name = user?.name ?? user?.email ?? "User"
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-cta-primary)] text-sm font-semibold text-white">
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export function GovernanceSidebar({ user }: { user: AuthUser | null }) {
  const pathname = usePathname()
  const displayName = user?.name ?? "User"
  const email = user?.email ?? "admin@allura.ai"
  const role = user?.role ?? "admin"
  const groupId = user?.groupId ?? "allura-system"

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-4 py-5 lg:flex lg:flex-col">
      <Link
        href="/dashboard"
        className="flex items-center gap-3 rounded-lg px-2 py-2 text-[var(--dashboard-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
      >
        <span className="flex size-9 items-center justify-center rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] font-[family-name:var(--font-outfit)] text-sm font-semibold">
          AL
        </span>
        <span className="text-sm font-semibold">Allura</span>
      </Link>

      <nav className="mt-6 flex-1 space-y-6" aria-label="Dashboard navigation">
        {SECTIONS.map((section) => (
          <div key={section.label} className="space-y-2">
            <p className="px-2 text-[10px] font-semibold tracking-wider text-[var(--dashboard-text-muted)] uppercase">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.links.map((item) => {
                const active = isActive(pathname, item)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none",
                        active
                          ? "bg-[var(--dashboard-surface-muted)] font-semibold text-[var(--dashboard-text-primary)]"
                          : "text-[var(--dashboard-text-secondary)] hover:bg-[var(--dashboard-surface-muted)] hover:text-[var(--dashboard-text-primary)]"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-3">
        <div className="flex items-center gap-3">
          <UserInitial user={user} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--dashboard-text-primary)]">{displayName}</p>
            <p className="truncate text-xs text-[var(--dashboard-text-muted)]">{email}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--dashboard-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--dashboard-text-secondary)] uppercase">
            {role}
          </span>
          <span className="rounded-full border border-[var(--dashboard-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--dashboard-text-secondary)]">
            {groupId}
          </span>
        </div>
      </div>
    </aside>
  )
}

export function DashboardMobileNav({ user }: { user: AuthUser | null }) {
  const pathname = usePathname()
  const displayName = user?.name ?? "User"
  const role = user?.role ?? "admin"

  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg text-sm font-semibold text-[var(--dashboard-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] text-xs">
            AL
          </span>
          Allura
        </Link>
        <span className="rounded-full border border-[var(--dashboard-border)] px-2 py-1 text-[10px] font-medium text-[var(--dashboard-text-secondary)] uppercase">
          {displayName} · {role}
        </span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Dashboard navigation">
        {SECTIONS.flatMap((section) => section.links).map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none",
                active
                  ? "border-[var(--dashboard-cta-primary)] bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-text-primary)]"
                  : "border-[var(--dashboard-border)] text-[var(--dashboard-text-secondary)]"
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
