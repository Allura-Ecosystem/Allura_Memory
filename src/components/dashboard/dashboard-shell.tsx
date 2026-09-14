import Link from "next/link";
import type { AuthUser } from "@/lib/auth/types";
import styles from "./dashboard-shell.module.css";

export const DASHBOARD_ROUTES = [
  { href: "/dashboard", label: "Overview" },
  { href: "/portal", label: "Clients" },
  { href: "/dashboard/mission-control", label: "Mission Control" },
  { href: "/dashboard/kanban", label: "Work Board" },
  { href: "/dashboard/search", label: "Search" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/graph", label: "Graph" },
  { href: "/dashboard/curator", label: "Curator" },
] as const;

/** Shared responsive shell. Tenant, workspace and role remain server-derived. */
export function DashboardShell({ user, title, activePath, children }: {
  user: AuthUser;
  title: string;
  activePath?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#dashboard-content">Skip to content</a>
      <aside aria-label="Dashboard navigation" className={styles.sidebar}>
        <Link href="/dashboard" className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark}>a</span>
          <span>Allura<span className={styles.brandSub}>Memory workspace</span></span>
        </Link>
        <p className={styles.navLabel}>WORKSPACE</p>
        <nav aria-label="Primary navigation">
          <ul className={styles.navList}>
            {DASHBOARD_ROUTES.map((route) => (
              <li key={route.href}>
                <Link href={route.href} aria-current={activePath === route.href ? "page" : undefined}>
                  {route.label}<span aria-hidden="true">{route.href === "/portal" ? "↗" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <dl className={styles.scope}>
          <dt>Tenant</dt><dd>{user.groupId}</dd>
          <dt>Workspace</dt><dd>{user.workspaceId || "Not assigned"}</dd>
          <dt>Role</dt><dd className={styles.role}>{user.role}</dd>
        </dl>
      </aside>
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <span>Allura / Workspace</span>
          <span className={styles.account}>Session role: {user.role}</span>
        </header>
        <main id="dashboard-content" className={styles.main}>
          <div className={styles.pageHeading}><h1>{title}</h1>
            {activePath === "/portal" ? <p>Manage the tools that access your memory.</p> : null}</div>
          {children}
        </main>
      </div>
    </div>
  );
}
