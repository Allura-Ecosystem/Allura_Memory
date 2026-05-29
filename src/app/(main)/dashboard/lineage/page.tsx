"use client"

import { format, formatDistanceToNow } from "date-fns"
import {
  ArrowRight,
  Brain,
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DURHAM_GRADIENTS } from "@/lib/brand/durham"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemoryTrace {
  id: string
  group_id: string
  type: string
  content: string
  agent: string
  timestamp: string
  metadata: Record<string, unknown>
}

interface LineageChain {
  root: MemoryTrace
  derived: MemoryTrace[]
  promotedToSemantic: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function traceSourceLabel(type: string): string {
  switch (type.toLowerCase()) {
    case "memory":
      return "Episodic Capture"
    case "decision":
      return "Decision Record"
    case "action":
      return "Agent Action"
    case "prompt":
      return "Prompt Trace"
    default:
      return type.charAt(0).toUpperCase() + type.slice(1)
  }
}

function traceSourceIcon(type: string): React.ReactNode {
  switch (type.toLowerCase()) {
    case "memory":
      return <Brain className="size-4" />
    case "decision":
      return <Sparkles className="size-4" />
    case "action":
      return <GitBranch className="size-4" />
    default:
      return <Database className="size-4" />
  }
}

function traceStoreLabel(metadata: Record<string, unknown>): string {
  if (metadata?.promoted || metadata?.store === "semantic") return "Semantic (Neo4j)"
  if (metadata?.store === "vector") return "Vector (RuVector)"
  return "Episodic (PostgreSQL)"
}

function traceStoreBadgeClass(metadata: Record<string, unknown>): string {
  if (metadata?.promoted || metadata?.store === "semantic") {
    return "border-[--durham-status-success-border] bg-[--durham-status-success-bg] text-[--durham-status-success-text]"
  }
  if (metadata?.store === "vector") {
    return "border-[--durham-confidence-border] bg-[--durham-confidence-bg] text-[--durham-confidence-text]"
  }
  return "border-[--durham-status-default-border] bg-[--durham-status-default-bg] text-[--durham-status-default-text]"
}

// ── Build lineage chains from flat trace list ─────────────────────────────────
// Groups traces by agent+type into logical lineage chains.
// Each chain shows how a trace type evolved across agent sessions.

function buildLineageChains(traces: MemoryTrace[]): LineageChain[] {
  if (traces.length === 0) return []

  // Group by agent + type to form chains
  const groups = new Map<string, MemoryTrace[]>()
  for (const trace of traces) {
    const key = `${trace.agent}:${trace.type}`
    const existing = groups.get(key) ?? []
    existing.push(trace)
    groups.set(key, existing)
  }

  const chains: LineageChain[] = []
  for (const [, group] of groups) {
    const sorted = [...group].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
    const [root, ...derived] = sorted
    if (!root) continue
    const promotedToSemantic = group.some(
      (t) => t.metadata?.promoted || t.metadata?.store === "semantic"
    )
    chains.push({ root, derived, promotedToSemantic })
  }

  // Sort chains: promoted first, then by root timestamp desc
  return chains.sort((a, b) => {
    if (a.promotedToSemantic && !b.promotedToSemantic) return -1
    if (!a.promotedToSemantic && b.promotedToSemantic) return 1
    return new Date(b.root.timestamp).getTime() - new Date(a.root.timestamp).getTime()
  })
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

interface LineageStats {
  total: number
  promoted: number
  chains: number
  agents: number
}

function computeStats(traces: MemoryTrace[], chains: LineageChain[]): LineageStats {
  return {
    total: traces.length,
    promoted: chains.filter((c) => c.promotedToSemantic).length,
    chains: chains.length,
    agents: new Set(traces.map((t) => t.agent)).size,
  }
}

// ── Chain card ────────────────────────────────────────────────────────────────

function LineageChainCard({ chain }: { chain: LineageChain }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="border-[--durham-border] bg-white/88 shadow-sm">
      <button
        type="button"
        className="w-full p-5 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            {/* Type + promotion badge row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-[--durham-rich-navy]">
                {traceSourceIcon(chain.root.type)}
                {traceSourceLabel(chain.root.type)}
              </span>
              <Badge
                variant="outline"
                className={traceStoreBadgeClass(
                  chain.promotedToSemantic ? { promoted: true } : chain.root.metadata
                )}
              >
                {chain.promotedToSemantic ? "Promoted to Semantic" : traceStoreLabel(chain.root.metadata)}
              </Badge>
              {chain.derived.length > 0 && (
                <Badge
                  variant="outline"
                  className="border-[--durham-border] bg-white font-normal text-[--durham-muted-text]"
                >
                  {chain.derived.length} revision{chain.derived.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>

            {/* Content preview */}
            <p className="max-w-2xl text-sm text-[--durham-deep-graphite] leading-5 line-clamp-2">
              {chain.root.content || "(no content)"}
            </p>

            {/* Meta row */}
            <div className="flex flex-wrap gap-4 text-xs text-[--durham-muted-text]">
              <span>Agent: {chain.root.agent}</span>
              <span>Origin: {format(new Date(chain.root.timestamp), "PPP p")}</span>
              <span>{formatDistanceToNow(new Date(chain.root.timestamp), { addSuffix: true })}</span>
            </div>
          </div>

          {/* Expand toggle */}
          <div className="flex items-center gap-2 text-sm font-medium text-[--durham-rich-navy]">
            {chain.derived.length > 0 ? (
              <>
                <span>{expanded ? "Hide lineage" : "Show lineage"}</span>
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </>
            ) : (
              <span className="text-[--durham-muted-text] text-xs">No revisions</span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded lineage chain */}
      {expanded && chain.derived.length > 0 && (
        <div className="border-t border-[--durham-inner-border] px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[--durham-amber-ochre]">
            Lineage chain
          </p>
          <div className="space-y-2">
            {/* Root node */}
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-[--durham-rich-navy] text-white">
                <span className="text-[10px] font-bold">1</span>
              </div>
              <div className="flex-1 rounded-lg border border-[--durham-border] bg-[--durham-panel-subtle] p-3">
                <p className="text-xs font-medium text-[--durham-deep-graphite]">Origin trace</p>
                <p className="mt-1 text-xs text-[--durham-muted-text] line-clamp-2">
                  {chain.root.content || "(no content)"}
                </p>
                <p className="mt-1 text-xs text-[--durham-caption-text]">
                  {format(new Date(chain.root.timestamp), "PPP p")}
                </p>
              </div>
            </div>

            {/* Derived nodes */}
            {chain.derived.map((trace, index) => (
              <div key={trace.id} className="flex items-start gap-3">
                <div className="relative flex flex-col items-center">
                  <div className="absolute -top-2 h-2 w-px bg-[--durham-border]" />
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[--durham-steel-blue] text-white">
                    <span className="text-[10px] font-bold">{index + 2}</span>
                  </div>
                </div>
                <div className="flex-1 rounded-lg border border-[--durham-border] bg-[--durham-panel-subtle] p-3">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="size-3 text-[--durham-steel-blue]" />
                    <p className="text-xs font-medium text-[--durham-deep-graphite]">
                      Revision {index + 1}
                    </p>
                    {index === chain.derived.length - 1 && chain.promotedToSemantic && (
                      <Badge
                        variant="outline"
                        className="border-[--durham-status-success-border] bg-[--durham-status-success-bg] text-[--durham-status-success-text] text-[10px] px-1.5 py-0"
                      >
                        Promoted
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[--durham-muted-text] line-clamp-2">
                    {trace.content || "(no content)"}
                  </p>
                  <p className="mt-1 text-xs text-[--durham-caption-text]">
                    {format(new Date(trace.timestamp), "PPP p")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MemoryLineagePage() {
  const [traces, setTraces] = useState<MemoryTrace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTraces = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/memory/traces?group_id=${encodeURIComponent(DEFAULT_GROUP_ID)}&limit=200`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { traces?: MemoryTrace[] }
      setTraces(data.traces ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memory traces")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTraces()
  }, [loadTraces])

  const chains = useMemo(() => buildLineageChains(traces), [traces])
  const stats = useMemo(() => computeStats(traces, chains), [traces, chains])

  return (
    <div className="min-h-screen" style={{ backgroundImage: DURHAM_GRADIENTS.page }}>
      <div className="space-y-6 rounded-[28px] border border-white/70 bg-white/74 p-4 shadow-[--durham-shadow-base]/8 shadow-xl backdrop-blur sm:p-6">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold tracking-[0.28em] text-[--durham-amber-ochre] uppercase">
              Memory lineage
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-[--durham-deep-graphite]">
              How knowledge evolves.
            </h1>
            <p className="text-sm leading-6 text-[--durham-muted-text]">
              Trace how raw episodic captures become semantic knowledge. Each chain shows the
              origin trace, any revisions, and whether it was promoted to the canonical graph.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadTraces}
            disabled={loading}
            className="border-[--durham-border-light] bg-white/90 text-[--durham-rich-navy] hover:bg-[--durham-hover-amber-bg]"
          >
            <RefreshCw className={`mr-1 size-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Stats row ── */}
        {!loading && traces.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total traces", value: stats.total, icon: <Layers className="size-4" /> },
              { label: "Lineage chains", value: stats.chains, icon: <GitBranch className="size-4" /> },
              { label: "Promoted", value: stats.promoted, icon: <Sparkles className="size-4" /> },
              { label: "Agents tracked", value: stats.agents, icon: <Brain className="size-4" /> },
            ].map((stat) => (
              <Card
                key={stat.label}
                className="border-[--durham-border] bg-white/85 shadow-sm"
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="text-[--durham-amber-ochre]">{stat.icon}</span>
                  <div>
                    <p className="text-lg font-semibold text-[--durham-deep-graphite]">{stat.value}</p>
                    <p className="text-xs text-[--durham-muted-text]">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Legend ── */}
        <Card className="border-[--durham-border] bg-white/85 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-[--durham-deep-graphite]">
              <GitBranch className="size-4 text-[--durham-amber-ochre]" />
              Reading the lineage
            </CardTitle>
            <CardDescription className="text-[--durham-muted-text]">
              Each card represents a lineage chain — traces from the same agent and type, ordered by time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-xs text-[--durham-secondary-text]">
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-[--durham-rich-navy]" />
              Episodic (raw trace, PostgreSQL)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-[--durham-status-success-text]" />
              Promoted to semantic (Neo4j canonical graph)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-[--durham-confidence-text]" />
              Vector-indexed (RuVector hybrid search)
            </div>
          </CardContent>
        </Card>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-[--durham-muted-text]">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading memory lineage…
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && chains.length === 0 && !error && (
          <Card className="border-[--durham-border] bg-white/80 p-8 text-center shadow-sm">
            <GitBranch className="mx-auto mb-3 size-8 text-[--durham-border]" />
            <p className="text-sm font-medium text-[--durham-deep-graphite]">No lineage chains found</p>
            <p className="mt-1 text-xs text-[--durham-muted-text]">
              Traces will appear here once agents begin logging to the episodic store.
            </p>
          </Card>
        )}

        {/* ── Lineage chains ── */}
        {!loading && chains.length > 0 && (
          <div className="space-y-3">
            {chains.map((chain) => (
              <LineageChainCard key={`${chain.root.agent}:${chain.root.type}:${chain.root.id}`} chain={chain} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
