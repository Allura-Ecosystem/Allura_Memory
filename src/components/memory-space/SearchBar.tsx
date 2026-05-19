"use client"

import type { MemoryType } from "@/lib/memory-graph/types"

const FILTERS: Array<{ label: string; value: MemoryType }> = [
  { label: "Raw", value: "raw" },
  { label: "Approved", value: "approved" },
  { label: "Promoted", value: "promoted" },
  { label: "Deprecated", value: "deprecated" },
]

interface SearchBarProps {
  query: string
  onQueryChange: (query: string) => void
  filters: Set<string>
  onFiltersChange: (filters: Set<string>) => void
}

export function SearchBar({ query, onQueryChange, filters, onFiltersChange }: SearchBarProps) {
  function toggleFilter(value: MemoryType) {
    const next = new Set(filters)
    if (next.has(value)) {
      next.delete(value)
    } else {
      next.add(value)
    }
    onFiltersChange(next)
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-white shadow-2xl backdrop-blur-xl">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
        Memory search
      </label>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search title, preview, or agent…"
        className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-400 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-400/20"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = filters.has(filter.value)
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => toggleFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-cyan-300/80 bg-cyan-300/20 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:bg-white/10"
              }`}
            >
              {filter.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
