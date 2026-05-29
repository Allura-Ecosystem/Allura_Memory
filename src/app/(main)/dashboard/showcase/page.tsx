"use client"

import { Activity, Brain, Code2, GitBranch, Loader2, Search, Server, Settings2, Shield, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DURHAM_GRADIENTS } from "@/lib/brand/durham"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string
  name: string
  model: string
  description: string
  skills: string[]
  eventCount: number
  lastActive: string | null
  status: "active" | "idle" | "offline"
}

// ── Static persona enrichment ─────────────────────────────────────────────────
// Each Team RAM member gets a persona layer on top of the API data.

const PERSONA_MAP: Record<
  string,
  { persona: string; role: string; specialty: string; icon: React.ReactNode; accentColor: string }
> = {
  brooks: {
    persona: "Frederick Brooks",
    role: "Chief Architect",
    specialty: "Conceptual integrity, architecture contracts, task routing",
    icon: <Brain className="size-5" />,
    accentColor: "#2c3e56",
  },
  jobs: {
    persona: "Steve Jobs",
    role: "Intent Gate",
    specialty: "Scope control, acceptance criteria, product clarity",
    icon: <Zap className="size-5" />,
    accentColor: "#b8893c",
  },
  woz: {
    persona: "Steve Wozniak",
    role: "Primary Builder",
    specialty: "Autonomous implementation, ships working code, clean diffs",
    icon: <Code2 className="size-5" />,
    accentColor: "#2a5e3d",
  },
  pike: {
    persona: "Rob Pike",
    role: "Interface Gate",
    specialty: "API surface review, concurrency safety, simplicity veto",
    icon: <Shield className="size-5" />,
    accentColor: "#4e6e8a",
  },
  bellard: {
    persona: "Fabrice Bellard",
    role: "Performance Diagnostics",
    specialty: "Measurement-first, low-level optimization, correctness under constraints",
    icon: <Zap className="size-5" />,
    accentColor: "#7a3a3a",
  },
  carmack: {
    persona: "John Carmack",
    role: "Performance Specialist",
    specialty: "API design, latency reduction, real-time systems",
    icon: <Activity className="size-5" />,
    accentColor: "#6a3a7a",
  },
  fowler: {
    persona: "Martin Fowler",
    role: "Maintainability Gate",
    specialty: "Incremental change, refactoring, design drift documentation",
    icon: <GitBranch className="size-5" />,
    accentColor: "#4a5e6d",
  },
  knuth: {
    persona: "Donald Knuth",
    role: "Data Architect",
    specialty: "PostgreSQL, Neo4j, query optimization, schema correctness",
    icon: <Server className="size-5" />,
    accentColor: "#5e4a2a",
  },
  hightower: {
    persona: "Kelsey Hightower",
    role: "Infrastructure Lead",
    specialty: "CI/CD, IaC, container orchestration, observability",
    icon: <Settings2 className="size-5" />,
    accentColor: "#3a5a4a",
  },
  scout: {
    persona: "Scout",
    role: "Recon & Discovery",
    specialty: "Fast codebase search, pattern grep, config discovery",
    icon: <Search className="size-5" />,
    accentColor: "#546272",
  },
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusDotColor(status: Agent["status"]): string {
  switch (status) {
    case "active":
      return "rgb(22, 163, 74)"
    case "idle":
      return "rgb(180, 83, 9)"
    default:
      return "rgb(107, 114, 128)"
  }
}

function statusLabel(status: Agent["status"]): string {
  switch (status) {
    case "active":
      return "Online"
    case "idle":
      return "Idle"
    default:
      return "Offline"
  }
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ShowcaseSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-[--durham-border] bg-white/80 p-6 space-y-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-[--durham-mist]" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-3/4 rounded bg-[--durham-mist]" />
              <div className="h-3 w-1/2 rounded bg-[--durham-mist]" />
            </div>
          </div>
          <div className="h-3 w-full rounded bg-[--durham-mist]" />
          <div className="h-3 w-5/6 rounded bg-[--durham-mist]" />
        </div>
      ))}
    </div>
  )
}

// ── Agent showcase card ────────────────────────────────────────────────────────

function AgentShowcaseCard({ agent }: { agent: Agent }) {
  const persona = PERSONA_MAP[agent.id.toLowerCase()]
  const accentColor = persona?.accentColor ?? "#2c3e56"

  return (
    <Card className="border-[--durham-border] bg-white/88 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6 space-y-4">
        {/* Header row */}
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            {persona?.icon ?? <Brain className="size-5" />}
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-[--durham-deep-graphite] truncate">
                {agent.name}
              </h3>
              <span className="flex items-center gap-1.5 shrink-0 text-xs text-[--durham-muted-text]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: statusDotColor(agent.status) }}
                />
                {statusLabel(agent.status)}
              </span>
            </div>
            {persona && (
              <p className="text-xs text-[--durham-amber-ochre] font-medium mt-0.5">
                {persona.persona}
              </p>
            )}
            <p className="text-xs text-[--durham-muted-text] mt-0.5 font-mono truncate">
              {agent.model}
            </p>
          </div>
        </div>

        {/* Role badge */}
        {persona && (
          <div className="flex items-center">
            <Badge
              variant="outline"
              className="border-[--durham-border] bg-[--durham-panel-subtle] text-[--durham-warm-slate] font-medium"
            >
              {persona.role}
            </Badge>
          </div>
        )}

        {/* Description / specialty */}
        <p className="text-sm text-[--durham-secondary-text] leading-5">
          {persona?.specialty ?? agent.description}
        </p>

        {/* Skills */}
        {agent.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agent.skills.slice(0, 4).map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-[--durham-border-light] bg-white px-2 py-0.5 text-[10px] text-[--durham-tertiary-text]"
              >
                {skill}
              </span>
            ))}
            {agent.skills.length > 4 && (
              <span className="rounded-md border border-[--durham-border-light] bg-white px-2 py-0.5 text-[10px] text-[--durham-tertiary-text]">
                +{agent.skills.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Activity footer */}
        <div className="flex items-center justify-between border-t border-[--durham-inner-border] pt-3 text-xs text-[--durham-caption-text]">
          <span>{agent.eventCount} events logged</span>
          {agent.lastActive && (
            <span>
              Last active {new Date(agent.lastActive).toLocaleDateString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamShowcasePage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeCount = agents.filter((a) => a.status === "active").length
  const idleCount = agents.filter((a) => a.status === "idle").length
  const totalEvents = agents.reduce((sum, a) => sum + a.eventCount, 0)

  return (
    <div className="min-h-screen" style={{ backgroundImage: DURHAM_GRADIENTS.page }}>
      <div className="space-y-8 rounded-[28px] border border-white/70 bg-white/74 p-4 shadow-[--durham-shadow-base]/8 shadow-xl backdrop-blur sm:p-6">

        {/* ── Hero ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.28em] text-[--durham-amber-ochre] uppercase">
            Team RAM
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-[--durham-deep-graphite]">
            The Allura AI Agent Team.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-[--durham-muted-text]">
            A surgical team of specialized AI agents, each owning a distinct domain. No committees —
            one architect, one intent gate, one builder, and nine domain masters. Every story
            flows through the right hands.
          </p>
        </div>

        {/* ── Stats strip ── */}
        {!loading && agents.length > 0 && (
          <div className="flex flex-wrap gap-6 border-y border-[--durham-border] py-4 text-sm text-[--durham-secondary-text]">
            <span>
              <strong className="text-[--durham-deep-graphite]">{agents.length}</strong> agents
            </span>
            <span>
              <strong className="text-[--durham-deep-graphite]">{activeCount}</strong> online now
            </span>
            <span>
              <strong className="text-[--durham-deep-graphite]">{idleCount}</strong> idle
            </span>
            <span>
              <strong className="text-[--durham-deep-graphite]">{totalEvents.toLocaleString()}</strong> events logged
            </span>
          </div>
        )}

        {/* ── Cards grid ── */}
        {loading ? (
          <ShowcaseSkeleton />
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[--durham-muted-text]">
            <Brain className="h-8 w-8 mb-3 opacity-30" />
            <p className="text-sm">No agents found. Check that the agent definition files are present.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentShowcaseCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}

        {/* ── Footer note ── */}
        <p className="text-center text-xs text-[--durham-caption-text]">
          Agent definitions live in{" "}
          <code className="rounded bg-[--durham-mist] px-1 py-0.5 font-mono">.opencode/agent/</code>.
          Activity data is pulled from the PostgreSQL events table with{" "}
          <code className="rounded bg-[--durham-mist] px-1 py-0.5 font-mono">group_id = allura-system</code>.
        </p>
      </div>
    </div>
  )
}
