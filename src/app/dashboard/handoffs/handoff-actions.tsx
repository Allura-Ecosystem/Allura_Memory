"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

interface HandoffActionsProps {
  id: string
}

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 12px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid transparent",
  flexShrink: 0,
  transition: "opacity 0.15s",
}

const acknowledgeBtn: React.CSSProperties = {
  ...btnBase,
  background: "var(--allura-success-light)",
  color: "var(--allura-success-text)",
  borderColor: "var(--allura-success-border)",
}

const rejectBtn: React.CSSProperties = {
  ...btnBase,
  background: "var(--allura-error-light)",
  color: "var(--allura-error-text)",
  borderColor: "var(--allura-error-border)",
}

const disabledBtn: React.CSSProperties = {
  ...btnBase,
  background: "var(--allura-disabled-bg)",
  color: "var(--allura-text-faint)",
  cursor: "not-allowed",
  borderColor: "var(--allura-disabled-border)",
}

export default function HandoffActions({ id }: HandoffActionsProps) {
  const router = useRouter()
  const [pending, setPending] = useState<"acknowledge" | "reject" | null>(null)
  const [done, setDone] = useState<"acknowledged" | "rejected" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(action: "acknowledge" | "reject") {
    setPending(action)
    setError(null)
    try {
      const endpoint =
        action === "acknowledge"
          ? `/api/handoffs/${id}/acknowledge`
          : `/api/handoffs/${id}/reject`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: "allura-system" }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setError(body.error ?? "Action failed")
        return
      }
      setDone(action === "acknowledge" ? "acknowledged" : "rejected")
      router.refresh()
    } catch {
      setError("Network error")
    } finally {
      setPending(null)
    }
  }

  if (done) {
    return (
      <span
        style={{
          ...btnBase,
          background: done === "acknowledged" ? "var(--allura-success-light)" : "var(--allura-error-light)",
          color: done === "acknowledged" ? "var(--allura-success-text)" : "var(--allura-error-text)",
          borderColor: done === "acknowledged" ? "var(--allura-success-border)" : "var(--allura-error-border)",
          cursor: "default",
        }}
      >
        {done === "acknowledged" ? "Acknowledged" : "Rejected"}
      </span>
    )
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {error && (
        <span
          style={{
            fontSize: 11,
            color: "var(--allura-error-inline)",
            fontFamily: '"IBM Plex Mono", monospace',
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={error}
        >
          {error}
        </span>
      )}
      <button
        style={pending ? disabledBtn : acknowledgeBtn}
        disabled={pending !== null}
        onClick={() => handleAction("acknowledge")}
        aria-label="Acknowledge handoff"
      >
        {pending === "acknowledge" ? "..." : "Acknowledge"}
      </button>
      <button
        style={pending ? disabledBtn : rejectBtn}
        disabled={pending !== null}
        onClick={() => handleAction("reject")}
        aria-label="Reject handoff"
      >
        {pending === "reject" ? "..." : "Reject"}
      </button>
    </div>
  )
}
