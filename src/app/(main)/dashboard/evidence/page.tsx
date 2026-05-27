"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"

// ── Types ────────────────────────────────────────────────────────────────────

type EvidenceStatus = "Verified" | "Locked" | "Linked"
type EvidenceType = "Image" | "Document" | "Report" | "Data"

interface EvidenceItem {
  id: string
  title: string
  type: EvidenceType
  agent: string
  date: string
  status: EvidenceStatus
}

// ── Static seed data (matches Figma spec) ────────────────────────────────────
// Real API data will replace this once an /api/evidence endpoint is available.
// The list is deterministic (no random IDs) so SSR/hydration stays stable.

const EVIDENCE_SEED: EvidenceItem[] = [
  {
    id: "ev-001",
    title: "Screenshot — Dashboard Overview",
    type: "Image",
    agent: "Evidence Collector",
    date: "May 2, 2026",
    status: "Verified",
  },
  {
    id: "ev-002",
    title: "Brand Kit v2 — Section 1-10",
    type: "Document",
    agent: "Kolar",
    date: "May 2, 2026",
    status: "Verified",
  },
  {
    id: "ev-003",
    title: "Logo Directions — 5 concepts",
    type: "Image",
    agent: "Diesel",
    date: "May 2, 2026",
    status: "Locked",
  },
  {
    id: "ev-004",
    title: "Strategy Pack — Locked positioning",
    type: "Document",
    agent: "Kolar",
    date: "May 2, 2026",
    status: "Locked",
  },
  {
    id: "ev-005",
    title: "QA Report — 94% pass rate",
    type: "Report",
    agent: "Kolar",
    date: "May 2, 2026",
    status: "Verified",
  },
  {
    id: "ev-006",
    title: "Competitive Analysis — 5 competitors",
    type: "Data",
    agent: "Kolar",
    date: "May 2, 2026",
    status: "Linked",
  },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: EvidenceStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "Verified" && "bg-green-100 text-green-800",
        status === "Locked" && "bg-amber-100 text-amber-800",
        status === "Linked" && "bg-blue-100 text-blue-800"
      )}
    >
      {status}
    </span>
  )
}

function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      {/* Thumbnail */}
      <div className="size-12 shrink-0 rounded-lg bg-gray-100" aria-hidden="true" />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--dashboard-text-primary)]">{item.title}</p>
        <p className="mt-0.5 text-xs text-[var(--dashboard-text-secondary)]">
          {item.type} &bull; {item.agent} &bull; {item.date}
        </p>
      </div>

      {/* Status pill */}
      <StatusPill status={item.status} />
    </div>
  )
}

function SearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dashboard-text-muted)]" aria-hidden="true" />
      <input
        type="text"
        placeholder="Search evidence…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-56 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] pl-9 pr-3 text-sm text-[var(--dashboard-text-primary)] placeholder:text-[var(--dashboard-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--dashboard-cta-primary)]"
      />
    </div>
  )
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

interface MemoryApiItem {
  id?: string
  content?: string
  metadata?: Record<string, unknown>
  created_at?: string
  source?: string
}

function parseStatus(item: MemoryApiItem): EvidenceStatus {
  const meta = item.metadata ?? {}
  if (meta.status === "locked") return "Locked"
  if (meta.status === "linked" || meta.linked) return "Linked"
  return "Verified"
}

function parseType(item: MemoryApiItem): EvidenceType {
  const meta = item.metadata ?? {}
  if (meta.type === "image") return "Image"
  if (meta.type === "report") return "Report"
  if (meta.type === "data") return "Data"
  return "Document"
}

function parseDate(iso?: string): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

function mapApiItems(raw: MemoryApiItem[]): EvidenceItem[] {
  return raw.map((item, idx) => ({
    id: String(item.id ?? `ev-api-${idx}`),
    title: String(item.content ?? item.metadata?.title ?? `Evidence ${idx + 1}`).slice(0, 80),
    type: parseType(item),
    agent: String(item.metadata?.agent_id ?? item.source ?? "System"),
    date: parseDate(item.created_at),
    status: parseStatus(item),
  }))
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EvidencePage() {
  const [items, setItems] = useState<EvidenceItem[]>(EVIDENCE_SEED)
  const [query, setQuery] = useState("")
  const [dataSource, setDataSource] = useState<"seed" | "live">("seed")

  // Attempt to load real memory data; fall back to seed silently
  useEffect(() => {
    let cancelled = false

    async function tryLoad() {
      try {
        const res = await fetch(
          `/api/memory?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}&limit=20`,
          { cache: "no-store" }
        )
        if (!res.ok) return

        const json = await res.json()
        const raw: MemoryApiItem[] = Array.isArray(json?.memories)
          ? json.memories
          : Array.isArray(json)
          ? json
          : []

        if (!cancelled && raw.length > 0) {
          setItems(mapApiItems(raw))
          setDataSource("live")
        }
      } catch {
        // Keep seed data — no error toast needed on evidence list
      }
    }

    void tryLoad()
    return () => { cancelled = true }
  }, [])

  const filtered = query.trim()
    ? items.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.agent.toLowerCase().includes(query.toLowerCase()) ||
          item.type.toLowerCase().includes(query.toLowerCase())
      )
    : items

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--dashboard-text-muted)]">
            Evidence
          </p>
          <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Evidence</h1>
        </div>
        <div className="flex items-center gap-3">
          {dataSource === "seed" && (
            <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 sm:inline-flex">
              Sample data
            </span>
          )}
          <SearchInput value={query} onChange={setQuery} />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] px-6 py-12 text-center">
          <p className="text-base font-semibold text-[var(--dashboard-text-primary)]">No evidence found</p>
          <p className="mt-1 max-w-xs text-sm text-[var(--dashboard-text-secondary)]">
            {query ? `No results match "${query}".` : "No evidence items are available yet."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] shadow-sm divide-y divide-[var(--dashboard-border)]">
          {filtered.map((item) => (
            <EvidenceRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="text-right text-xs text-[var(--dashboard-text-muted)]">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        {dataSource === "seed" ? " · sample data" : " · live"}
      </p>
    </div>
  )
}
