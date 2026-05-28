"use client"

import { Bot, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { Agent } from "@/app/api/agents/route"

// ── Status helpers ──────────────────────────────────────────────────────────

// Data-vis exception: status dot colors are semantic indicators, not brand tokens.
const STATUS_COLOR: Record<Agent["status"], string> = {
  active: "#16a34a",
  idle: "#b45309",
  offline: "#6b7280",
}

const STATUS_LABEL: Record<Agent["status"], string> = {
  active: "Active",
  idle: "Idle",
  offline: "Offline",
}

function formatLastActive(iso: string | null): string {
  if (!iso) return "Never"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const dotColor = STATUS_COLOR[agent.status]

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[var(--allura-gray-200)] bg-[var(--allura-cream)] p-4">
      {/* Header: avatar + name + model */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--allura-blue)] text-sm font-bold text-white"
          aria-hidden="true"
        >
          {initials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--dashboard-text-primary)]">
            {agent.name}
          </p>
          <p className="truncate text-xs text-[var(--dashboard-text-secondary)]">
            {agent.model || "—"}
          </p>
        </div>
      </div>

      {/* Status dot + description */}
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-label={STATUS_LABEL[agent.status]}
        />
        <p className="line-clamp-2 text-xs text-[var(--dashboard-text-secondary)]">
          {agent.description || "No description available."}
        </p>
      </div>

      {/* Last active */}
      <p className="text-xs text-[var(--allura-gray-500)]">
        Last active: {formatLastActive(agent.lastActive)}
      </p>

      {/* Configure link */}
      <Link
        href={`/dashboard/agents/${agent.id}`}
        className="mt-auto inline-flex items-center gap-1 self-start rounded-md border border-[var(--allura-gray-200)] bg-[var(--allura-gray-100)] px-3 py-1.5 text-xs font-medium text-[var(--dashboard-text-primary)] transition-colors hover:bg-[var(--allura-gray-200)]"
      >
        Configure
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </article>
  )
}

// ── Skeleton Cards ───────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-xl border border-[var(--allura-gray-200)] p-4"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-3 w-1/3 rounded" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
      ))}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/agents")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Agent[]>
      })
      .then(setAgents)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load agents")
        setAgents([])
      })
  }, [])

  const filtered =
    agents?.filter((a) =>
      a.name.toLowerCase().includes(search.toLowerCase())
    ) ?? []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">Agents</h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">
          Configure and manage your AI agents
        </p>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search agents..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-[var(--allura-gray-200)] bg-[var(--allura-cream)] px-3 py-2 text-sm text-[var(--dashboard-text-primary)] placeholder:text-[var(--allura-gray-500)] focus:outline-none focus:ring-2 focus:ring-[var(--allura-blue)]"
      />

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Grid */}
      {agents === null ? (
        <SkeletonCards />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Bot className="h-8 w-8 text-[var(--allura-gray-500)]" aria-hidden="true" />
          <p className="text-sm text-[var(--dashboard-text-secondary)]">No agents found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
