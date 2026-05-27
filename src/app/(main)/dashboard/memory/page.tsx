"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Brain, Search, SlidersHorizontal } from "lucide-react"

import { loadMemories } from "@/lib/dashboard/queries"
import type { Memory } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS = ["all", "pending", "approved", "rejected", "superseded", "active"] as const
const TYPE_OPTIONS = ["all", "event", "outcome", "insight", "memory"] as const

function confidenceColor(confidence: number | undefined): string {
  if (confidence === undefined) return "text-[var(--dashboard-text-muted)]"
  if (confidence >= 0.85) return "text-green-600"
  if (confidence >= 0.6) return "text-amber-600"
  return "text-red-600"
}

function statusBadge(status: Memory["status"]): { bg: string; text: string } {
  switch (status) {
    case "approved":
    case "active":
      return { bg: "bg-green-50 border-green-200", text: "text-green-700" }
    case "pending":
      return { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" }
    case "rejected":
      return { bg: "bg-red-50 border-red-200", text: "text-red-700" }
    case "superseded":
      return { bg: "bg-gray-50 border-gray-200", text: "text-gray-600" }
    default:
      return { bg: "bg-gray-50 border-gray-200", text: "text-gray-500" }
  }
}

function MemoryCard({ memory }: { memory: Memory }) {
  const badge = statusBadge(memory.status)
  return (
    <Link
      href={`/dashboard/memory/${encodeURIComponent(memory.id)}`}
      className="block rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4 transition-colors hover:bg-[var(--dashboard-surface-muted)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--dashboard-text-primary)]">
            {memory.title || "Untitled Memory"}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--dashboard-text-secondary)]">
            {memory.content}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", badge.bg, badge.text)}>
          {memory.status}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--dashboard-text-muted)]">
        <span>Agent: {memory.agent}</span>
        <span>&bull;</span>
        <span>Type: {memory.type}</span>
        {memory.confidence !== undefined && (
          <>
            <span>&bull;</span>
            <span className={confidenceColor(memory.confidence)}>
              {Math.round(memory.confidence * 100)}% confidence
            </span>
          </>
        )}
        {memory.tags.length > 0 && (
          <>
            <span>&bull;</span>
            <span>{memory.tags.slice(0, 3).join(", ")}</span>
          </>
        )}
      </div>
    </Link>
  )
}

function EmptyMemories() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--dashboard-surface)]">
        <Brain className="size-5 text-[var(--dashboard-text-secondary)]" />
      </div>
      <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No memories found</p>
      <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
        Memories will appear here as agents create and promote them.
      </p>
    </div>
  )
}

export default function MemoryListPage() {
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadMemories(searchQuery || undefined, "allura-system")
      .then((result) => {
        if (result.error && !result.data?.length) setError(result.error)
        setMemories(result.data ?? [])
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load memories")
        setMemories([])
      })
  }, [searchQuery])

  const filtered = (memories ?? []).filter((m) => {
    if (statusFilter !== "all" && m.status !== statusFilter) return false
    if (typeFilter !== "all" && m.type !== typeFilter) return false
    return true
  })

  const isLoading = memories === null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Memories</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dashboard-text-secondary)]" />
            <input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dashboard-cta-primary)] focus:ring-offset-1"
            />
          </div>
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={cn(
              "rounded-lg border border-[var(--dashboard-border)] p-2 transition-colors hover:bg-[var(--dashboard-surface)]",
              showFilters ? "bg-[var(--dashboard-surface)] text-[var(--dashboard-cta-primary)]" : "text-[var(--dashboard-text-secondary)]"
            )}
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--dashboard-text-secondary)]">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] px-3 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--dashboard-text-secondary)]">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-bg)] px-3 py-1.5 text-sm"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Count */}
      {!isLoading && !error && (
        <p className="text-xs text-[var(--dashboard-text-muted)]">
          {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
          {statusFilter !== "all" || typeFilter !== "all" ? " (filtered)" : ""}
        </p>
      )}

      {/* Memory list */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-4">
              <div className="space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
          ))
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">Check API connectivity and retry.</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyMemories />
        ) : (
          filtered.map((memory) => <MemoryCard key={memory.id} memory={memory} />)
        )}
      </div>
    </div>
  )
}
