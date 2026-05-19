import type { SystemStatus } from "@/lib/dashboard/types"
import { EmptyState } from "./EmptyState"
import { StatusPill } from "./StatusPill"

export function SystemStatusCard({ status }: { status: SystemStatus }) {
  return (
    <section className="rounded-xl border bg-[var(--dashboard-surface)]">
      <div className="flex items-center justify-between border-b p-5">
        <h2 className="font-semibold">System Status</h2>
        <StatusPill value={status.status} />
      </div>
      <div className="divide-y">
        {status.components.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No component health returned" description="The health endpoint did not return component-level data." />
          </div>
        ) : (
          status.components.map((component) => (
            <div key={component.name} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{component.name}</p>
                <p className="text-xs text-[var(--dashboard-text-secondary)]">{component.message ?? "No message"}</p>
              </div>
              <StatusPill value={component.status} />
            </div>
          ))
        )}
      </div>
    </section>
  )
}
