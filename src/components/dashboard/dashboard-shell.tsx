import Link from "next/link"

import type { AuthUser } from "@/lib/auth/types"

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
  children,
}: {
  user: AuthUser
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        aria-label="Dashboard navigation"
        style={{ width: 220, borderRight: "1px solid #e5e7eb", padding: 16, flexShrink: 0 }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", margin: "0 0 8px" }}>
          Allura Memory
        </p>
        <nav aria-label="Primary navigation">
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {DASHBOARD_ROUTES.map((route) => (
              <li key={route.href} style={{ marginBottom: 4 }}>
                <Link
                  href={route.href}
                  style={{ display: "block", padding: "6px 8px", borderRadius: 6, color: "#111827", textDecoration: "none", fontSize: 14 }}
                >
                  {route.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <dl style={{ marginTop: 24, fontSize: 12, color: "#6b7280" }}>
          <dt style={{ fontWeight: 600 }}>Tenant</dt>
          <dd style={{ margin: "0 0 8px" }}>{user.groupId}</dd>
          <dt style={{ fontWeight: 600 }}>Workspace</dt>
          <dd style={{ margin: "0 0 8px" }}>{user.workspaceId}</dd>
          <dt style={{ fontWeight: 600 }}>Role</dt>
          <dd style={{ margin: 0 }}>{user.role}</dd>
        </dl>
      </aside>
      <main style={{ flex: 1, padding: 32, maxWidth: 960 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>{title}</h1>
        {children}
      </main>
    </div>
  )
}
