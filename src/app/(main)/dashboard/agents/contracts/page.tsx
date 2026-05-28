"use client"

import { ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"

// HITL mode badge colors are data-viz semantic indicators — not brand tokens.
// strict = green (safe/gated), YOLO = red (ungated), off = gray (disabled).
type HitlMode = "strict" | "YOLO" | "off"

const HITL_COLOR: Record<HitlMode, string> = {
  strict: "#16a34a",
  YOLO:   "#dc2626",
  off:    "#6b7280",
}

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

interface AgentContract {
  hitlMode: HitlMode
  groupId: string
  allowedTools: string[]
  deniedTools: string[]
}

function deriveContract(agent: Agent): AgentContract {
  // Tool restrictions per agent-routing.md
  const DENIED: Record<string, string[]> = {
    pike:  ["Write", "Edit", "Bash", "Agent"],
    scout: ["Write", "Edit", "Bash", "Agent"],
  }
  const hitlMode: HitlMode =
    agent.id === "woz" ? "YOLO" :
    agent.id === "hightower" ? "strict" :
    "strict"

  const denied = DENIED[agent.id] ?? []
  const allTools = ["Read", "Edit", "Write", "Bash", "Agent", "Grep", "Glob"]
  const allowed = allTools.filter((t) => !denied.includes(t))

  return { hitlMode, groupId: "allura-system", allowedTools: allowed, deniedTools: denied }
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function SkeletonRow() {
  return (
    <div className="rounded-lg border border-[var(--allura-gray-200)] bg-white p-5 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-[var(--allura-gray-100)]" />
        <div className="space-y-1.5">
          <div className="h-4 w-28 rounded bg-[var(--allura-gray-100)]" />
          <div className="h-3 w-40 rounded bg-[var(--allura-gray-100)]" />
        </div>
      </div>
      <div className="h-3 w-64 rounded bg-[var(--allura-gray-100)]" />
    </div>
  )
}

export default function AgentContractsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => setAgents(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--dashboard-text-primary)]">
          Agent Contracts
        </h1>
        <p className="text-sm text-[var(--dashboard-text-secondary)]">
          Permissions and governance rules for each agent
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--allura-gray-500)]">
            <ShieldCheck className="h-8 w-8 mb-3" />
            <p className="text-sm">No agents found</p>
          </div>
        ) : (
          agents.map((agent) => {
            const contract = deriveContract(agent)
            return (
              <div
                key={agent.id}
                className="rounded-lg border border-[var(--allura-gray-200)] bg-white p-5 space-y-4"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                      style={{ backgroundColor: "var(--allura-blue)" }}
                    >
                      {initials(agent.name)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--dashboard-text-primary)]">
                        {agent.name}
                      </p>
                      <p className="text-xs text-[var(--dashboard-text-secondary)]">{agent.model}</p>
                    </div>
                  </div>
                  {/* Status dot */}
                  <span className="flex items-center gap-1.5 text-xs text-[var(--allura-gray-500)]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          agent.status === "active" ? "#16a34a" :
                          agent.status === "idle"   ? "#b45309" : "#6b7280",
                      }}
                    />
                    {agent.status}
                  </span>
                </div>

                {/* Contract metadata row */}
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-[var(--allura-gray-500)] uppercase tracking-wide">HITL Mode</p>
                    <span
                      className="inline-block rounded px-2 py-0.5 font-semibold text-white"
                      style={{ backgroundColor: HITL_COLOR[contract.hitlMode] }}
                    >
                      {contract.hitlMode}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-[var(--allura-gray-500)] uppercase tracking-wide">Group ID</p>
                    <p className="font-mono text-[var(--dashboard-text-primary)]">{contract.groupId}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-[var(--allura-gray-500)] uppercase tracking-wide">Skills</p>
                    <p className="text-[var(--dashboard-text-primary)]">
                      {agent.skills.length > 0 ? `${agent.skills.length} assigned` : "none assigned"}
                    </p>
                  </div>
                </div>

                {/* Tools */}
                <div className="space-y-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 font-medium text-[var(--allura-gray-500)]">Allowed</span>
                    {contract.allowedTools.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-[var(--allura-gray-100)] px-1.5 py-0.5 text-[var(--dashboard-text-primary)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {contract.deniedTools.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-14 shrink-0 font-medium text-[var(--allura-gray-500)]">Denied</span>
                      {contract.deniedTools.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit button — Phase 2 */}
                <div>
                  <button
                    type="button"
                    disabled
                    title="Contract editing coming in Phase 2"
                    className="rounded-md border border-[var(--allura-gray-200)] px-3 py-1.5 text-xs font-medium text-[var(--allura-gray-500)] cursor-not-allowed opacity-50"
                  >
                    Edit Contract
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
