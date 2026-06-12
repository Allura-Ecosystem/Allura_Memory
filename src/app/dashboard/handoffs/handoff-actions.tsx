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
  background: "#d1fae5",
  color: "#065f46",
  borderColor: "#a7f3d0",
}

const rejectBtn: React.CSSProperties = {
  ...btnBase,
  background: "#fee2e2",
  color: "#991b1b",
  borderColor: "#fecaca",
}

const disabledBtn: React.CSSProperties = {
  ...btnBase,
  background: "#f3f4f6",
  color: "#9ca3af",
  cursor: "not-allowed",
  borderColor: "#e5e7eb",
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
          background: done === "acknowledged" ? "#d1fae5" : "#fee2e2",
          color: done === "acknowledged" ? "#065f46" : "#991b1b",
          borderColor: done === "acknowledged" ? "#a7f3d0" : "#fecaca",
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
            color: "#dc2626",
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
