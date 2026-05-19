import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createDefaultRegistry, getAdapterByRoute } from "@/lib/adapter-registry/registry"
import type { AdapterDeclaration } from "@/lib/adapter-registry/types"

type RouteShellTone = "command" | "work" | "agent" | "telemetry" | "resource"

interface RouteShellProps {
  route: "/command" | "/work-board" | "/agents" | "/telemetry" | "/resources"
  eyebrow: string
  title: string
  summary: string
  liveState: string
  nextEvidence: string[]
  tone: RouteShellTone
  secondaryHref?: string
  secondaryLabel?: string
}

const toneClasses: Record<RouteShellTone, string> = {
  command: "from-[rgba(21,96,189,0.18)] via-[rgba(244,180,0,0.1)] to-transparent",
  work: "from-[rgba(35,134,54,0.16)] via-[rgba(21,96,189,0.1)] to-transparent",
  agent: "from-[rgba(244,180,0,0.16)] via-[rgba(21,96,189,0.1)] to-transparent",
  telemetry: "from-[rgba(21,96,189,0.16)] via-[rgba(209,73,91,0.1)] to-transparent",
  resource: "from-[rgba(35,134,54,0.14)] via-[rgba(244,180,0,0.1)] to-transparent",
}

function loadAdapter(route: RouteShellProps["route"]): AdapterDeclaration {
  const registry = createDefaultRegistry()
  const adapter = getAdapterByRoute(registry, route)

  if (!adapter) {
    throw new Error(`Mission Control route ${route} is missing an adapter declaration`)
  }

  return adapter
}

function PolicyCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--dashboard-text-muted)]">{title}</p>
        <CardTitle className="text-lg text-[var(--dashboard-text-primary)]">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-[var(--dashboard-text-secondary)]">{detail}</p>
      </CardContent>
    </Card>
  )
}

export function MissionControlRouteShell({
  route,
  eyebrow,
  title,
  summary,
  liveState,
  nextEvidence,
  tone,
  secondaryHref,
  secondaryLabel,
}: RouteShellProps) {
  const adapter = loadAdapter(route)

  return (
    <div className="space-y-6">
      <section className={`rounded-3xl border border-[var(--dashboard-border)] bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${toneClasses[tone]} p-8`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--dashboard-text-muted)]">{eyebrow}</p>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold text-[var(--dashboard-text-primary)]">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--dashboard-text-secondary)]">{summary}</p>
          </div>
          <Badge variant="outline" className="font-mono">
            {route}
          </Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <PolicyCard
          title="System of record"
          value={adapter.system_of_record}
          detail={`Adapter ${adapter.adapter_id} declares the upstream source. This shell does not create a competing data store.`}
        />
        <PolicyCard
          title="Read policy"
          value={`${adapter.read_policy.type} / ${adapter.read_policy.min_role}`}
          detail="Cutover auth validation must prove this policy before replacing the protected dashboard target."
        />
        <PolicyCard
          title="Write policy"
          value={`${adapter.write_policy.type} / ${adapter.write_policy.min_role}`}
          detail={adapter.write_policy.audit ? "Writes require audit evidence." : "This route is read-oriented for the first cutover slice."}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{adapter.degradation_behavior}</Badge>
              <Badge variant="outline">{adapter.evidence_policy} evidence</Badge>
              <Badge variant="outline">{adapter.memory_scope} scope</Badge>
            </div>
            <CardTitle className="text-[var(--dashboard-text-primary)]">Live data status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-[var(--dashboard-text-secondary)]">{liveState}</p>
            {secondaryHref && secondaryLabel ? (
              <Link
                href={secondaryHref}
                className="inline-flex items-center rounded-md border border-[var(--dashboard-border)] px-3 py-2 text-sm font-medium text-[var(--dashboard-text-primary)] transition-colors hover:bg-[var(--dashboard-surface-alt)]"
              >
                {secondaryLabel}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
          <CardHeader>
            <CardTitle className="text-[var(--dashboard-text-primary)]">Next evidence required</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-[var(--dashboard-text-secondary)]">
              {nextEvidence.map((item) => (
                <li key={item} className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface-alt)]/50 p-3">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
