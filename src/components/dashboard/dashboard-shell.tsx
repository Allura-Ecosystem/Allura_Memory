import Link from "next/link"

import type { AuthUser } from "@/lib/auth/types"

import styles from "./dashboard-shell.module.css"

/**
 * Thin server-owned dashboard shell shared by the six canonical live surfaces.
 *
 * It renders only server-derived scope (tenant/workspace/role) and a single
 * navigation list. It never reads browser-supplied authority and never fetches
 * data on its own; each route adapter supplies its own server-owned read.
 */

export const DASHBOARD_ROUTES = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/mission-control", label: "Mission Control" },
  { href: "/dashboard/kanban", label: "Work Board" },
  { href: "/dashboard/search", label: "Search" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/graph", label: "Graph" },
  { href: "/dashboard/curator", label: "Curator" },
] as const

export function DashboardShell({
  user,
  title,
  wide = false,
  children,
}: {
  user: AuthUser
  title: string
  wide?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div data-dashboard-shell className={`${styles.shell}${wide ? ` ${styles.shellWide}` : ""}`}>
      <aside
        data-dashboard-navigation
        className={`${styles.navigation}${wide ? ` ${styles.navigationWide}` : ""}`}
        aria-label="Dashboard navigation"
      >
        <p className={styles.brand}>
          Allura Memory
        </p>
        <nav aria-label="Primary navigation">
          <ul className={styles.navigationList}>
            {DASHBOARD_ROUTES.map((route) => (
              <li key={route.href} className={styles.navigationItem}>
                <Link
                  href={route.href}
                  className={styles.navigationLink}
                >
                  {route.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <dl className={styles.scope}>
          <dt>Tenant</dt>
          <dd>{user.groupId}</dd>
          <dt>Workspace</dt>
          <dd>{user.workspaceId}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
        </dl>
      </aside>
      <main data-dashboard-content className={`${styles.content}${wide ? ` ${styles.contentWide}` : ""}`}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </main>
    </div>
  )
}
