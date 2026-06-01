import type { ReactNode } from "react"
import {
  BarChart3,
  Bell,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  FileSearch,
  FolderKanban,
  GitBranch,
  Link2,
  MoonStar,
  Network,
  PlayCircle,
  Plus,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react"

import {
  createPlaceholderDashboardResult,
  DASHBOARD_ROUTE_GROUPS,
  DASHBOARD_ROUTE_CONTRACTS,
  type DashboardRouteContract,
} from "@/lib/dashboard"

const routeIcons = {
  overview: ShieldCheck,
  "agent-status": Users,
  sessions: PlayCircle,
  "scheduled-tasks": Clock3,
  "memory-inbox": Database,
  "episodic-memory": ScrollText,
  "semantic-memory": Network,
  "knowledge-graph": GitBranch,
  dreams: MoonStar,
  promotions: CheckCircle2,
  "memory-search": Search,
  "memory-analytics": BarChart3,
  "team-ram": Users,
  "managed-agents": Users,
  "agent-registry": FileSearch,
  "agent-contracts": ShieldCheck,
  "agent-skills": FileSearch,
  "audit-log": FileSearch,
  "memory-lineage": GitBranch,
  "gate-violations": ShieldCheck,
  "evidence-chains": Link2,
  "policy-center": ShieldCheck,
  "mcp-services": Workflow,
  "model-routing": Network,
  "api-health": CheckCircle2,
  "background-jobs": Clock3,
  logs: ScrollText,
  "tenant-configuration": Settings,
  "promotion-mode": CheckCircle2,
  "model-endpoints": Network,
  "embedding-settings": Database,
  "users-and-roles": Users,
  notifications: Bell,
  memories: Database,
  curator: MoonStar,
  governance: ShieldCheck,
  graph: GitBranch,
  audit: FileSearch,
  settings: Settings,
}

export function DashboardShell({
  activeRoute,
  children,
}: {
  activeRoute: DashboardRouteContract
  children: ReactNode
}) {
  const result = createPlaceholderDashboardResult(activeRoute)

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar" aria-label="Dashboard routes">
        <div className="dashboard-brand">
          <a className="dashboard-brand-lockup" href="/dashboard" aria-label="Allura Memory dashboard">
            <img alt="Allura" src="/brand/allura-wordmark-runtime.png" />
          </a>
          <button className="dashboard-governance-action" type="button">
            <Plus aria-hidden="true" size={18} />
            <span>New Receipt</span>
          </button>
        </div>
        <nav className="dashboard-nav">
          {DASHBOARD_ROUTE_GROUPS.map((group) => {
            const routes = DASHBOARD_ROUTE_CONTRACTS.filter((route) => route.category === group)

            return (
              <div className="dashboard-nav-group" key={group}>
                <p className="dashboard-nav-heading">{group}</p>
                {routes.map((route) => {
                  const Icon = routeIcons[route.id as keyof typeof routeIcons] ?? CircleDot

                  return (
                    <a
                      aria-current={route.id === activeRoute.id ? "page" : undefined}
                      className="dashboard-nav-link"
                      href={route.path}
                      key={route.id}
                    >
                      <Icon aria-hidden="true" size={20} />
                      <span>{route.title}</span>
                    </a>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="dashboard-account">
          <div aria-hidden="true">
            <img alt="" src="/brand/allura-lettermark-al-figma.png" />
          </div>
          <span>
            <strong>Allura Admin</strong>
            <small>admin@allura.ai</small>
          </span>
        </div>
      </aside>

      <section className="dashboard-main" aria-labelledby="dashboard-route-title">
        <header className="dashboard-route-header">
          <div>
            <p className="dashboard-kicker">{activeRoute.eyebrow}</p>
            <h2 id="dashboard-route-title">
              {activeRoute.title === "Overview" ? "Memory Command Center" : activeRoute.title}
            </h2>
            <p>{activeRoute.purpose}</p>
          </div>
          <dl className="dashboard-scope" aria-label="Dashboard contract status">
            <div>
              <ShieldCheck aria-hidden="true" size={18} />
              <dt>group_id</dt>
              <dd>{result.groupId}</dd>
            </div>
            <div>
              <Link2 aria-hidden="true" size={18} />
              <dt>source</dt>
              <dd>{result.source.endpoint}</dd>
            </div>
            <div>
              <Clock3 aria-hidden="true" size={18} />
              <dt>freshness</dt>
              <dd>{result.freshness.status}</dd>
            </div>
            <div>
              <CheckCircle2 aria-hidden="true" size={18} />
              <dt>degraded</dt>
              <dd>{result.degraded ? "yes" : "no"}</dd>
            </div>
          </dl>
        </header>

        {children}
      </section>
    </main>
  )
}

export function DashboardPlaceholder({ route }: { route: DashboardRouteContract }) {
  const result = createPlaceholderDashboardResult(route)
  const Icon = routeIcons[route.id as keyof typeof routeIcons] ?? CircleDot

  return (
    <DashboardShell activeRoute={route}>
      <section className="dashboard-command-bar" aria-label="Command input">
          <p>
            {route.title === "Overview"
              ? "Inspect governed memory, provenance, policy gates, and evidence receipts for allura-system."
              : route.purpose}
          </p>
        <button type="button" aria-label="Search">
          <Search aria-hidden="true" size={20} />
        </button>
      </section>
      <section className="dashboard-placeholder" aria-label={`${route.title} placeholder contract`}>
        <div>
          <span className="dashboard-feature-icon">
            <Icon aria-hidden="true" size={28} />
          </span>
          <p className="dashboard-kicker">Contract first</p>
          <h3>{route.title} is reachable, but not release-ready.</h3>
          <p>{route.deferred}</p>
        </div>
        <dl className="dashboard-contract-grid">
          <div>
            <Link2 aria-hidden="true" size={18} />
            <dt>Source of truth</dt>
            <dd>{route.source.endpoint}</dd>
          </div>
          <div>
            <FileSearch aria-hidden="true" size={18} />
            <dt>Evidence path</dt>
            <dd>{route.evidencePath}</dd>
          </div>
          <div>
            <Clock3 aria-hidden="true" size={18} />
            <dt>Freshness message</dt>
            <dd>{result.freshness.message}</dd>
          </div>
          <div>
            <BarChart3 aria-hidden="true" size={18} />
            <dt>Warning</dt>
            <dd>{result.warnings[0]}</dd>
          </div>
        </dl>
      </section>
      {route.id === "overview" ? (
        <section className="dashboard-agent-grid" aria-label="Memory and governance work surfaces">
          {DASHBOARD_ROUTE_CONTRACTS.filter((item) =>
            ["memory-inbox", "dreams", "knowledge-graph", "audit-log", "policy-center", "api-health"].includes(item.id)
          ).map((item) => {
            const ItemIcon = routeIcons[item.id as keyof typeof routeIcons] ?? FolderKanban

            return (
              <a className="dashboard-agent-card" href={item.path} key={item.id}>
                <span className="dashboard-feature-icon">
                  <ItemIcon aria-hidden="true" size={24} />
                </span>
                <strong>{item.title}</strong>
                <small>{item.purpose}</small>
              </a>
            )
          })}
        </section>
      ) : null}
    </DashboardShell>
  )
}
