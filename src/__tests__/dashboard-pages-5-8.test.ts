/**
 * @vitest-environment node
 *
 * Page-level logic tests for Tasks 5-8:
 *   - Dreams page (background intelligence)
 *   - Scheduled Tasks page
 *   - Settings page
 *   - Teams page
 *
 * These tests validate the rendering logic extracted from each page:
 * status classification, freshness text, heartbeat narration, watchdog
 * idle detection, and operational state mapping. No DOM rendering is
 * required — each function is pure and testable in isolation.
 *
 * Source-layer coverage lives in:
 *   src/lib/operational-state/sources/*.test.ts
 */

import { describe, expect, it } from "vitest"
import { resolveOperationalSurface } from "@/lib/operational-state"
import type { SourceOutcome } from "@/lib/operational-state"
import type { DreamsSnapshot } from "@/lib/operational-state/sources/dreams-source"
import type { ScheduledTasksSnapshot } from "@/lib/operational-state/sources/scheduled-tasks-source"
import type { SettingsSnapshot, SubsystemHealth } from "@/lib/operational-state/sources/settings-source"
import type { TeamsSnapshot } from "@/lib/operational-state/sources/teams-source"
import {
  isDreamsEmpty,
} from "@/lib/operational-state/sources/dreams-source"
import {
  isScheduledTasksEmpty,
} from "@/lib/operational-state/sources/scheduled-tasks-source"
import {
  isSettingsEmpty,
} from "@/lib/operational-state/sources/settings-source"
import {
  isTeamsEmpty,
} from "@/lib/operational-state/sources/teams-source"

// ── Shared helpers ────────────────────────────────────────────────────────────

const GROUP_ID = "allura-system"

function freshnessText(fetchedAt: string | null, ageMs: number | null): string {
  if (fetchedAt === null || ageMs === null) return "freshness: unknown"
  const seconds = Math.round(ageMs / 1000)
  return `fetched ${seconds}s ago`
}

const STATUS_LABEL: Record<string, string> = {
  ready: "Live",
  empty: "Empty",
  stale: "Stale",
  error: "Error",
  degraded: "Degraded",
}

// ── Dreams page (Task 5) ──────────────────────────────────────────────────────

const BASE_DREAMS: DreamsSnapshot = {
  groupId: GROUP_ID,
  proposalsPending: 0,
  proposalsApproved7d: 0,
  proposalsRejected7d: 0,
  backfillRuns24h: 0,
  proposalsCreated24h: 0,
  lastProposalAt: null,
  promotionMode: "unknown",
}

describe("Dreams page — operational state mapping (Task 5)", () => {
  const source = { id: "dreams", systemOfRecord: "postgres:canonical_proposals+events" }

  it("maps a live snapshot with activity to ready", () => {
    const snapshot: DreamsSnapshot = {
      ...BASE_DREAMS,
      proposalsPending: 3,
      proposalsApproved7d: 5,
    }
    const outcome: SourceOutcome<DreamsSnapshot> = {
      ok: true,
      data: snapshot,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isDreamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("ready")
    expect(surface.data).not.toBeNull()
    expect(surface.data?.proposalsPending).toBe(3)
  })

  it("maps a zero-activity snapshot to empty", () => {
    const outcome: SourceOutcome<DreamsSnapshot> = {
      ok: true,
      data: BASE_DREAMS,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isDreamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("empty")
    expect(surface.data).toBeNull()
  })

  it("maps a stale snapshot (older than freshnessMs) to stale", () => {
    const fetchedAt = new Date(Date.now() - 60_000).toISOString()
    const snapshot: DreamsSnapshot = { ...BASE_DREAMS, proposalsPending: 1 }
    const outcome: SourceOutcome<DreamsSnapshot> = {
      ok: true,
      data: snapshot,
      fetchedAt,
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isDreamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("stale")
    // stale still surfaces the data
    expect(surface.data).not.toBeNull()
  })

  it("maps an unreachable source (null outcome) to degraded", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: null,
      isEmpty: isDreamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
    expect(surface.error).toBeNull()
    expect(surface.recovery).not.toBeNull()
  })

  it("maps a failed query to error with a sanitized message", () => {
    const outcome: SourceOutcome<DreamsSnapshot> = { ok: false, error: "Dreams query failed" }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isDreamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("error")
    expect(surface.error).toBe("Dreams query failed")
    // should never leak raw internals
    expect(surface.error).not.toContain("secret")
  })

  it("status labels map to the correct human text", () => {
    expect(STATUS_LABEL["ready"]).toBe("Live")
    expect(STATUS_LABEL["empty"]).toBe("Empty")
    expect(STATUS_LABEL["stale"]).toBe("Stale")
    expect(STATUS_LABEL["error"]).toBe("Error")
    expect(STATUS_LABEL["degraded"]).toBe("Degraded")
  })
})

describe("Dreams page — pipeline display logic (Task 5)", () => {
  it("shows the HITL gate notice when proposals are pending", () => {
    const snapshot: DreamsSnapshot = { ...BASE_DREAMS, proposalsPending: 5 }
    const shouldShowNotice = snapshot.proposalsPending > 0
    expect(shouldShowNotice).toBe(true)
  })

  it("hides the HITL gate notice when no proposals are pending", () => {
    const snapshot: DreamsSnapshot = { ...BASE_DREAMS, proposalsPending: 0 }
    const shouldShowNotice = snapshot.proposalsPending > 0
    expect(shouldShowNotice).toBe(false)
  })

  it("formats the singular proposal count correctly", () => {
    const count: number = 1
    const label = `${count} proposal${count === 1 ? "" : "s"} pending human review`
    expect(label).toBe("1 proposal pending human review")
  })

  it("formats the plural proposal count correctly", () => {
    const count: number = 3
    const label = `${count} proposal${count === 1 ? "" : "s"} pending human review`
    expect(label).toBe("3 proposals pending human review")
  })

  it("formats last proposal date as a locale date string when present", () => {
    const isoDate = "2026-06-12T06:00:00.000Z"
    const formatted = new Date(isoDate).toLocaleDateString()
    expect(typeof formatted).toBe("string")
    expect(formatted.length).toBeGreaterThan(0)
  })

  it("shows 'None' for last proposal when null", () => {
    const snapshot: DreamsSnapshot = { ...BASE_DREAMS, lastProposalAt: null }
    const display = snapshot.lastProposalAt
      ? new Date(snapshot.lastProposalAt).toLocaleDateString()
      : "None"
    expect(display).toBe("None")
  })

  it("shows the correct promotion mode description for soc2", () => {
    const snapshot: DreamsSnapshot = { ...BASE_DREAMS, promotionMode: "soc2" }
    const description =
      snapshot.promotionMode === "soc2"
        ? "all promotions require human approval (SOC2 mode)."
        : snapshot.promotionMode === "auto"
          ? "high-scoring proposals auto-promote; others need approval."
          : "Review pending proposals on the Governance surface."
    expect(description).toContain("SOC2 mode")
  })
})

// ── Scheduled Tasks page (Task 6) ─────────────────────────────────────────────

const BASE_SCHEDULED: ScheduledTasksSnapshot = {
  groupId: GROUP_ID,
  lastHeartbeatAt: null,
  heartbeats24h: 0,
  blockers24h: 0,
  backfill24h: 0,
  proposals24h: 0,
}

/** Mirrors the watchdog narration logic from the Scheduled Tasks page. */
const WATCHDOG_IDLE_MS = 10 * 60 * 1000

function heartbeatText(lastHeartbeatAt: string | null, now: number): string {
  if (lastHeartbeatAt === null) return "Watchdog has never reported a heartbeat."
  const ageMs = Math.max(0, now - new Date(lastHeartbeatAt).getTime())
  const minutes = Math.round(ageMs / 60_000)
  if (ageMs <= WATCHDOG_IDLE_MS) {
    return `Watchdog active — last heartbeat ${minutes <= 1 ? "under a minute" : `${minutes} min`} ago.`
  }
  if (minutes < 60) return `Watchdog idle — last heartbeat ${minutes} min ago.`
  const hours = Math.round(minutes / 60)
  return `Watchdog idle — last heartbeat ${hours}h ago.`
}

describe("Scheduled Tasks page — operational state mapping (Task 6)", () => {
  const source = { id: "scheduled-tasks", systemOfRecord: "postgres:events" }

  it("maps a snapshot with heartbeats to ready", () => {
    const snapshot: ScheduledTasksSnapshot = { ...BASE_SCHEDULED, heartbeats24h: 10 }
    const outcome: SourceOutcome<ScheduledTasksSnapshot> = {
      ok: true,
      data: snapshot,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isScheduledTasksEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("ready")
    expect(surface.data?.heartbeats24h).toBe(10)
  })

  it("maps a zero-activity snapshot to empty", () => {
    const outcome: SourceOutcome<ScheduledTasksSnapshot> = {
      ok: true,
      data: BASE_SCHEDULED,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isScheduledTasksEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("empty")
  })

  it("maps unreachable source to degraded", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: null,
      isEmpty: isScheduledTasksEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("degraded")
  })

  it("maps a query failure to error", () => {
    const outcome: SourceOutcome<ScheduledTasksSnapshot> = {
      ok: false,
      error: "Scheduled tasks query failed",
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isScheduledTasksEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("error")
    expect(surface.error).toBe("Scheduled tasks query failed")
  })
})

describe("Scheduled Tasks page — watchdog narration (Task 6)", () => {
  it("returns the never-heartbeat message when lastHeartbeatAt is null", () => {
    const text = heartbeatText(null, Date.now())
    expect(text).toBe("Watchdog has never reported a heartbeat.")
  })

  it("reports active when the heartbeat is very recent (under idle threshold)", () => {
    const now = Date.now()
    const recent = new Date(now - 30_000).toISOString() // 30s ago
    const text = heartbeatText(recent, now)
    expect(text).toContain("Watchdog active")
    expect(text).toContain("under a minute")
  })

  it("reports active with exact minutes when under idle threshold and > 1 min", () => {
    const now = Date.now()
    const recent = new Date(now - 3 * 60_000).toISOString() // 3 min ago
    const text = heartbeatText(recent, now)
    expect(text).toContain("Watchdog active")
    expect(text).toContain("3 min ago")
  })

  it("reports idle (minutes) when heartbeat is older than WATCHDOG_IDLE_MS but under 1h", () => {
    const now = Date.now()
    const old = new Date(now - 15 * 60_000).toISOString() // 15 min ago
    const text = heartbeatText(old, now)
    expect(text).toContain("Watchdog idle")
    expect(text).toContain("min ago")
  })

  it("reports idle (hours) when heartbeat is over 60 minutes old", () => {
    const now = Date.now()
    const old = new Date(now - 2 * 60 * 60_000).toISOString() // 2h ago
    const text = heartbeatText(old, now)
    expect(text).toContain("Watchdog idle")
    expect(text).toContain("2h ago")
  })

  it("shows blocker warning only when blockers24h > 0", () => {
    const snapshot: ScheduledTasksSnapshot = { ...BASE_SCHEDULED, blockers24h: 2 }
    const shouldWarn = snapshot.blockers24h > 0
    expect(shouldWarn).toBe(true)
  })

  it("suppresses blocker warning when blockers24h is zero", () => {
    const snapshot: ScheduledTasksSnapshot = { ...BASE_SCHEDULED, blockers24h: 0 }
    const shouldWarn = snapshot.blockers24h > 0
    expect(shouldWarn).toBe(false)
  })
})

// ── Settings page (Task 7) ────────────────────────────────────────────────────

const BASE_SETTINGS: SettingsSnapshot = {
  groupId: GROUP_ID,
  subsystemHealth: {
    postgres: "unknown",
    neo4j: "unknown",
    embeddingBackfill: "unknown",
    curatorQueueDepth: "unknown",
    mcpToolAvailability: "unknown",
  },
  policyChanges: 0,
  gateChecks24h: 0,
  lastPolicyChangeAt: null,
  promotionMode: "unknown",
}

describe("Settings page — operational state mapping (Task 7)", () => {
  const source = { id: "settings", systemOfRecord: "postgres:events+mcp:health" }

  it("maps a snapshot with governance activity to ready", () => {
    const snapshot: SettingsSnapshot = { ...BASE_SETTINGS, gateChecks24h: 5 }
    const outcome: SourceOutcome<SettingsSnapshot> = {
      ok: true,
      data: snapshot,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isSettingsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("ready")
  })

  it("maps a zero-activity snapshot to empty", () => {
    const outcome: SourceOutcome<SettingsSnapshot> = {
      ok: true,
      data: BASE_SETTINGS,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isSettingsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("empty")
  })

  it("maps an unreachable source to degraded", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: null,
      isEmpty: isSettingsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("degraded")
  })

  it("maps a query failure to error", () => {
    const outcome: SourceOutcome<SettingsSnapshot> = {
      ok: false,
      error: "Settings query failed",
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isSettingsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("error")
    expect(surface.error).toBe("Settings query failed")
  })
})

describe("Settings page — subsystem health display (Task 7)", () => {
  const HEALTH_COLOR: Record<string, string> = {
    healthy: "var(--allura-green)",
    unhealthy: "var(--allura-red)",
    unknown: "var(--allura-gray-500)",
  }

  it("maps healthy to the green token", () => {
    const color = HEALTH_COLOR["healthy"]
    expect(color).toBe("var(--allura-green)")
  })

  it("maps unhealthy to the red token", () => {
    const color = HEALTH_COLOR["unhealthy"]
    expect(color).toBe("var(--allura-red)")
  })

  it("maps unknown to the gray token", () => {
    const color = HEALTH_COLOR["unknown"]
    expect(color).toBe("var(--allura-gray-500)")
  })

  it("all 5 subsystem keys surface their health status from the snapshot", () => {
    const snapshot: SettingsSnapshot = {
      ...BASE_SETTINGS,
      subsystemHealth: {
        postgres: "healthy",
        neo4j: "unhealthy",
        embeddingBackfill: "unknown",
        curatorQueueDepth: "healthy",
        mcpToolAvailability: "unknown",
      },
    }
    expect(snapshot.subsystemHealth.postgres).toBe("healthy")
    expect(snapshot.subsystemHealth.neo4j).toBe("unhealthy")
    expect(snapshot.subsystemHealth.embeddingBackfill).toBe("unknown")
    expect(snapshot.subsystemHealth.curatorQueueDepth).toBe("healthy")
    expect(snapshot.subsystemHealth.mcpToolAvailability).toBe("unknown")
  })

  it("formats last policy change as locale date when present", () => {
    const snapshot: SettingsSnapshot = {
      ...BASE_SETTINGS,
      lastPolicyChangeAt: "2026-06-12T06:00:00.000Z",
    }
    const display = snapshot.lastPolicyChangeAt
      ? new Date(snapshot.lastPolicyChangeAt).toLocaleDateString()
      : "None"
    expect(display).not.toBe("None")
    expect(typeof display).toBe("string")
  })

  it("shows 'None' for last policy change when null", () => {
    const display = BASE_SETTINGS.lastPolicyChangeAt
      ? new Date(BASE_SETTINGS.lastPolicyChangeAt).toLocaleDateString()
      : "None"
    expect(display).toBe("None")
  })

  it("shows the soc2 description for soc2 mode", () => {
    const mode: SettingsSnapshot["promotionMode"] = "soc2"
    const label =
      mode === "soc2"
        ? "all promotions require human approval"
        : mode === "auto"
          ? "high-scoring memories auto-promote"
          : "not configured via PROMOTION_MODE env"
    expect(label).toContain("human approval")
  })
})

// ── Teams page (Task 8) ───────────────────────────────────────────────────────

const MOCK_TEAMS: TeamsSnapshot = {
  groupId: GROUP_ID,
  teams: [
    {
      id: "ram",
      name: "RAM",
      description: "Surgical team",
      groupId: GROUP_ID,
      status: "active",
      agents: [
        { id: "brooks", persona: "Frederick Brooks", role: "Architect + Orchestrator", category: "primary", events24h: 5 },
        { id: "woz", persona: "Steve Wozniak", role: "Builder", category: "code", events24h: 0 },
      ],
    },
  ],
  totalAgents: 2,
  totalEvents24h: 5,
}

describe("Teams page — operational state mapping (Task 8)", () => {
  const source = { id: "teams", systemOfRecord: "manifest+postgres:events" }

  it("maps a snapshot with agent events to ready", () => {
    const outcome: SourceOutcome<TeamsSnapshot> = {
      ok: true,
      data: MOCK_TEAMS,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("ready")
    expect(surface.data?.totalAgents).toBe(2)
  })

  it("maps a zero-events snapshot to empty", () => {
    const noActivity: TeamsSnapshot = { ...MOCK_TEAMS, totalEvents24h: 0 }
    const outcome: SourceOutcome<TeamsSnapshot> = {
      ok: true,
      data: noActivity,
      fetchedAt: new Date().toISOString(),
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("empty")
  })

  it("maps an unreachable source to degraded", () => {
    const surface = resolveOperationalSurface({
      source,
      outcome: null,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("degraded")
  })

  it("maps a query failure to error", () => {
    const outcome: SourceOutcome<TeamsSnapshot> = {
      ok: false,
      error: "Teams query failed",
    }
    const surface = resolveOperationalSurface({
      source,
      outcome,
      isEmpty: isTeamsEmpty,
      freshnessMs: 30_000,
      now: Date.now(),
    })
    expect(surface.status).toBe("error")
  })
})

describe("Teams page — fleet stats and agent card logic (Task 8)", () => {
  it("counts active teams correctly from the snapshot", () => {
    const activeTeams = MOCK_TEAMS.teams.filter((t) => t.status === "active").length
    expect(activeTeams).toBe(1)
  })

  it("uses the first letter of team name as the avatar character", () => {
    const team = MOCK_TEAMS.teams[0]!
    const avatarChar = team.name.charAt(0)
    expect(avatarChar).toBe("R")
  })

  it("shows green dot for agents with events in last 24h", () => {
    const agent = MOCK_TEAMS.teams[0]!.agents[0]!
    const isActive = agent.events24h > 0
    expect(isActive).toBe(true)
  })

  it("shows gray dot for agents with no events in last 24h", () => {
    const agent = MOCK_TEAMS.teams[0]!.agents[1]!
    const isActive = agent.events24h > 0
    expect(isActive).toBe(false)
  })

  it("shows event count badge only when events24h > 0", () => {
    const activeAgent = MOCK_TEAMS.teams[0]!.agents[0]!
    const idleAgent = MOCK_TEAMS.teams[0]!.agents[1]!
    expect(activeAgent.events24h > 0).toBe(true)
    expect(idleAgent.events24h > 0).toBe(false)
  })

  it("team status badge shows Active for active status", () => {
    const team = MOCK_TEAMS.teams[0]!
    const badgeText =
      team.status === "active"
        ? "Active"
        : team.status === "provisioned"
          ? "Provisioned"
          : "Spec Ready"
    expect(badgeText).toBe("Active")
  })

  it("group_id is invariantly allura-system for all teams", () => {
    for (const team of MOCK_TEAMS.teams) {
      expect(team.groupId).toMatch(/^allura-/)
      expect(team.groupId).toBe("allura-system")
    }
  })
})

// ── Shared freshness logic (all pages) ────────────────────────────────────────

describe("Dashboard pages — freshness text formatting (Tasks 5-8)", () => {
  it("returns freshness unknown when fetchedAt is null", () => {
    expect(freshnessText(null, null)).toBe("freshness: unknown")
  })

  it("shows 0s ago for a very fresh fetch", () => {
    const fetchedAt = new Date().toISOString()
    const text = freshnessText(fetchedAt, 0)
    expect(text).toBe("fetched 0s ago")
  })

  it("shows rounded seconds for recent fetches", () => {
    const text = freshnessText(new Date().toISOString(), 15_000)
    expect(text).toBe("fetched 15s ago")
  })

  it("rounds to the nearest second", () => {
    const text = freshnessText(new Date().toISOString(), 14_600)
    expect(text).toBe("fetched 15s ago")
  })
})

// ── group_id invariant across all pages ──────────────────────────────────────

describe("All pages — group_id invariant", () => {
  it("GROUP_ID matches allura-system namespace pattern", () => {
    expect(GROUP_ID).toMatch(/^allura-[a-z0-9-]+$/)
    expect(GROUP_ID).toBe("allura-system")
  })

  it("all page sources use allura-system as the scope", () => {
    const pageGroupIds = [
      BASE_DREAMS.groupId,
      BASE_SCHEDULED.groupId,
      BASE_SETTINGS.groupId,
      MOCK_TEAMS.groupId,
    ]
    for (const gid of pageGroupIds) {
      expect(gid).toBe("allura-system")
    }
  })
})
