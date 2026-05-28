"use client"

import { useEffect, useState } from "react"
import { Inbox, MoreHorizontal } from "lucide-react"
import { loadRecentActivity } from "@/lib/dashboard/queries"
import type { ActivityItem } from "@/lib/dashboard/types"

// ── Filter tab definitions ──────────────────────────────────────────────────

type Tab = "all" | "events" | "decisions" | "insights" | "tasks"

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "events", label: "Events" },
  { id: "decisions", label: "Decisions" },
  { id: "insights", label: "Insights" },
  { id: "tasks", label: "Tasks" },
]

function matchesTab(item: ActivityItem, tab: Tab): boolean {
  if (tab === "all") return true
  if (tab === "events") return item.kind === "memory" || item.kind === "system"
  if (tab === "decisions") return item.kind === "approval"
  if (tab === "insights") return item.kind === "insight"
  if (tab === "tasks") return item.kind === "sync" || item.kind === "warning"
  return true
}

// ── Badge label derivation ──────────────────────────────────────────────────

function badgeLabel(kind: ActivityItem["kind"]): string {
  const map: Record<ActivityItem["kind"], string> = {
    memory: "MEMORY",
    insight: "INSIGHT",
    approval: "APPROVAL",
    sync: "SYNC",
    warning: "WARNING",
    system: "EVENT",
  }
  return map[kind] ?? "EVENT"
}

// ── Status dot color ────────────────────────────────────────────────────────

function dotClass(kind: ActivityItem["kind"]): string {
  if (kind === "insight" || kind === "approval") return "bg-[var(--dashboard-cta-approval)]"
  if (kind === "warning" || kind === "system") return "bg-[var(--allura-orange)]"
  if (kind === "sync") return "bg-[var(--allura-text-3)]"
  // memory / default → blue
  return "bg-[var(--allura-blue)]"
}

// ── Relative timestamp helper ───────────────────────────────────────────────

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return "—"
  }
}

// ── Skeleton row ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--dashboard-border)] last:border-b-0 animate-pulse">
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--dashboard-border-default)] flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-48 rounded bg-[var(--dashboard-border-default)]" />
        <div className="h-3 w-32 rounded bg-[var(--dashboard-border)]" />
      </div>
      <div className="h-5 w-16 rounded-full bg-[var(--dashboard-border)]" />
      <div className="h-4 w-4 rounded bg-[var(--dashboard-border)]" />
    </div>
  )
}

// ── Feed item row ───────────────────────────────────────────────────────────

function FeedRow({ item }: { item: ActivityItem }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--dashboard-border)] last:border-b-0 hover:bg-[var(--dashboard-surface-muted)] transition-colors">
      {/* Status dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass(item.kind)}`}
        aria-hidden="true"
      />

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--dashboard-text-primary)] truncate capitalize">
          {item.title}
        </p>
        <p className="text-xs text-[var(--dashboard-text-muted)] mt-0.5">
          {item.agent} &bull; {relativeTime(item.timestamp)}
        </p>
      </div>

      {/* Type badge */}
      <span className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border border-[var(--dashboard-border-default)] bg-[var(--allura-cream)] text-[var(--allura-charcoal)]">
        {badgeLabel(item.kind)}
      </span>

      {/* Overflow menu (static) */}
      <button
        type="button"
        aria-label="More options"
        className="flex-shrink-0 p-1 rounded hover:bg-[var(--dashboard-border)] text-[var(--dashboard-text-muted)] transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--dashboard-text-muted)]">
      <Inbox className="w-8 h-8 opacity-40" />
      <p className="text-sm">No memories in this feed yet.</p>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadRecentActivity()
      .then((result) => {
        if (!cancelled) {
          setItems(result.data ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = items.filter((item) => matchesTab(item, activeTab)).slice(0, 20)

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Memory Feed</h1>

      {/* Filter tabs */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Feed filters">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "px-3 py-1.5 text-sm rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--allura-blue)]",
                isActive
                  ? "bg-[var(--allura-blue)] text-white font-semibold"
                  : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)] hover:bg-[var(--dashboard-surface-muted)]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Feed card */}
      <div className="rounded-[var(--allura-r-md)] border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] shadow-[var(--allura-sh-sm)] overflow-hidden">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((item) => <FeedRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
