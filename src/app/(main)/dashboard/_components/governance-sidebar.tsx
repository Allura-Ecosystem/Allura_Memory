"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType } from "react"
import { Bot, ClipboardCheck, FileSearch, Home, ListChecks, ScrollText, Search, Settings, Sparkles } from "lucide-react"

import type { AuthUser } from "@/lib/auth/types"
import { DASHBOARD_WORKFLOW_NAV_ITEMS } from "@/lib/dashboard/allura-route"
import { cn } from "@/lib/utils"

const NAV_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Dashboard: Home,
  Memories: Search,
  Insights: Sparkles,
  "Trace logs": ScrollText,
  Provenance: FileSearch,
  Extracted: ListChecks,
  Agents: Bot,
  Approvals: ClipboardCheck,
  Settings,
}

function routePath(href: string): string {
  return href.split(/[?#]/)[0] ?? href
}

function isActive(pathname: string, item: { href: string; label: string }): boolean {
  if (item.label === "Dashboard") {
    return pathname === item.href
  }
  if (["Provenance", "Extracted", "Approvals"].includes(item.label)) {
    return false
  }
  const path = routePath(item.href)
  return pathname === path || pathname.startsWith(`${path}/`)
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
    <aside className="sticky top-0 hidden h-screen w-20 shrink-0 border-r border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-2 py-4 lg:flex lg:flex-col">
      <Link
        href="/dashboard"
        aria-label="Dashboard"
        className="flex justify-center rounded-lg px-2 py-2 text-[var(--dashboard-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
      >
        <span className="flex size-9 items-center justify-center rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] font-[family-name:var(--font-outfit)] text-sm font-semibold">
          AL
        </span>
      </Link>

      <nav className="mt-6 flex-1" aria-label="Thin workflow navigation">
        <ul className="space-y-1">
          {DASHBOARD_WORKFLOW_NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item)
            const Icon = NAV_ICONS[item.label]
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-xl text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none",
                    active
                      ? "bg-[var(--dashboard-surface-muted)] font-semibold text-[var(--dashboard-text-primary)]"
                      : "text-[var(--dashboard-text-secondary)] hover:bg-[var(--dashboard-surface-muted)] hover:text-[var(--dashboard-text-primary)]"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-muted)] p-2" title={`${displayName} • ${role} • ${groupId} • ${email}`}>
        <UserInitial user={user} />
        <span className="sr-only">{displayName} {role} {groupId}</span>
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
          Dashboard
        </Link>
        <span className="rounded-full border border-[var(--dashboard-border)] px-2 py-1 text-[10px] font-medium text-[var(--dashboard-text-secondary)] uppercase">
          {displayName} · {role}
        </span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Dashboard navigation">
        {DASHBOARD_WORKFLOW_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.id}
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
