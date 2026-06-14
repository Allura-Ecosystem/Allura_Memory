// ── Team RAM agent roster ────────────────────────────────────────────────────
// This module is intentionally plain (no "use server") so it can be imported
// by both server components/actions AND client components without violating the
// Next.js rule that "use server" files may only export async functions.

export const TEAM_RAM_AGENTS = [
  "brooks",
  "woz",
  "scout",
  "knuth",
  "bellard",
  "carmack",
  "fowler",
  "pike",
  "hightower",
  "jobs",
] as const

export type TeamRamAgent = (typeof TEAM_RAM_AGENTS)[number]

// ── Response types ────────────────────────────────────────────────────────────

export type AgentState = "active" | "idle" | "blocked"

export interface AgentStatus {
  agentId: TeamRamAgent
  state: AgentState
  /** run ID if currently active */
  activeRunId: string | null
  /** definition name for the active run */
  activeRunName: string | null
  /** 0-based current step index */
  currentStep: number | null
  /** total step count from state_json (may be null if unavailable) */
  totalSteps: number | null
  /** elapsed ms since run started */
  elapsedMs: number | null
  /** most recent event_type for this agent in last 30 min */
  lastEventType: string | null
  /** ISO timestamp of latest event */
  lastEventAt: string | null
}

export interface TimelineBucket {
  /** agent id */
  agentId: string
  /** minute offset from windowStart (0-based, 30 buckets) */
  minuteOffset: number
  /** number of events in this minute */
  eventCount: number
}

export interface RunSummary {
  id: string
  definitionName: string
  status: string
  actorId: string | null
  startedAt: string
}

export interface ExecutionOverview {
  agents: AgentStatus[]
  timeline: TimelineBucket[]
  activeRuns: RunSummary[]
  /** ISO timestamp of data fetch */
  fetchedAt: string
  /** true if postgres was reachable */
  online: boolean
}
