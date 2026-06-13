"use client"

import { useEffect, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type ProcessStatus = "pending" | "running" | "completed" | "failed" | "paused"

interface RunData {
  id: string
  definition_id: string
  definition_revision: number
  group_id: string
  status: ProcessStatus
  state_json: Record<string, unknown>
  actor_id: string | null
  started_at: string
  updated_at: string
  completed_at: string | null
}

interface RunViewProps {
  entityId: string
}

// ── Status badge helpers ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<ProcessStatus, string> = {
  pending:   "var(--allura-gray-500)",
  running:   "var(--allura-blue)",
  completed: "var(--allura-green)",
  failed:    "var(--dashboard-error)",
  paused:    "var(--allura-gold)",
}

function StatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "var(--allura-r-full)",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: STATUS_COLORS[status],
        background: `color-mix(in srgb, ${STATUS_COLORS[status]} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${STATUS_COLORS[status]} 30%, transparent)`,
      }}
    >
      {status}
    </span>
  )
}

// ── Elapsed helper ────────────────────────────────────────────────────────────

function elapsed(start: string, end: string | null): string {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const ms = e - s
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString()
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "var(--allura-lg)" }} aria-busy="true" aria-label="Loading run details">
      {[80, 60, 100, 70].map((w, i) => (
        <div
          key={i}
          style={{
            height: "14px",
            width: `${w}%`,
            borderRadius: "var(--allura-r-sm)",
            background: "var(--allura-gray-100)",
            marginBottom: "var(--allura-md)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  )
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        gap: "var(--allura-sm)",
        padding: "var(--allura-sm) 0",
        borderBottom: "1px solid var(--allura-gray-100)",
        alignItems: "start",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "var(--dashboard-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          paddingTop: "2px",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "13px",
          color: "var(--dashboard-text-primary)",
          wordBreak: "break-all",
        }}
      >
        {children}
      </span>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function RunView({ entityId }: RunViewProps) {
  const [run, setRun] = useState<RunData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/runs/${entityId}?group_id=allura-system`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ run: RunData }>
      })
      .then(({ run: data }) => {
        setRun(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load run")
        setLoading(false)
      })
  }, [entityId])

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div
        style={{
          padding: "var(--allura-lg)",
          color: "var(--dashboard-error)",
          fontSize: "13px",
        }}
        role="alert"
      >
        {error}
      </div>
    )
  }

  if (!run) return null

  const currentStep = run.state_json?.currentStepIndex as number | undefined
  const totalSteps  = run.state_json?.totalSteps as number | undefined

  return (
    <div style={{ padding: "var(--allura-lg)" }}>
      <div style={{ marginBottom: "var(--allura-md)" }}>
        <StatusBadge status={run.status} />
      </div>

      <Row label="Definition">{run.definition_id}</Row>
      <Row label="Revision">v{run.definition_revision}</Row>
      {run.actor_id && <Row label="Actor">{run.actor_id}</Row>}
      {currentStep !== undefined && totalSteps !== undefined && (
        <Row label="Progress">
          <span>
            Step {currentStep + 1} / {totalSteps}
          </span>
          <div
            style={{
              marginTop: "4px",
              height: "4px",
              borderRadius: "var(--allura-r-full)",
              background: "var(--allura-gray-100)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(((currentStep + 1) / totalSteps) * 100)}%`,
                background: STATUS_COLORS[run.status],
                borderRadius: "var(--allura-r-full)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </Row>
      )}
      <Row label="Elapsed">{elapsed(run.started_at, run.completed_at)}</Row>
      <Row label="Started">{fmt(run.started_at)}</Row>
      {run.completed_at && <Row label="Completed">{fmt(run.completed_at)}</Row>}
      {run.status === "failed" && run.state_json?.error != null && (
        <Row label="Error">
          <span style={{ color: "var(--dashboard-error)", fontFamily: "var(--font-mono)" }}>
            {String(run.state_json.error)}
          </span>
        </Row>
      )}
      <Row label="ID">
        <code style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>{run.id}</code>
      </Row>
    </div>
  )
}
