"use client"

/**
 * KnowledgeGraphCards — the full interactive Knowledge Hive client component.
 *
 * Three-column layout:
 *   [Filters] [React Flow Canvas] [Inspector]
 *
 * Two modes:
 *   Platform Hive — always-available seed data showing Allura architecture
 *   Live Memory   — live Neo4j data from /api/memory/graph
 */

import type { ReactElement } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { GraphCanvas } from "@/components/graph/graph-canvas"
import { GraphFiltersPanel, defaultFilters } from "@/components/graph/graph-filters"
import type { GraphFilters } from "@/components/graph/graph-filters"
import { GraphInspector } from "@/components/graph/graph-inspector"
import { GraphLegend } from "@/components/graph/graph-legend"
import { PLATFORM_NODES, PLATFORM_EDGES } from "@/lib/graph/platform-seed"
import { mapApiResponse } from "@/lib/graph/map-neo4j"
import type { GraphNode, GraphEdge, NodeCategory } from "@/lib/graph/types"

type HiveMode = "platform" | "live"

// ── Fetch live data ────────────────────────────────────────────────────────

interface LiveState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  loading: boolean
  error: string | null
  degraded: boolean
}

function useLiveGraph(groupId: string, retryKey: number): LiveState {
  const [state, setState] = useState<LiveState>({
    nodes: [],
    edges: [],
    loading: false,
    error: null,
    degraded: false,
  })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    async function load(): Promise<void> {
      try {
        const res = await fetch(
          `/api/memory/graph?group_id=${encodeURIComponent(groupId)}`,
          {
            headers: { "x-allura-group-id": groupId },
            signal: controller.signal,
          }
        )
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        const data = await res.json() as Parameters<typeof mapApiResponse>[0]
        if (cancelled) return
        const mapped = mapApiResponse(data)
        setState({
          nodes: mapped.nodes,
          edges: mapped.edges,
          loading: false,
          error: null,
          degraded: Boolean(data.degraded),
        })
      } catch (err) {
        if (cancelled) return
        const isAbort = err instanceof Error && err.name === "AbortError"
        setState({
          nodes: [],
          edges: [],
          loading: false,
          error: isAbort
            ? "Request timed out — retry"
            : err instanceof Error
            ? err.message
            : "Failed to load graph",
          degraded: true,
        })
      } finally {
        clearTimeout(timeout)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, retryKey])

  return state
}

// ── Mode toggle ────────────────────────────────────────────────────────────

type GraphModeLabel = "Platform Hive" | "Live Memory" | "Catalog"
const GRAPH_MODES: { label: GraphModeLabel; value: HiveMode; icon: string }[] = [
  { label: "Platform Hive", value: "platform", icon: "⬡" },
  { label: "Live Memory", value: "live", icon: "◎" },
]

function ModeToggle({
  mode,
  onChange,
}: {
  mode: HiveMode
  onChange: (m: HiveMode) => void
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: "var(--c-card)",
        border: "1px solid var(--c-border)",
        borderRadius: 12,
        padding: 4,
      }}
    >
      {GRAPH_MODES.map(({ label, value, icon }) => {
        const active = mode === value
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              height: 34,
              padding: "0 14px",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "var(--sans)",
              fontSize: 13,
              fontWeight: 600,
              background: active ? "var(--c-ink)" : "transparent",
              color: active ? "#fff" : "var(--c-muted)",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Empty / error states ───────────────────────────────────────────────────

function LiveEmptyState({
  degraded,
  groupId,
  onRetry,
}: {
  degraded: boolean
  groupId: string
  onRetry: () => void
}): ReactElement {
  if (degraded) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          textAlign: "center",
          padding: 30,
        }}
      >
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "var(--c-red-soft)",
            color: "var(--c-red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </span>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--c-ink)" }}>Couldn&apos;t draw the graph</div>
        <div style={{ fontSize: 14, color: "var(--c-muted)", maxWidth: 340 }}>
          Neo4j did not respond. We won&apos;t show a guessed layout. Switch to Platform Hive to see the architecture.
        </div>
        <button
          onClick={onRetry}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "0 18px",
            height: 40,
            borderRadius: 10,
            border: "1px solid var(--c-border)",
            background: "var(--c-card)",
            color: "var(--c-ink)",
            cursor: "pointer",
            fontFamily: "var(--sans)",
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
        padding: 30,
      }}
    >
      <span
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background: "var(--c-blue-soft)",
          color: "var(--c-blue)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" />
          <circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
          <path d="M9.5 10.5 5.5 7.5M14.5 10.5l4-3M9.5 13.5 5.5 16.5M14.5 13.5l4 3" />
        </svg>
      </span>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--c-ink)" }}>The hive is empty</div>
      <div style={{ fontSize: 14, color: "var(--c-muted)", maxWidth: 340 }}>
        No canonical nodes for <strong>{groupId}</strong> yet. As memories are approved and agents connect, they appear here.
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function KnowledgeGraphCards({ groupId }: { groupId: string }): ReactElement {
  const [mode, setMode] = useState<HiveMode>("platform")
  const [retryKey, setRetryKey] = useState(0)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [filters, setFilters] = useState<GraphFilters>(defaultFilters())

  const liveState = useLiveGraph(groupId, retryKey)

  // Pick data source
  const rawNodes: GraphNode[] = mode === "platform" ? PLATFORM_NODES : liveState.nodes
  const rawEdges: GraphEdge[] = mode === "platform" ? PLATFORM_EDGES : liveState.edges

  // Apply filters
  const filteredNodes = useMemo<GraphNode[]>(() => {
    return rawNodes.filter((n) => {
      if (filters.categories.size > 0 && !filters.categories.has(n.type)) return false
      if (filters.statuses.size > 0 && n.status && !filters.statuses.has(n.status)) return false
      if (filters.riskLevels.size > 0 && n.riskLevel && !filters.riskLevels.has(n.riskLevel)) return false
      return true
    })
  }, [rawNodes, filters])

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  )

  const filteredEdges = useMemo<GraphEdge[]>(
    () => rawEdges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)),
    [rawEdges, filteredNodeIds]
  )

  const availableCategories = useMemo<Set<NodeCategory>>(
    () => new Set(rawNodes.map((n) => n.type)),
    [rawNodes]
  )

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node)
  }, [])

  const isLiveLoading = mode === "live" && liveState.loading
  const isLiveEmpty = mode === "live" && !liveState.loading && liveState.nodes.length === 0
  const showCanvas = !isLiveLoading && !isLiveEmpty

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        flex: 1,
        minHeight: 0,
        fontFamily: "var(--sans)",
      }}
    >
      {/* Top bar: mode toggle + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <ModeToggle
          mode={mode}
          onChange={(m) => {
            setMode(m)
            setSelectedNode(null)
            setFilters(defaultFilters())
          }}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {mode === "live" && liveState.degraded && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 999,
                background: "var(--c-red-soft)",
                color: "var(--c-red)",
              }}
            >
              Neo4j degraded
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "var(--mono)" }}>
            {filteredNodes.length} nodes · {filteredEdges.length} connections
          </span>
        </div>
      </div>

      {/* Three-column layout: 204px | 1fr | 320px */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "204px 1fr 320px",
          gap: 14,
          flex: 1,
          minHeight: 0,
          alignItems: "start",
        }}
      >
        {/* LEFT: filters + legend */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            overflowY: "auto",
            maxHeight: "100%",
          }}
          className="scry"
        >
          <div
            style={{
              background: "var(--c-card)",
              border: "1px solid var(--c-border)",
              borderRadius: 14,
              padding: "15px 15px 17px",
            }}
          >
            <GraphFiltersPanel
              filters={filters}
              onChange={setFilters}
              availableCategories={availableCategories}
            />
          </div>
          <div
            style={{
              background: "var(--c-card)",
              border: "1px solid var(--c-border)",
              borderRadius: 14,
              padding: 15,
            }}
          >
            <GraphLegend />
          </div>
        </div>

        {/* CENTER: canvas hero — dot grid background */}
        <div
          style={{
            position: "relative",
            background: "#fcf9f1",
            backgroundImage: "radial-gradient(#e7dfcd 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            border: "1px solid var(--c-border)",
            borderRadius: 16,
            overflow: "hidden",
            minHeight: 660,
          }}
        >
          {/* Mode label chip */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,253,248,0.93)",
              border: "1px solid var(--c-border)",
              borderRadius: 20,
              padding: "6px 12px",
              backdropFilter: "blur(4px)",
            }}
          >
            <span
              style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--c-orange)" }}
              aria-hidden="true"
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-ink)" }}>
              {mode === "platform" ? "Platform Hive" : "Live Memory"}
            </span>
          </div>

          {/* Loading spinner */}
          {isLiveLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                zIndex: 10,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  border: "3px solid var(--c-border)",
                  borderTopColor: "var(--c-blue)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  display: "inline-block",
                }}
              />
              <div style={{ fontSize: 14, color: "var(--c-muted)" }}>Building the hive…</div>
            </div>
          )}

          {/* Empty / error overlay */}
          {isLiveEmpty && (
            <LiveEmptyState
              degraded={liveState.degraded}
              groupId={groupId}
              onRetry={() => setRetryKey((k) => k + 1)}
            />
          )}

          {/* React Flow canvas */}
          {showCanvas && (
            <GraphCanvas
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </div>

        {/* RIGHT: inspector */}
        <div
          style={{
            background: "var(--c-card)",
            border: "1px solid var(--c-border)",
            borderRadius: 16,
            overflow: "hidden",
            position: "sticky",
            top: 0,
          }}
        >
          {selectedNode ? (
            <GraphInspector
              node={selectedNode}
              edges={filteredEdges}
              nodes={filteredNodes}
              onClose={() => setSelectedNode(null)}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "60px 26px",
                textAlign: "center",
                minHeight: 400,
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 13,
                  background: "#f1ece0",
                  color: "var(--c-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-hidden="true"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--c-ink)" }}>Pick a card</div>
              <div style={{ fontSize: 12.5, color: "var(--c-muted)", lineHeight: 1.5 }}>
                Click any card in the hive to see its owner, risk, connections, and evidence here.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
