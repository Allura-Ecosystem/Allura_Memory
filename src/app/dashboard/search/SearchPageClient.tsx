"use client"

import { useState, useEffect, useRef, useCallback, useTransition } from "react"
import type { SearchResult, SearchResultType } from "@/server/actions/search"
import { unifiedSearch } from "@/server/actions/search"

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300
const DEFAULT_GROUP_ID = "allura-system"

const ALL_TYPES: { type: SearchResultType; label: string }[] = [
  { type: "memory", label: "Memories" },
  { type: "run", label: "Runs" },
  { type: "work-item", label: "Work Items" },
  { type: "project", label: "Projects" },
  { type: "definition", label: "Definitions" },
  { type: "evidence", label: "Evidence" },
  { type: "handoff", label: "Handoffs" },
]

type SubView = "memories" | "graph" | "processes" | "extracted" | "approvals" | "agents"

const SUB_VIEWS: { id: SubView; label: string }[] = [
  { id: "memories", label: "Memories" },
  { id: "graph", label: "Graph" },
  { id: "processes", label: "Processes" },
  { id: "extracted", label: "Extracted" },
  { id: "approvals", label: "Approvals" },
  { id: "agents", label: "Agents" },
]

// Sub-view → which SearchResultTypes to show (empty = show all from current filter)
const SUB_VIEW_TYPE_MAP: Record<SubView, SearchResultType[] | null> = {
  memories: ["memory"],
  graph: null,
  processes: ["run", "definition"],
  extracted: ["evidence"],
  approvals: ["handoff"],
  agents: null,
}

const TYPE_COLORS: Record<SearchResultType, string> = {
  memory: "var(--allura-blue)",
  run: "var(--allura-green)",
  "work-item": "var(--allura-orange)",
  project: "var(--allura-type-project)",
  definition: "var(--allura-type-definition)",
  evidence: "var(--allura-type-evidence)",
  handoff: "var(--allura-type-handoff)",
}

// ── Route map ─────────────────────────────────────────────────────────────────

function getDetailRoute(result: SearchResult): string | null {
  switch (result.type) {
    case "project":
      return `/dashboard/work-plane/projects/${result.id}`
    case "work-item":
      return `/dashboard/work-plane/work-items/${result.id}`
    case "run":
      return `/dashboard/runs/${result.id}`
    case "definition":
      return `/dashboard/definitions/${String((result.metadata as Record<string, unknown>)?.definition_id ?? result.id)}`
    default:
      return null
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: SearchResultType }): React.ReactElement {
  const label = ALL_TYPES.find((t) => t.type === type)?.label ?? type
  const color = TYPE_COLORS[type]
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--allura-r-full, 999px)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: `${color}18`,
        color,
        border: `1px solid ${color}30`,
        fontFamily: '"IBM Plex Sans", sans-serif',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
}

function ConfidenceDots({ score }: { score: number }): React.ReactElement {
  const pct = Math.round(score * 100)
  // Five dots: filled based on score quintile
  const filled = Math.round(score * 5)
  const dotColor =
    pct >= 70 ? "var(--allura-green)" : pct >= 40 ? "var(--allura-orange)" : "var(--allura-gray-400)"
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "3px", flexShrink: 0 }}
      title={`Confidence: ${pct}%`}
      aria-label={`Confidence ${pct}%`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: i < filled ? dotColor : "var(--allura-gray-200)",
          }}
        />
      ))}
      <span
        style={{
          fontSize: "10px",
          color: dotColor,
          fontFamily: '"IBM Plex Mono", monospace',
          marginLeft: "4px",
        }}
      >
        {pct}%
      </span>
    </span>
  )
}

function SourceBadge({ type }: { type: SearchResultType }): React.ReactElement {
  const isEpisodic = type === "memory" || type === "run" || type === "evidence"
  const label = isEpisodic ? "episodic" : "semantic"
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: "var(--allura-r-sm, 4px)",
        fontSize: "10px",
        fontWeight: 500,
        fontFamily: '"IBM Plex Mono", monospace',
        background: isEpisodic ? "var(--allura-info-bg)" : "var(--allura-purple-bg)",
        color: isEpisodic ? "var(--allura-link)" : "var(--allura-purple-text)",
        border: `1px solid ${isEpisodic ? "var(--allura-info-border)" : "var(--allura-purple-bg)"}`,
        flexShrink: 0,
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  )
}

function ResultSkeleton(): React.ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading results">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--allura-cream)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div
            style={{
              height: "14px",
              width: `${50 + Math.random() * 30}%`,
              background: "var(--allura-cream)",
              borderRadius: "4px",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: "12px",
              width: "80%",
              background: "var(--allura-cream)",
              borderRadius: "4px",
              animation: "pulse 1.5s ease-in-out infinite",
              animationDelay: "0.15s",
            }}
          />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ query }: { query: string }): React.ReactElement {
  const hasQuery = query.trim().length > 0
  return (
    <div
      style={{
        padding: "64px 48px",
        textAlign: "center",
        background: "var(--allura-paper)",
        borderRadius: "var(--allura-r-md, 8px)",
        border: "1px solid var(--allura-cream)",
      }}
      role="status"
      aria-live="polite"
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        style={{ margin: "0 auto 16px", display: "block", opacity: 0.3 }}
      >
        <circle cx="18" cy="18" r="12" stroke="var(--allura-charcoal)" strokeWidth="2" />
        <path d="M28 28L36 36" stroke="var(--allura-charcoal)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--allura-charcoal)",
          margin: "0 0 6px",
        }}
      >
        {hasQuery ? "No results found" : "Search Allura"}
      </p>
      <p style={{ fontSize: "13px", color: "var(--allura-gray-500)", margin: "0 0 6px" }}>
        {hasQuery
          ? `No matches for "${query}" — try a different query or broaden your type filter.`
          : "Enter a query to search memories, runs, work items, projects, and more."}
      </p>
      {!hasQuery && (
        <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0", fontFamily: '"IBM Plex Mono", monospace' }}>
          Searches everything you&apos;ve saved · allura-system
        </p>
      )}
    </div>
  )
}

function ResultItem({ result }: { result: SearchResult }): React.ReactElement {
  const route = getDetailRoute(result)
  const formattedDate = new Date(result.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  // Extract agent_id from metadata when available (evidence, handoff, run types)
  const meta = result.metadata as Record<string, unknown> | undefined
  const agentIdRaw = meta?.actor_id ?? meta?.from_actor_id
  const agentId: string | null = typeof agentIdRaw === "string" ? agentIdRaw : null

  const inner = (
    <div
      style={{
        padding: "14px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        cursor: route ? "pointer" : "default",
        transition: "background 0.12s ease",
      }}
    >
      {/* Row 1: type badge, title, score dots, date */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <TypeBadge type={result.type} />
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--allura-charcoal)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {result.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {result.score !== undefined && <ConfidenceDots score={result.score} />}
          <span
            style={{
              fontSize: "11px",
              color: "var(--allura-gray-500)",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            {formattedDate}
          </span>
        </div>
      </div>
      {/* Row 2: content preview */}
      <p
        style={{
          fontSize: "13px",
          color: "var(--allura-gray-500)",
          margin: 0,
          lineHeight: 1.5,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {result.summary}
      </p>
      {/* Row 3: source badge + agent_id */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <SourceBadge type={result.type} />
        {agentId !== null && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--allura-gray-500)",
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          >
            {agentId}
          </span>
        )}
      </div>
    </div>
  )

  if (route) {
    return (
      <a
        href={route}
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          borderBottom: "1px solid var(--allura-cream)",
        }}
        aria-label={`${result.type}: ${result.title}`}
      >
        {inner}
      </a>
    )
  }

  return (
    <div
      style={{ borderBottom: "1px solid var(--allura-cream)" }}
      aria-label={`${result.type}: ${result.title}`}
    >
      {inner}
    </div>
  )
}

// ── Main page component ───────────────────────────────────────────────────────

export default function SearchPageClient(): React.ReactElement {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedTypes, setSelectedTypes] = useState<SearchResultType[]>([])
  const [activeSubView, setActiveSubView] = useState<SubView>("memories")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce the query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Compute effective types: sub-view narrows the manual type filter
  function effectiveTypes(manualTypes: SearchResultType[], subView: SubView): SearchResultType[] {
    const subViewTypes = SUB_VIEW_TYPE_MAP[subView]
    if (subViewTypes === null) return manualTypes
    if (manualTypes.length === 0) return subViewTypes
    return manualTypes.filter((t) => subViewTypes.includes(t))
  }

  // Run search when debounced query or type filter changes
  const runSearch = useCallback(
    (q: string, types: SearchResultType[]) => {
      if (q.trim().length === 0) {
        setResults([])
        setError(null)
        return
      }
      startTransition(async () => {
        try {
          setError(null)
          const data = await unifiedSearch(q, {
            group_id: DEFAULT_GROUP_ID,
            types: types.length > 0 ? types : undefined,
            limit: 40,
          })
          setResults(data)
        } catch (err) {
          setError(err instanceof Error ? err.message : "Search failed. Please try again.")
          setResults([])
        }
      })
    },
    [],
  )

  useEffect(() => {
    runSearch(debouncedQuery, effectiveTypes(selectedTypes, activeSubView))
    // effectiveTypes is a stable pure fn derived from args — no dep needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedTypes, activeSubView, runSearch])

  function toggleType(type: SearchResultType): void {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  function handleSubViewChange(view: SubView): void {
    setActiveSubView(view)
    // Reset manual type filter when switching sub-views to avoid empty intersection
    setSelectedTypes([])
  }

  const showResults = debouncedQuery.trim().length > 0
  const isLoading = isPending && showResults

  return (
    <div style={{ padding: "32px", maxWidth: "860px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--allura-blue)",
            margin: "0 0 8px",
          }}
        >
          Unified Search
        </p>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--allura-charcoal)",
            letterSpacing: "-0.01em",
            margin: "0 0 4px",
          }}
        >
          Search
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Search memories, runs, work items, projects, evidence, and handoffs.
        </p>
      </div>

      {/* Sub-view tab bar */}
      <div
        style={{
          display: "flex",
          gap: "0",
          marginBottom: "20px",
          borderBottom: "2px solid var(--allura-border-row)",
          overflowX: "auto",
        }}
        role="tablist"
        aria-label="Search view"
      >
        {SUB_VIEWS.map(({ id, label }) => {
          const active = activeSubView === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSubViewChange(id)}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: active ? 600 : 400,
                fontFamily: '"IBM Plex Sans", sans-serif',
                color: active ? "var(--allura-blue)" : "var(--allura-gray-500)",
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid var(--allura-blue)" : "2px solid transparent",
                marginBottom: "-2px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.12s ease, border-color 0.12s ease",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Search input */}
      <div style={{ marginBottom: "16px" }}>
        <label htmlFor="search-input" className="sr-only">
          Search Allura
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            background: "rgba(255, 255, 255, 0.72)",
            border: `1px solid ${query ? "var(--allura-blue)" : "var(--dashboard-border)"}`,
            borderRadius: "var(--allura-r-lg, 12px)",
            boxShadow: query
              ? "0 0 0 3px var(--tone-blue-bg, rgba(29,78,216,0.08))"
              : "0 4px 12px rgba(17, 24, 39, 0.05)",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{ flexShrink: 0, color: query ? "var(--allura-blue)" : "var(--allura-gray-500)" }}
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="search-input"
            type="search"
            placeholder="Search memories, entities, traces…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "14px",
              color: "var(--allura-charcoal)",
              fontFamily: '"IBM Plex Sans", sans-serif',
            }}
            autoComplete="off"
            autoFocus
          />
          {isLoading && (
            <span
              style={{
                width: "14px",
                height: "14px",
                border: "2px solid var(--allura-blue)",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.6s linear infinite",
                flexShrink: 0,
              }}
              aria-label="Searching…"
              role="status"
            />
          )}
          {query && !isLoading && (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "var(--allura-gray-500)",
                padding: 0,
                flexShrink: 0,
              }}
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <span
            style={{
              padding: "2px 6px",
              background: "rgba(17, 24, 39, 0.06)",
              borderRadius: "4px",
              fontSize: "11px",
              color: "var(--allura-gray-500)",
              fontFamily: '"IBM Plex Mono", monospace',
              flexShrink: 0,
            }}
          >
            smart
          </span>
        </div>
      </div>

      {/* Type filter pills — only shown for sub-views that allow free filtering */}
      {SUB_VIEW_TYPE_MAP[activeSubView] === null && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "20px",
          }}
          role="group"
          aria-label="Filter by entity type"
        >
          <button
            type="button"
            onClick={() => setSelectedTypes([])}
            style={{
              padding: "4px 12px",
              borderRadius: "var(--allura-r-full, 999px)",
              fontSize: "12px",
              fontWeight: selectedTypes.length === 0 ? 700 : 500,
              cursor: "pointer",
              border: "1px solid",
              borderColor: selectedTypes.length === 0 ? "var(--allura-blue)" : "var(--dashboard-border)",
              background: selectedTypes.length === 0 ? "var(--allura-blue)" : "transparent",
              color: selectedTypes.length === 0 ? "var(--allura-white)" : "var(--allura-gray-500)",
              transition: "all 0.12s ease",
              fontFamily: '"IBM Plex Sans", sans-serif',
            }}
            aria-pressed={selectedTypes.length === 0}
          >
            All
          </button>
          {ALL_TYPES.map(({ type, label }) => {
            const active = selectedTypes.includes(type)
            const color = TYPE_COLORS[type]
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--allura-r-full, 999px)",
                  fontSize: "12px",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: active ? color : "var(--dashboard-border)",
                  background: active ? `${color}18` : "transparent",
                  color: active ? color : "var(--allura-gray-500)",
                  transition: "all 0.12s ease",
                  fontFamily: '"IBM Plex Sans", sans-serif',
                }}
                aria-pressed={active}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
      {/* For fixed sub-views (memories, processes, etc.) show the active scope pill */}
      {SUB_VIEW_TYPE_MAP[activeSubView] !== null && (
        <div style={{ marginBottom: "20px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {(SUB_VIEW_TYPE_MAP[activeSubView] as SearchResultType[]).map((type) => {
            const color = TYPE_COLORS[type]
            const label = ALL_TYPES.find((t) => t.type === type)?.label ?? type
            return (
              <span
                key={type}
                style={{
                  padding: "4px 12px",
                  borderRadius: "var(--allura-r-full, 999px)",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: `1px solid ${color}30`,
                  background: `${color}18`,
                  color,
                  fontFamily: '"IBM Plex Sans", sans-serif',
                }}
              >
                {label}
              </span>
            )
          })}
        </div>
      )}

      {/* Results area */}
      {error && (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            background: "rgba(220, 38, 38, 0.06)",
            border: "1px solid rgba(220, 38, 38, 0.2)",
            borderRadius: "var(--allura-r-md, 8px)",
            marginBottom: "16px",
            fontSize: "13px",
            color: "var(--allura-error-inline)",
          }}
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div
          style={{
            background: "var(--allura-paper)",
            borderRadius: "var(--allura-r-md, 8px)",
            border: "1px solid var(--allura-cream)",
            overflow: "hidden",
          }}
        >
          <ResultSkeleton />
        </div>
      ) : showResults && results.length > 0 ? (
        <div
          style={{
            background: "var(--allura-paper)",
            borderRadius: "var(--allura-r-md, 8px)",
            border: "1px solid var(--allura-cream)",
            overflow: "hidden",
          }}
          role="list"
          aria-label={`${results.length} search result${results.length !== 1 ? "s" : ""}`}
        >
          {/* Result count header */}
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid var(--allura-cream)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                color: "var(--allura-gray-500)",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{debouncedQuery}&rdquo;
            </span>
            <span
              style={{
                fontSize: "11px",
                color: "var(--allura-gray-500)",
                fontFamily: '"IBM Plex Mono", monospace',
              }}
            >
              scope: {DEFAULT_GROUP_ID}
            </span>
          </div>
          {results.map((result) => (
            <div key={`${result.type}:${result.id}`} role="listitem">
              <ResultItem result={result} />
            </div>
          ))}
        </div>
      ) : (
        !error && <EmptyState query={debouncedQuery} />
      )}

      {/* Keyframe styles */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border-width: 0;
        }
      `}</style>
    </div>
  )
}
