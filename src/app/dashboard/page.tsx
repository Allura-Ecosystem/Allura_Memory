import {
  CheckCircle2,
  FileSearch,
  GitBranch,
  ShieldAlert,
  ShieldCheck,
  Send,
} from "lucide-react"

import { DashboardShell } from "@/components/dashboard/shell"
import { getDashboardRouteContract, probeDashboardEndpoint } from "@/lib/dashboard"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const route = getDashboardRouteContract("overview")
  const probes = await Promise.all([
    probeDashboardEndpoint({
      endpoint: "/api/health",
      label: "System Health",
      source: route.source,
    }),
    probeDashboardEndpoint({
      endpoint: "/api/memory?group_id=allura-system&limit=5",
      label: "Memory API",
      source: getDashboardRouteContract("memories").source,
    }),
    probeDashboardEndpoint({
      endpoint: "/api/kanban",
      label: "Kanban Board",
      source: {
        label: "kanban-api",
        endpoint: "/api/kanban",
        trustLevel: "authoritative",
      },
    }),
  ])

  return (
    <DashboardShell activeRoute={route}>
      <section className="dashboard-command-bar" aria-label="Command input">
        <p>Trace memory, policy, lineage, and evidence for the active allura-system scope.</p>
        <button type="button" aria-label="Run governed inspection">
          <Send aria-hidden="true" size={18} />
        </button>
      </section>

      <section className="dashboard-agent-grid" aria-label="Primary memory and governance surfaces">
        <a className="dashboard-agent-card" data-signal="memory" href="/dashboard/memories">
          <FileSearch aria-hidden="true" size={24} />
          <strong>Memory Curator</strong>
          <small>Search memory records, source receipts, confidence, and provenance.</small>
        </a>
        <a className="dashboard-agent-card" data-signal="approval" href="/dashboard/curator">
          <CheckCircle2 aria-hidden="true" size={24} />
          <strong>Promotion Review</strong>
          <small>Review proposed knowledge, approvals, and required audit receipts.</small>
        </a>
        <a className="dashboard-agent-card" data-signal="governance" href="/dashboard/governance">
          <ShieldCheck aria-hidden="true" size={24} />
          <strong>Governance Auditor</strong>
          <small>Check policy gates, degraded contracts, evidence chains, and role boundaries.</small>
        </a>
        <a className="dashboard-agent-card" data-signal="lineage" href="/dashboard/graph">
          <GitBranch aria-hidden="true" size={24} />
          <strong>Lineage Graph</strong>
          <small>Follow promoted semantic memory relationships back to evidence.</small>
        </a>
        <a className="dashboard-agent-card" data-signal="attention" href="/dashboard/policy-center">
          <ShieldAlert aria-hidden="true" size={24} />
          <strong>Policy Center</strong>
          <small>Expose missing Captain policies as degraded contracts until APIs exist.</small>
        </a>
        <a className="dashboard-agent-card" data-signal="system" href="/dashboard/api-health">
          <ShieldCheck aria-hidden="true" size={24} />
          <strong>Runtime Evidence</strong>
          <small>Check live health probes without turning reachability into false approval.</small>
        </a>
      </section>

      <section className="dashboard-live-grid" aria-label="Live API connection probes">
        {probes.map((probe) => (
          <article className="dashboard-live-card" data-degraded={probe.degraded} key={probe.endpoint}>
            <div>
              <p className="dashboard-kicker">{probe.source.label}</p>
              <h3>{probe.label}</h3>
            </div>
            <dl>
              <div>
                <dt>endpoint</dt>
                <dd>{probe.endpoint}</dd>
              </div>
              <div>
                <dt>status</dt>
                <dd>{probe.statusCode ?? "unreachable"}</dd>
              </div>
              <div>
                <dt>freshness</dt>
                <dd>{probe.freshness}</dd>
              </div>
              <div>
                <dt>state</dt>
                <dd>{probe.degraded ? "degraded" : "connected"}</dd>
              </div>
            </dl>
            <p>{probe.message}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  )
}
