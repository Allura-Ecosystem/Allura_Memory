"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType } from "react"
import {
  Activity,
  Bot,
  CheckSquare,
  ClipboardCheck,
  FileSearch,
  FolderOpen,
  GitBranch,
  Home,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react"

import type { AuthUser } from "@/lib/auth/types"
import { DASHBOARD_WORKFLOW_NAV_ITEMS } from "@/lib/dashboard/allura-route"
import { cn } from "@/lib/utils"

const NAV_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Overview: Home,
  Memories: Activity,
  Graph: GitBranch,
  Insights: Sparkles,
  Evidence: FileSearch,
  Review: ClipboardCheck,
  Agents: Bot,
  Projects: FolderOpen,
  Skills: Wrench,
  Settings,
}

function routePath(href: string): string {
  return href.split(/[?#]/)[0] ?? href
}

function isActive(pathname: string, item: { href: string; label: string }): boolean {
  if (item.label === "Overview") {
    return pathname === item.href
  }
  const path = routePath(item.href)
  return pathname === path || pathname.startsWith(`${path}/`)
}

function UserInitial({ user }: { user: AuthUser | null }) {
  const name = user?.name ?? user?.email ?? "User"
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--dashboard-cta-primary)] text-xs font-semibold text-white">
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
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--dashboard-border)] bg-white px-3 py-4 lg:flex">
      {/* Logo row */}
      <Link
        href="/dashboard"
        aria-label="Dashboard home"
        className="flex items-center gap-2.5 rounded-lg px-2 py-2 mb-5 focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#1B2A4A] text-xs font-bold text-white">
          AL
        </span>
        <span className="font-semibold text-sm text-[var(--dashboard-text-primary)]">Allura</span>
      </Link>

      {/* Nav items */}
      <nav className="flex-1" aria-label="Dashboard navigation">
        <ul className="space-y-0.5">
          {DASHBOARD_WORKFLOW_NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item)
            const Icon = NAV_ICONS[item.label] ?? CheckSquare
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none",
                    active
                      ? "bg-[var(--dashboard-cta-primary)] text-white font-medium"
                      : "text-[var(--dashboard-text-secondary)] hover:bg-[var(--dashboard-surface-muted)] hover:text-[var(--dashboard-text-primary)]"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User row */}
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--dashboard-surface-muted)] transition-colors"
        title={`${displayName} • ${role} • ${groupId} • ${email}`}
      >
        <UserInitial user={user} />
        <span className="truncate text-sm text-[var(--dashboard-text-primary)] font-medium">{displayName}</span>
      </div>
    </aside>
  )
}

export function DashboardMobileNav({ user }: { user: AuthUser | null }) {
  const pathname = usePathname()
  const displayName = user?.name ?? "User"
  const role = user?.role ?? "admin"

  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--dashboard-border)] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg text-sm font-semibold text-[var(--dashboard-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--dashboard-cta-primary)]/30 focus-visible:outline-none"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#1B2A4A] text-xs font-bold text-white">
            AL
          </span>
          Allura
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
                  ? "border-[var(--dashboard-cta-primary)] bg-[var(--dashboard-cta-primary)] text-white"
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
