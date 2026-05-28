"use client"

import { useEffect, useState } from "react"
import { Search, SlidersHorizontal } from "lucide-react"

import { loadRecentActivity } from "@/lib/dashboard/queries"
import type { ActivityItem } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

/* ─── Event type config ─── */

type FeedEventType =
  | "DESIGN_DECISION"
  | "TASK_COMPLETE"
  | "LESSON_LEARNED"
  | "AGENT_INVOKED"
  | "BLOCKED"
  | string

interface EventTypeStyle {
  dot: string
  pillBg: string
  pillText: string
  label: string
}

const EVENT_TYPE_STYLES: Record<string, EventTypeStyle> = {
  DESIGN_DECISION: {
    dot: "bg-blue-500",
    pillBg: "#DBEAFE",
    pillText: "#1D4ED8",
    label: "DESIGN_DECISION",
  },
  TASK_COMPLETE: {
    dot: "bg-green-500",
    pillBg: "#DCFCE7",
    pillText: "#166534",
    label: "TASK_COMPLETE",
  },
  LESSON_LEARNED: {
    dot: "bg-amber-400",
    pillBg: "#FEF3C7",
    pillText: "#92400E",
    label: "LESSON_LEARNED",
  },
  AGENT_INVOKED: {
    dot: "bg-purple-500",
    pillBg: "#EDE9FE",
    pillText: "#5B21B6",
    label: "AGENT_INVOKED",
  },
  BLOCKED: {
    dot: "bg-red-500",
    pillBg: "#FEE2E2",
    pillText: "#991B1B",
    label: "BLOCKED",
  },
}

const DEFAULT_STYLE: EventTypeStyle = {
  dot: "bg-gray-400",
  pillBg: "#F3F4F6",
  pillText: "#374151",
  label: "EVENT",
}

function resolveEventStyle(kind: string, rawTitle: string): EventTypeStyle {
  // Try to match against known event types from title or kind
  const upper = rawTitle.toUpperCase().replace(/[\s-]+/g, "_")
  for (const key of Object.keys(EVENT_TYPE_STYLES)) {
    if (upper.includes(key)) return EVENT_TYPE_STYLES[key]!
  }
  if (kind === "approval") return EVENT_TYPE_STYLES["DESIGN_DECISION"]!
  if (kind === "memory") return EVENT_TYPE_STYLES["TASK_COMPLETE"]!
  if (kind === "insight") return EVENT_TYPE_STYLES["LESSON_LEARNED"]!
  if (kind === "warning") return EVENT_TYPE_STYLES["BLOCKED"]!
  if (kind === "sync") return EVENT_TYPE_STYLES["AGENT_INVOKED"]!
  return DEFAULT_STYLE
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/* ─── Feed row ─── */

function FeedRow({ event }: { event: ActivityItem }) {
  const style = resolveEventStyle(event.kind, event.title)
  const displayTitle = `${style.label} — ${event.title
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())}`

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-[var(--dashboard-surface-hover,#F9FAFB)]">
      {/* Colored dot */}
      <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} />

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--dashboard-text-primary)]">
          {displayTitle}
        </p>
        <p className="text-xs text-[var(--dashboard-text-secondary)]">
          Agent: {event.agent} &bull; {timeAgo(event.timestamp)}
        </p>
      </div>

      {/* Pill badge */}
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: style.pillBg, color: style.pillText }}
      >
        {style.label}
      </span>
    </div>
  )
}

/* ─── Tab bar ─── */

const TABS = ["Events", "Decisions", "Insights", "Tasks"] as const
type Tab = (typeof TABS)[number]

/* ─── Empty state ─── */

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 size-10 rounded-full bg-[var(--dashboard-surface)] flex items-center justify-center">
        <Search className="size-5 text-[var(--dashboard-text-secondary)]" />
      </div>
      <p className="text-sm font-medium text-[var(--dashboard-text-primary)]">No events yet</p>
      <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
        Memory events will appear here as agents operate.
      </p>
    </div>
  )
}

/* ─── Page ─── */

export default function MemoryFeedPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Events")
  const [events, setEvents] = useState<ActivityItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRecentActivity("allura-system")
      .then((result) => {
        if (result.error && !result.data?.length) {
          setError(result.error)
        }
        setEvents(result.data ?? [])
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load feed")
        setEvents([])
      })
  }, [])

  const isLoading = events === null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Memory Feed</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dashboard-text-secondary)]" />
            <input
              placeholder="Search memories..."
              className="rounded-full border border-[var(--dashboard-border)] bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--dashboard-cta-primary,#2563EB)] focus:ring-offset-1"
            />
          </div>
          <button
            className="rounded-lg border border-[var(--dashboard-border)] p-2 text-[var(--dashboard-text-secondary)] hover:bg-[var(--dashboard-surface)]"
            aria-label="Filter"
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 border-b border-[var(--dashboard-border)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === activeTab
                ? "border-b-2 border-[var(--dashboard-cta-primary,#2563EB)] text-[var(--dashboard-cta-primary,#2563EB)]"
                : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Feed card */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        {isLoading ? (
          /* Skeleton rows */
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <span className="size-2.5 shrink-0 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-2/3 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-5 w-20 rounded-full bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <p className="mt-1 text-xs text-[var(--dashboard-text-secondary)]">
              Check API connectivity and retry.
            </p>
          </div>
        ) : events.length === 0 ? (
          <EmptyFeed />
        ) : (
          <div className="space-y-1">
            {events.map((event) => (
              <FeedRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
