import { Loader2 } from "lucide-react"

export function LoadingState({ label = "Loading real Brain data..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-[var(--dashboard-surface)] p-6 text-sm text-[var(--dashboard-text-secondary)]">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  )
}
