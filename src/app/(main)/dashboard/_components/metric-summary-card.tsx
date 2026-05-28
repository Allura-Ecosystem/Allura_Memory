import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getToneBorderClass, getToneIconClass, type DashboardTone } from "@/lib/dashboard/tokens"
import { cn } from "@/lib/utils"

export type MetricTone = DashboardTone

interface MetricSummaryCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone: MetricTone
  variant?: "stat" | "metric"
}

export function MetricSummaryCard({ label, value, icon: Icon, tone, variant = "stat" }: MetricSummaryCardProps) {
  if (variant === "metric") {
    const toneClass = getToneIconClass(tone)
    return (
      <Card className="border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-[var(--dashboard-text-muted)]">{label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2">
            <Icon className={cn("size-4", toneClass)} />
            <span className={cn("text-2xl font-bold", toneClass)}>{value}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "border-[var(--dashboard-border)] border-l-4 bg-[var(--dashboard-surface)]",
        getToneBorderClass(tone)
      )}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className={cn("size-5", getToneIconClass(tone))} />
        <div>
          <p className="text-xs text-[var(--dashboard-text-muted)]">{label}</p>
          <p className="text-xl font-bold text-[var(--dashboard-text-primary)]">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
