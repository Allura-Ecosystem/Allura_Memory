"use client"

import { Suspense } from "react"
import {
  Activity,
  AlertCircle,
  Brain,
  Clock,
  Database,
  Filter,
  GitBranch,
  Hash,
  HelpCircle,
  Link2,
  List,
  Loader2,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  User,
  X,
  XCircle,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"

// ── Types matching api-schemas.ts MemoryItem + SearchResultItem ──────────

type MemoryStatus = "approved" | "proposed" | "pending" | "deprecated" | "active" | "deleted"
type MemorySource = "episodic" | "semantic" | "both"
type MemoryProvenance = "conversation" | "manual"

interface MemoryItem {
  id: string
  content: string
  score: number
  source: MemorySource
  provenance: MemoryProvenance
  created_at: string
  usage_count?: number
  recent_usage_count?: number | null
  tags?: string[]
  status?: MemoryStatus
  user_id?: string
}

/** Full detail from GET /api/memory/[id] — includes provenance + evidence */
interface MemoryDetail extends MemoryItem {
  actor?: string | null
  creator?: string | null
  approver?: string | null
  group_id?: string
  source_event_id?: string | null
  proposal_id?: string | null
  trace_ref?: string | number | null
  evidence?: { id: string | null; type: string; label: string; status: "available" | "unavailable" }[]
  version?: number
  superseded_by?: string
  hash?: string | null
  previous_hash?: string | null
  schema_version?: number
  meta?: ResponseMeta
}

interface SearchResponse {
  results: MemoryItem[]
  count: number
  latency_ms: number
  meta?: ResponseMeta
}

interface ListResponse {
  memories: MemoryItem[]
  total: number
  has_more: boolean
  meta?: ResponseMeta
}

interface ResponseMeta {
  contract_version: string
  degraded: boolean
  degraded_reason?: string
  stores_used: string[]
  warnings?: string[]
}

// ── Freshness & data-quality states (Story 6-4) ─────────────────────────
// First-class states: Unknown, Fresh, Stale, Degraded, Unavailable, Not Verified
// No panel may claim "Live" or "Healthy" without evidence from the backing source.

type DataQualityState = "fresh" | "stale" | "degraded" | "unavailable" | "not_verified" | "unknown"

interface FreshnessInfo {
  state: DataQualityState
  label: string
  description: string
  icon: typeof Activity
  bg: string
  fg: string
}

const DATA_QUALITY: Record<DataQualityState, FreshnessInfo> = {
  fresh:        { state: "fresh",        label: "Fresh",        description: "Data retrieved successfully from backing stores",     icon: ShieldCheck, bg: "#dcfce7", fg: "#166534" },
  stale:        { state: "stale",        label: "Stale",        description: "Data was fetched but may be outdated",                icon: Clock,       bg: "#fef3c7", fg: "#92400e" },
  degraded:     { state: "degraded",     label: "Degraded",     description: "One or more stores returned partial results",         icon: ShieldAlert, bg: "#fef3c7", fg: "#92400e" },
  unavailable:  { state: "unavailable",  label: "Unavailable",  description: "Backing store could not be reached",                  icon: ShieldOff,   bg: "#fef2f2", fg: "#991b1b" },
  not_verified: { state: "not_verified", label: "Not Verified", description: "Evidence or provenance could not be independently verified", icon: HelpCircle, bg: "#f3f4f6", fg: "#6b7280" },
  unknown:      { state: "unknown",      label: "Unknown",      description: "Data quality could not be determined",                icon: HelpCircle,  bg: "#f3f4f6", fg: "#6b7280" },
}

/** Derive data quality state from response metadata — never assumes healthy without evidence */
function computeDataQuality(meta: ResponseMeta | null, fetchedAt: Date | null, error: string | null): DataQualityState {
  if (error) return "unavailable"
  if (!meta) return "unknown"
  if (meta.degraded) return "degraded"
  if (!meta.stores_used || meta.stores_used.length === 0) return "unavailable"
  if (!fetchedAt) return "unknown"
  const ageMs = Date.now() - fetchedAt.getTime()
  // Stale after 5 minutes without re-fetch
  if (ageMs > 5 * 60 * 1000) return "stale"
  return "fresh"
}

/** Format relative time for freshness display */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 1000) return "just now"
  const secs = Math.floor(diffMs / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Format relative age for memory created_at */
function memoryAge(isoDate: string): string {
  try {
    return relativeTime(new Date(isoDate))
  } catch {
    return "unknown"
  }
}

// ── Badge maps (text labels, not color-only — WCAG 2.1 AA) ──────────────

const SOURCE_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  episodic: { bg: "#dbeafe", fg: "#1e40af", label: "Episodic" },
  semantic: { bg: "#dcfce7", fg: "#166534", label: "Semantic" },
  both: { bg: "#fef3c7", fg: "#92400e", label: "Both" },
}

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  approved: { bg: "#dcfce7", fg: "#166534", label: "Approved" },
  proposed: { bg: "#e0e7ff", fg: "#3730a3", label: "Proposed" },
  pending: { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  deprecated: { bg: "#f3f4f6", fg: "#6b7280", label: "Deprecated" },
  deleted: { bg: "#fef2f2", fg: "#991b1b", label: "Deleted" },
}

const PROVENANCE_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  conversation: { bg: "#e0e7ff", fg: "#3730a3", label: "Conversation" },
  manual: { bg: "#fce7f3", fg: "#9d174d", label: "Manual" },
}

// ── Filter options ───────────────────────────────────────────────────────

type FilterSource = "all" | MemorySource
type FilterStatus = "all" | MemoryStatus

const SOURCE_FILTERS: { value: FilterSource; label: string }[] = [
  { value: "all", label: "All Sources" },
  { value: "episodic", label: "Episodic" },
  { value: "semantic", label: "Semantic" },
]

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All States" },
  { value: "active", label: "Active" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "proposed", label: "Proposed" },
  { value: "deprecated", label: "Deprecated" },
  { value: "deleted", label: "Deleted" },
]

// ── Component ────────────────────────────────────────────────────────────

function MemoriesWorkspacePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL-synced state
  const urlQuery = searchParams.get("q") ?? ""
  const urlSource = (searchParams.get("source") ?? "all") as FilterSource
  const urlStatus = (searchParams.get("status") ?? "all") as FilterStatus

  const [query, setQuery] = useState(urlQuery)
  const [filterSource, setFilterSource] = useState<FilterSource>(urlSource)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(urlStatus)
  const [groupId] = useState("allura-system")
  const [items, setItems] = useState<MemoryItem[]>([])
  const [meta, setMeta] = useState<ResponseMeta | null>(null)
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"idle" | "search" | "browse">("idle")
  const [lastFetched, setLastFetched] = useState<Date | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MemoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Derived data quality state — never claims "Live" without evidence
  const dataQuality = computeDataQuality(meta, lastFetched, error)

  // Fetch full memory detail
  const openDetail = useCallback(
    async (id: string) => {
      setSelectedId(id)
      setDetailLoading(true)
      setDetailError(null)
      setDetail(null)

      try {
        const res = await fetch(`/api/memory/${id}?group_id=${groupId}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Failed to load memory (${res.status})`)
        }
        const data: MemoryDetail = await res.json()
        setDetail(data)
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "Failed to load detail")
      } finally {
        setDetailLoading(false)
      }
    },
    [groupId],
  )

  const closeDetail = () => {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
  }

  // Sync filters to URL
  const pushUrl = useCallback(
    (q: string, source: FilterSource, status: FilterStatus) => {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      if (source !== "all") params.set("source", source)
      if (status !== "all") params.set("status", status)
      const qs = params.toString()
      router.replace(`/dashboard/memories${qs ? `?${qs}` : ""}`, { scroll: false })
    },
    [router],
  )

  // Search handler (federated search via query param)
  const handleSearch = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      const q = query.trim()
      if (!q) return

      setLoading(true)
      setError(null)
      setMode("search")
      pushUrl(q, filterSource, filterStatus)

      try {
        const params = new URLSearchParams({
          group_id: groupId,
          query: q,
          limit: "50",
        })
        const res = await fetch(`/api/memory?${params.toString()}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Search failed (${res.status})`)
        }
        const data: SearchResponse = await res.json()
        setItems(data.results)
        setMeta(data.meta ?? null)
        setLatencyMs(data.latency_ms)
        setTotalCount(data.count)
        setLastFetched(new Date())
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed")
        setItems([])
        setLastFetched(new Date())
      } finally {
        setLoading(false)
      }
    },
    [query, groupId, filterSource, filterStatus, pushUrl],
  )

  // Browse handler (memory_list — no query, just list)
  const handleBrowse = useCallback(async () => {
    setLoading(true)
    setError(null)
    setMode("browse")
    pushUrl("", filterSource, filterStatus)

    try {
      const params = new URLSearchParams({
        group_id: groupId,
        limit: "50",
        sort: "created_at_desc",
      })
      // API routes status=deleted to memory_list_deleted
      if (filterStatus === "deleted") {
        params.set("status", "deleted")
      }
      const res = await fetch(`/api/memory?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Browse failed (${res.status})`)
      }
      const data: ListResponse = await res.json()
      setItems(data.memories)
      setMeta(data.meta ?? null)
      setLatencyMs(null)
      setTotalCount(data.total)
      setLastFetched(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Browse failed")
      setItems([])
      setLastFetched(new Date())
    } finally {
      setLoading(false)
    }
  }, [groupId, filterSource, filterStatus, pushUrl])

  // Client-side filtering (source + status applied after fetch)
  const filtered = items.filter((mem) => {
    if (filterSource !== "all" && mem.source !== filterSource) return false
    if (filterStatus !== "all" && mem.status !== filterStatus) return false
    return true
  })

  // Auto-browse on filter change when in browse mode
  useEffect(() => {
    if (mode === "browse") {
      handleBrowse()
    }
    // Only re-run when filters change, not on every handleBrowse recreation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus])

  const handleFilterSource = (v: FilterSource) => {
    setFilterSource(v)
    pushUrl(query, v, filterStatus)
  }

  const handleFilterStatus = (v: FilterStatus) => {
    setFilterStatus(v)
    pushUrl(query, filterSource, v)
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 24px 32px",
        background: "#f5f1e6",
      }}
    >
      {/* Header */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "#1a1a1a",
          margin: "0 0 4px",
          letterSpacing: "-0.02em",
        }}
      >
        Memory Workspace
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
        Search governed memories across episodic and semantic stores
      </p>

      {/* Search bar — primary interaction surface (UX-DR3: search-first) */}
      <form
        onSubmit={handleSearch}
        style={{ width: "100%", maxWidth: 680, marginBottom: 12 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e8e3d8",
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
            padding: "8px 12px",
          }}
        >
          <Search size={18} style={{ color: "#9ca3af", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories... (e.g. 'architecture decisions', 'RuVector integration')"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "#374151",
              background: "transparent",
              fontFamily: "inherit",
            }}
            aria-label="Search memories"
          />
          {loading && (
            <Loader2 size={16} style={{ color: "#6b7280", animation: "spin 1s linear infinite" }} />
          )}
          <button
            type="button"
            onClick={handleBrowse}
            title="Browse all memories"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              color: "#374151",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <List size={14} /> Browse
          </button>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: query.trim() ? "#2563eb" : "#d1d5db",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: query.trim() ? "pointer" : "default",
            }}
          >
            Search
          </button>
        </div>
      </form>

      {/* Filter bar */}
      {mode !== "idle" && (
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <Filter size={14} style={{ color: "#9ca3af" }} />
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => handleFilterSource(f.value)}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                border: filterSource === f.value ? "1px solid #2563eb" : "1px solid #e5e7eb",
                background: filterSource === f.value ? "#eff6ff" : "#f9fafb",
                color: filterSource === f.value ? "#2563eb" : "#6b7280",
                fontSize: 12,
                fontWeight: filterSource === f.value ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
          <span style={{ width: 1, height: 16, background: "#e5e7eb" }} />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => handleFilterStatus(f.value)}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                border: filterStatus === f.value ? "1px solid #2563eb" : "1px solid #e5e7eb",
                background: filterStatus === f.value ? "#eff6ff" : "#f9fafb",
                color: filterStatus === f.value ? "#2563eb" : "#6b7280",
                fontSize: 12,
                fontWeight: filterStatus === f.value ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Data quality + freshness bar (Story 6-4) ──────────────────── */}
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {/* Row 1: Scope + stores + count */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 12,
              color: "#374151",
            }}
          >
            <Database size={12} /> {groupId}
          </span>
          {meta?.stores_used && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                fontSize: 12,
                color: "#374151",
              }}
            >
              Stores: {meta.stores_used.join(", ")}
            </span>
          )}
          {totalCount !== null && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {filtered.length} of {totalCount} memories
              {latencyMs !== null ? ` in ${latencyMs}ms` : ""}
            </span>
          )}
        </div>

        {/* Row 2: Data quality state + freshness — only shown after a fetch */}
        {mode !== "idle" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              background: DATA_QUALITY[dataQuality].bg,
              border: `1px solid ${dataQuality === "fresh" ? "#bbf7d0" : dataQuality === "unavailable" ? "#fecaca" : "#e5e7eb"}`,
            }}
          >
            {/* Data quality badge */}
            {(() => {
              const dq = DATA_QUALITY[dataQuality]
              const Icon = dq.icon
              return (
                <>
                  <Icon size={14} style={{ color: dq.fg, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: dq.fg }}>
                    {dq.label}
                  </span>
                  <span style={{ fontSize: 11, color: dq.fg, opacity: 0.8 }}>
                    — {dq.description}
                  </span>
                </>
              )
            })()}

            <div style={{ flex: 1 }} />

            {/* Last-fetched timestamp */}
            {lastFetched && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: DATA_QUALITY[dataQuality].fg,
                  opacity: 0.9,
                  whiteSpace: "nowrap",
                }}
                title={lastFetched.toLocaleString()}
              >
                <Clock size={10} /> Fetched {relativeTime(lastFetched)}
              </span>
            )}
          </div>
        )}

        {/* Row 3: Degraded reason + warnings (expanded detail when degraded) */}
        {meta?.degraded && meta.degraded_reason && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              background: "#fef3c7",
              border: "1px solid #fde68a",
              fontSize: 12,
              color: "#92400e",
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Degraded:</strong> {meta.degraded_reason}
              {meta.warnings && meta.warnings.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
                  {meta.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Source of truth declaration — only when data is loaded */}
        {mode !== "idle" && !loading && meta && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#9ca3af",
            }}
          >
            <Activity size={10} />
            <span>
              Source of truth: Allura Brain via {meta.stores_used?.join(" + ") || "unknown"} stores
              {meta.contract_version ? ` (${meta.contract_version})` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 13,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Empty state (UX-DR7: warm, honest) */}
      {mode !== "idle" && !loading && !error && filtered.length === 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            padding: "40px 24px",
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          <Brain size={40} style={{ color: "#d1d5db", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>
            No memories found
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            {mode === "search"
              ? `No governed memories matched "${query}" in ${groupId}.`
              : `No memories match the current filters in ${groupId}.`}{" "}
            Try adjusting your filters or search terms.
          </p>
        </div>
      )}

      {/* Pre-search state */}
      {mode === "idle" && !loading && (
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            padding: "40px 24px",
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          <Search size={40} style={{ color: "#d1d5db", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>
            Search-first workspace
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>
            Search across episodic traces, semantic insights, and vector embeddings.
            All queries are scoped to <strong>{groupId}</strong> with validated tenant
            isolation. Or click <strong>Browse</strong> to list all memories.
          </p>
        </div>
      )}

      {/* Results list */}
      {filtered.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: 680,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {filtered.map((mem) => {
            const sourceBadge = SOURCE_BADGE[mem.source] ?? SOURCE_BADGE.episodic
            const provBadge = PROVENANCE_BADGE[mem.provenance] ?? PROVENANCE_BADGE.conversation
            const statusBadge = mem.status ? STATUS_BADGE[mem.status] : null
            return (
              <div
                key={mem.id}
                role="button"
                tabIndex={0}
                onClick={() => openDetail(mem.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(mem.id) } }}
                style={{
                  background: selectedId === mem.id ? "#fefce8" : "#fff",
                  borderRadius: 10,
                  border: selectedId === mem.id ? "1px solid #d97706" : "1px solid #e8e3d8",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {/* Top row: badges + score */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {/* Status badge (primary — the story's core ask) */}
                  {statusBadge && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: statusBadge.bg,
                        color: statusBadge.fg,
                      }}
                    >
                      {statusBadge.label}
                    </span>
                  )}
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: sourceBadge.bg,
                      color: sourceBadge.fg,
                    }}
                  >
                    {sourceBadge.label}
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: provBadge.bg,
                      color: provBadge.fg,
                    }}
                  >
                    {provBadge.label}
                  </span>
                  {mem.tags?.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        background: "#f3f4f6",
                        color: "#4b5563",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                    {typeof mem.score === "number" ? `${(mem.score * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>

                {/* Content */}
                <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.5 }}>
                  {mem.content.length > 300 ? `${mem.content.slice(0, 300)}...` : mem.content}
                </p>

                {/* Footer: id + timestamp + user */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 11,
                    color: "#9ca3af",
                  }}
                >
                  <span style={{ fontFamily: "monospace" }}>{mem.id.slice(0, 12)}...</span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 3 }}
                    title={new Date(mem.created_at).toLocaleString()}
                  >
                    <Clock size={10} /> {memoryAge(mem.created_at)}
                  </span>
                  {mem.user_id && <span>{mem.user_id}</span>}
                  {mem.usage_count !== undefined && mem.usage_count > 0 && (
                    <span>Used {mem.usage_count}x</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Detail slide-over panel (Story 6-3) ───────────────────────── */}
      {selectedId && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeDetail}
            onKeyDown={() => {}}
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.25)",
              zIndex: 90,
            }}
          />
          {/* Panel */}
          <aside
            role="dialog"
            aria-label="Memory detail"
            aria-modal="true"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: "min(480px, 90vw)",
              height: "100vh",
              background: "#fff",
              borderLeft: "1px solid #e8e3d8",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.10)",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Panel header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid #f3f4f6",
                flexShrink: 0,
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                Memory Provenance
              </h2>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Close detail panel"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  color: "#6b7280",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {detailLoading && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280" }}>
                  <Loader2 size={24} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                  <p style={{ fontSize: 13, margin: 0 }}>Loading provenance...</p>
                </div>
              )}

              {detailError && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <XCircle size={14} /> {detailError}
                </div>
              )}

              {detail && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Badges row */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {detail.status && STATUS_BADGE[detail.status] && (
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: STATUS_BADGE[detail.status].bg, color: STATUS_BADGE[detail.status].fg }}>
                        {STATUS_BADGE[detail.status].label}
                      </span>
                    )}
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: (SOURCE_BADGE[detail.source] ?? SOURCE_BADGE.episodic).bg, color: (SOURCE_BADGE[detail.source] ?? SOURCE_BADGE.episodic).fg }}>
                      {(SOURCE_BADGE[detail.source] ?? SOURCE_BADGE.episodic).label}
                    </span>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: (PROVENANCE_BADGE[detail.provenance] ?? PROVENANCE_BADGE.conversation).bg, color: (PROVENANCE_BADGE[detail.provenance] ?? PROVENANCE_BADGE.conversation).fg }}>
                      {(PROVENANCE_BADGE[detail.provenance] ?? PROVENANCE_BADGE.conversation).label}
                    </span>
                  </div>

                  {/* Full content */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Content</div>
                    <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{detail.content}</p>
                  </div>

                  {/* SUPERSEDES chain (semantic memories) */}
                  {detail.superseded_by && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <GitBranch size={14} style={{ color: "#166534", flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: "#166534" }}>
                        <strong>Superseded by</strong>{" "}
                        <span style={{ fontFamily: "monospace" }}>{detail.superseded_by}</span>
                      </div>
                    </div>
                  )}

                  {/* Provenance fields */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Provenance</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {([
                        { icon: User, label: "Actor", value: detail.actor },
                        { icon: User, label: "Creator", value: detail.creator },
                        { icon: Shield, label: "Approver", value: detail.approver },
                        { icon: Database, label: "Group ID", value: detail.group_id },
                        { icon: Link2, label: "Source Event", value: detail.source_event_id },
                        { icon: Link2, label: "Proposal ID", value: detail.proposal_id },
                        { icon: Link2, label: "Trace Ref", value: detail.trace_ref != null ? String(detail.trace_ref) : null },
                        { icon: Clock, label: "Created", value: detail.created_at ? new Date(detail.created_at).toLocaleString() : null },
                      ] as const).map((field) => {
                        const Icon = field.icon
                        return (
                          <div
                            key={field.label}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 12,
                              color: "#374151",
                            }}
                          >
                            <Icon size={12} style={{ color: "#9ca3af", flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, minWidth: 90 }}>{field.label}</span>
                            <span style={{ fontFamily: "monospace", color: field.value ? "#374151" : "#d1d5db" }}>
                              {field.value ?? "unavailable"}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Evidence chain */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence Chain</div>
                    {detail.evidence && detail.evidence.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {detail.evidence.map((ev, i) => (
                          <div
                            key={ev.id ?? i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 10px",
                              borderRadius: 6,
                              background: ev.status === "available" ? "#f9fafb" : "#fef2f2",
                              border: ev.status === "available" ? "1px solid #e5e7eb" : "1px solid #fecaca",
                              fontSize: 12,
                            }}
                          >
                            <Link2 size={12} style={{ color: ev.status === "available" ? "#6b7280" : "#991b1b", flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "#374151" }}>{ev.label}</span>
                            <span style={{ color: "#9ca3af" }}>({ev.type})</span>
                            <div style={{ flex: 1 }} />
                            <span
                              style={{
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600,
                                background: ev.status === "available" ? "#dcfce7" : "#fef2f2",
                                color: ev.status === "available" ? "#166534" : "#991b1b",
                              }}
                            >
                              {ev.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>No evidence records available.</p>
                    )}
                  </div>

                  {/* Hash chain + version */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Integrity</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {([
                        { label: "Version", value: detail.version != null ? String(detail.version) : null },
                        { label: "Hash", value: detail.hash },
                        { label: "Previous Hash", value: detail.previous_hash },
                        { label: "Schema Version", value: detail.schema_version != null ? String(detail.schema_version) : null },
                      ]).map((field) => (
                        <div
                          key={field.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            color: "#374151",
                          }}
                        >
                          <Hash size={12} style={{ color: "#9ca3af", flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, minWidth: 100 }}>{field.label}</span>
                          <span style={{ fontFamily: "monospace", color: field.value ? "#374151" : "#d1d5db", wordBreak: "break-all" }}>
                            {field.value ?? "unavailable"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  {detail.tags && detail.tags.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tags</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {detail.tags.map((tag) => (
                          <span key={tag} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#f3f4f6", color: "#4b5563" }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Memory ID */}
                  <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                    ID: {detail.id}
                  </div>

                  {/* ── Data Quality (Story 6-4) ─────────────────────── */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Data Quality</div>
                    {(() => {
                      const detailQuality = computeDataQuality(detail.meta ?? null, lastFetched, detailError)
                      const dq = DATA_QUALITY[detailQuality]
                      const Icon = dq.icon
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {/* Quality state badge */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 12px",
                              borderRadius: 8,
                              background: dq.bg,
                              border: `1px solid ${detailQuality === "fresh" ? "#bbf7d0" : detailQuality === "unavailable" ? "#fecaca" : "#e5e7eb"}`,
                            }}
                          >
                            <Icon size={14} style={{ color: dq.fg, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: dq.fg }}>{dq.label}</span>
                            <span style={{ fontSize: 11, color: dq.fg, opacity: 0.8 }}>— {dq.description}</span>
                          </div>

                          {/* Stores used */}
                          {detail.meta?.stores_used && (
                            <div style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
                              <Database size={12} style={{ color: "#9ca3af" }} />
                              <span>Stores: {detail.meta.stores_used.join(", ")}</span>
                            </div>
                          )}

                          {/* Degraded reason */}
                          {detail.meta?.degraded && detail.meta.degraded_reason && (
                            <div style={{ fontSize: 12, color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}>
                              <AlertCircle size={12} />
                              <span>{detail.meta.degraded_reason}</span>
                            </div>
                          )}

                          {/* Warnings */}
                          {detail.meta?.warnings && detail.meta.warnings.length > 0 && (
                            <div style={{ fontSize: 11, color: "#6b7280" }}>
                              {detail.meta.warnings.map((w, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <AlertCircle size={10} /> {w}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Last fetched */}
                          {lastFetched && (
                            <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={10} /> Fetched {relativeTime(lastFetched)}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default function MemoriesWorkspacePage() {
  return (
    <Suspense fallback={<div style={{ padding: "64px 24px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>Loading memories workspace…</div>}>
      <MemoriesWorkspacePageInner />
    </Suspense>
  )
}
