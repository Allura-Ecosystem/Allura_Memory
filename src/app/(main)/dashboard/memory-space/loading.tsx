import type React from "react"

import { Skeleton } from "@/components/ui/skeleton"

export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28 rounded-lg" />
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-xl rounded-lg" />
        </div>
        <Skeleton className="h-7 w-32 rounded-full" />
      </div>

      <div className="relative min-h-[640px] overflow-hidden rounded-2xl border border-[var(--dashboard-border)] bg-slate-950">
        <div className="flex h-[640px] flex-col items-center justify-center gap-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-80 max-w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-28 rounded-xl sm:w-32" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
