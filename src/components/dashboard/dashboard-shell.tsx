import {
  Columns3,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
  Network,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import type { AuthUser } from "@/lib/auth/types"

import styles from "./dashboard-shell.module.css"

/**
 * Server-owned Command Center shell shared by the canonical dashboard routes.
 *
 * The shell renders only authority supplied by the server page guard. Route
 * bodies remain responsible for their own data reads and freshness claims.
 */
export const DASHBOARD_ROUTES = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/mission-control", label: "Mission Control", icon: Columns3 },
  { href: "/dashboard/kanban", label: "Work Board", icon: FolderKanban },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/graph", label: "Knowledge Graph", icon: Network },
  { href: "/dashboard/curator", label: "Curator", icon: ShieldCheck },
] as const satisfies readonly { href: string; label: string; icon: LucideIcon }[]

function initials(user: AuthUser): string {
  const source = user.name?.trim() || user.email.split("@")[0] || "A"
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A"
}

export function DashboardShell({
  user,
  title,
  activeHref,
  wide = false,
  showTitle = true,
  children,
}: {
  user: AuthUser
  title: string
  activeHref: (typeof DASHBOARD_ROUTES)[number]["href"]
  wide?: boolean
  showTitle?: boolean
  children: React.ReactNode
}): React.ReactElement {
  const workspace = user.workspaceId ?? "No workspace scope"

  return (
    <div data-dashboard-shell className={styles.shell}>
      <aside data-dashboard-navigation className={styles.navigation} aria-label="Dashboard navigation">
        <Link className={styles.brandLockup} href="/dashboard" aria-label="Allura Memory Command Center">
          <span className={styles.brandMark} aria-hidden="true">
            <Image
              src="/brand/allura-lettermark-al-figma.png"
              alt=""
              width={40}
              height={40}
              priority
            />
          </span>
          <span className={styles.brandCopy}>
            <strong>Allura Memory</strong>
            <small>Command Center</small>
          </span>
        </Link>

        <nav className={styles.primaryNavigation} aria-label="Primary navigation">
          <ul className={styles.navigationList}>
            {DASHBOARD_ROUTES.map((route) => {
              const Icon = route.icon
              const current = route.href === activeHref
              return (
                <li key={route.href} className={styles.navigationItem}>
                  <Link
                    href={route.href}
                    aria-current={current ? "page" : undefined}
                    aria-label={route.label}
                    title={route.label}
                    className={`${styles.navigationLink}${current ? ` ${styles.navigationLinkCurrent}` : ""}`}
                  >
                    <span className={styles.activeRail} aria-hidden="true" />
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                    <span className={styles.navigationLabel}>{route.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{initials(user)}</span>
          <span className={styles.accountCopy}>
            <strong>{user.name ?? user.email}</strong>
            <small>{user.role} · server verified</small>
          </span>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.contextHeader} aria-label="Active server-derived context">
          <dl className={styles.contextList}>
            <div className={styles.organizationContext}>
              <dt>Organization</dt>
              <dd title={user.groupId}>
                <span className={styles.scopeMarker} aria-hidden="true" />
                <span>{user.groupId}</span>
              </dd>
            </div>
            <div className={styles.sourceContext}>
              <dt>Source · workspace</dt>
              <dd title={workspace}>{workspace}</dd>
              <span>Current request scope</span>
            </div>
          </dl>
          <div className={styles.activityContext} aria-label={`Activity context: authenticated ${user.role} request`}>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              <strong>Activity</strong>
              <small>Authenticated request</small>
            </span>
          </div>
        </header>

        <main data-dashboard-content className={`${styles.content}${wide ? ` ${styles.contentWide}` : ""}`}>
          {showTitle ? <h1 className={styles.title}>{title}</h1> : null}
          {children}
        </main>
      </div>
    </div>
  )
}
