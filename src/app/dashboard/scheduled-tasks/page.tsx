import type { Metadata } from "next"

import { resolveOperationalSurface, type OperationalStatus } from "@/lib/operational-state"
import {
  isScheduledTasksEmpty,
  readScheduledTasks,
} from "@/lib/operational-state/sources/scheduled-tasks-source"

export const metadata: Metadata = {
  title: "Scheduled Tasks",
}

// Always render live — never statically cache fabricated operational state.
export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

/** Watchdog is considered idle when no heartbeat in this window. */
const WATCHDOG_IDLE_MS = 10 * 60 * 1000

const STATUS_COLOR: Record<OperationalStatus, string> = {
  ready: "var(--allura-green)",
  empty: "var(--allura-gray-500)",
  stale: "var(--allura-gold)",
  error: "var(--allura-red)",
  degraded: "var(--allura-red)",
}

const STATUS_LABEL: Record<OperationalStatus, string> = {
  ready: "Live",
  empty: "Empty",
  stale: "Stale",
  error: "Error",
  degraded: "Degraded",
}

function freshnessText(fetchedAt: string | null, ageMs: number | null): string {
  if (fetchedAt === null || ageMs === null) return "freshness: unknown"
  const seconds = Math.round(ageMs / 1000)
  return `fetched ${seconds}s ago`
}

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

export default async function ScheduledTasksPage() {
  const outcome = await readScheduledTasks(GROUP_ID)
  // Evaluation clock taken AFTER the fetch so ageMs is honest (never negative).
  const now = Date.now()
  const surface = resolveOperationalSurface({
    source: { id: "scheduled-tasks", systemOfRecord: "postgres:events" },
    outcome,
    isEmpty: isScheduledTasksEmpty,
    freshnessMs: 30_000,
    now,
  })

  const accent = STATUS_COLOR[surface.status]
  const snapshot = surface.data

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ marginBottom: "24px" }}>
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
          Background Intelligence
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
          Scheduled Tasks
        </h1>
        <p style={{ fontSize: "14px", color: "var(--allura-gray-500)", margin: "0" }}>
          Curator pipeline runs, embedding backfill jobs, and watchdog activity.
        </p>
      </div>

      {/* Honest operational state strip — source + freshness, never fabricated */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          background: "var(--allura-paper)",
          border: `1px solid ${accent}`,
          borderRadius: "8px",
          marginBottom: "16px",
          width: "min(100%, 800px)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: "13px", color: accent, fontWeight: 600 }}>
          {STATUS_LABEL[surface.status]}
        </span>
        <span style={{ fontSize: "12px", color: "var(--allura-gray-500)" }}>
          &mdash; source{" "}
          <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{surface.source.id}</code> (
          {surface.source.systemOfRecord}) &mdash; {freshnessText(surface.fetchedAt, surface.ageMs)} &mdash;
          scope <code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>{GROUP_ID}</code>
        </span>
      </div>

      {/* Recovery / error / empty messaging when not authoritative */}
      {surface.status !== "ready" && surface.status !== "stale" ? (
        <div
          style={{
            padding: "16px",
            background: "var(--allura-paper)",
            border: "1px solid var(--allura-cream)",
            borderRadius: "10px",
            marginBottom: "24px",
            width: "min(100%, 800px)",
          }}
        >
          <p style={{ fontSize: "14px", color: "var(--allura-charcoal)", margin: "0 0 4px", fontWeight: 600 }}>
            {surface.status === "degraded"
              ? "Scheduled tasks source is unreachable"
              : surface.status === "error"
                ? "Scheduled tasks source reported an error"
                : "No background-job activity recorded yet"}
          </p>
          {surface.status === "empty" ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0 0 4px" }}>
              Start the curator watchdog (<code style={{ fontFamily: '"IBM Plex Mono", monospace' }}>bun run curator:watchdog</code>)
              or the embedding backfill worker to see activity here.
            </p>
          ) : null}
          {surface.error ? (
            <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "0 0 4px" }}>{surface.error}</p>
          ) : null}
          {surface.recovery ? (
            <p style={{ fontSize: "12px", color: "var(--allura-gray-500)", margin: "0" }}>{surface.recovery}</p>
          ) : null}
        </div>
      ) : null}

      {/* Watchdog narration + counts — only rendered with real data (ready or stale) */}
      {snapshot ? (
        <>
          <div
            style={{
              padding: "12px 16px",
              background: "var(--allura-paper)",
              border: "1px solid var(--allura-cream)",
              borderRadius: "10px",
              marginBottom: "16px",
              width: "min(100%, 800px)",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--allura-charcoal)", margin: "0", fontWeight: 600 }}>
              {heartbeatText(snapshot.lastHeartbeatAt, now)}
            </p>
            {snapshot.blockers24h > 0 ? (
              <p style={{ fontSize: "12px", color: "var(--allura-red)", margin: "4px 0 0" }}>
                {snapshot.blockers24h} queue-depth BLOCKER event{snapshot.blockers24h === 1 ? "" : "s"} in the
                last 24h — review the curator queue on the Governance surface.
              </p>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "12px",
              marginBottom: "24px",
              width: "min(100%, 800px)",
            }}
          >
            {(
              [
                { label: "Heartbeats (24h)", value: snapshot.heartbeats24h, accent: "var(--allura-green)" },
                {
                  label: "Blockers (24h)",
                  value: snapshot.blockers24h,
                  accent: snapshot.blockers24h > 0 ? "var(--allura-red)" : "var(--allura-green)",
                },
                { label: "Backfill runs (24h)", value: snapshot.backfill24h, accent: "var(--allura-blue)" },
                { label: "Proposals (24h)", value: snapshot.proposals24h, accent: "var(--allura-gold)" },
              ] as const
            ).map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: "16px",
                  background: "var(--allura-paper)",
                  border: "1px solid var(--allura-cream)",
                  borderRadius: "10px",
                  display: "grid",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--allura-gray-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}
                >
                  {stat.label}
                </span>
                <span style={{ fontSize: "22px", fontWeight: 700, color: stat.accent }}>{stat.value}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
