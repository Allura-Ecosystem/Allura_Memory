"use client"

import type { MemoryNode } from "@/lib/memory-graph/types"

interface DetailPanelProps {
  node: MemoryNode | null
  onClose: () => void
}

export function DetailPanel({ node, onClose }: DetailPanelProps) {
  if (!node) return null

  return (
    <aside className="absolute top-0 right-0 z-30 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
            Memory detail
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{node.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
          aria-label="Close memory detail panel"
        >
          Close
        </button>
      </div>

      <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
        {node.preview}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <DetailTerm label="Type" value={node.type} />
        <DetailTerm label="Source" value={node.source} />
        <DetailTerm label="Score" value={node.score.toFixed(2)} />
        <DetailTerm label="Agent" value={node.agent_id} />
        <DetailTerm label="Group" value={node.group_id} />
        <DetailTerm label="User" value={node.user_id} />
      </dl>

      <div className="mt-auto border-t border-white/10 pt-4 text-xs text-slate-400">
        Created {new Date(node.created_at).toLocaleString()}
      </div>
    </aside>
  )
}

function DetailTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-100">{value}</dd>
    </div>
  )
}
