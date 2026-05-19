import { GitBranch } from "lucide-react"

import type { GraphEdge, GraphNode } from "@/lib/dashboard/types"
import { EmptyState } from "./EmptyState"

interface GraphSummaryProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  totalEdges?: number
  selectedNodeId?: string | null
  onNodeClick?: (nodeId: string | null) => void
}

export function GraphSummary({ nodes, edges, totalEdges, selectedNodeId, onNodeClick }: GraphSummaryProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="relative min-h-[520px] overflow-hidden rounded-xl border bg-[var(--dashboard-surface-alt)] p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--allura-clarity-blue)/8%,transparent_55%)]" />
        {nodes.length === 0 ? (
          <div className="relative flex h-[460px] items-center justify-center">
            <EmptyState title="No graph relationships returned" description="Neo4j returned no tenant-scoped graph nodes. The UI will not invent relationships." />
          </div>
        ) : (
          <div className="relative grid h-full place-items-center">
            <div className="flex max-w-3xl flex-wrap items-center justify-center gap-4">
              {nodes.slice(0, 24).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onNodeClick?.(selectedNodeId === node.id ? null : node.id)}
                  className={`rounded-xl border px-4 py-3 text-center shadow-xs transition-colors ${
                    selectedNodeId === node.id
                      ? "border-[var(--dashboard-accent)] bg-[var(--dashboard-accent)]/10 ring-2 ring-[var(--dashboard-accent)]/30"
                      : "bg-[var(--dashboard-surface)] hover:bg-[var(--dashboard-surface-muted)]"
                  }`}
                >
                  <GitBranch className="mx-auto mb-1 size-4 text-[var(--tone-blue-text)]" />
                  <p className="text-sm font-medium">{node.label}</p>
                  <p className="text-xs text-[var(--dashboard-text-secondary)]">{node.type}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <aside className="rounded-xl border bg-[var(--dashboard-surface)] p-5">
        <h2 className="font-semibold">Graph Truth</h2>
        <p className="mt-1 text-sm text-[var(--dashboard-text-secondary)]">
          {nodes.length} visible nodes &middot; {edges.length} visible edges
        </p>
        <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
          Total tenant relationships: {totalEdges ?? "Unavailable"}
        </p>
        <div className="mt-4 space-y-2">
          {edges.slice(0, 12).map((edge) => (
            <div key={edge.id} className="rounded-lg border p-2 text-xs">
              <p className="font-medium">{edge.label}</p>
              <p className="truncate text-[var(--dashboard-text-secondary)]">
                {edge.source} → {edge.target}
              </p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
