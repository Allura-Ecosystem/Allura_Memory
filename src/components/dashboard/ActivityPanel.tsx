import { Clock } from "lucide-react"

import type { ActivityItem } from "@/lib/dashboard/types"
import { EmptyState } from "./EmptyState"

export function ActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-xl border bg-[var(--dashboard-surface)]">
      <div className="border-b p-5">
        <h2 className="font-semibold">Recent Activity</h2>
      </div>
      <div className="divide-y">
        {items.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No audit activity" description="The Brain returned no recent activity for this tenant." />
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex gap-3 p-4">
              <Clock className="mt-0.5 size-4 text-[var(--dashboard-text-secondary)]" />
              <div>
                <p className="text-sm font-medium capitalize">{item.title}</p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">{item.description}</p>
                <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">{new Date(item.timestamp).toLocaleString()}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
