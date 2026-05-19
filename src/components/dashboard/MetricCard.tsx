import { Database, type LucideIcon } from "lucide-react"

import type { Metric } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const toneClasses: Record<Metric["tone"], string> = {
  blue:     `bg-[color-mix(in_srgb,var(--allura-blue)_10%,white)]              text-[var(--allura-blue)]`,
  orange:   `bg-[color-mix(in_srgb,var(--allura-orange)_10%,white)]            text-[var(--allura-orange-on-text)]`,
  green:    `bg-[color-mix(in_srgb,var(--allura-green)_10%,white)]             text-[var(--allura-green)]`,
  charcoal: `bg-[color-mix(in_srgb,var(--allura-charcoal)_10%,white)]            text-[var(--allura-charcoal)]`,
  gold:     `bg-[color-mix(in_srgb,var(--dashboard-evidence)_10%,white)]       text-[var(--allura-charcoal)]`,
  red:      `bg-[color-mix(in_srgb,var(--allura-orange-hover)_10%,white)]      text-[var(--allura-orange-hover)]`,
  muted:    `bg-[var(--allura-muted)]                                        text-[var(--allura-text-2)]`,
}

export function MetricCard({ metric, icon: Icon = Database }: { metric: Metric; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border bg-[var(--dashboard-surface)] p-5 shadow-xs">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--dashboard-text-secondary)]">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
          <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">{metric.description}</p>
        </div>
        <div className={cn("rounded-full p-3", toneClasses[metric.tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
