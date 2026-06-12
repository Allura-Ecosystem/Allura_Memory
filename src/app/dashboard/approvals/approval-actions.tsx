"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

interface CheckpointActionsProps {
  type: "checkpoint"
  id: string
  checkpointId: string
}

interface ProposalActionsProps {
  type: "proposal"
  id: string
}

type ApprovalActionsProps = CheckpointActionsProps | ProposalActionsProps

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

const approveBtn: React.CSSProperties = {
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

export default function ApprovalActions(props: ApprovalActionsProps) {
  const router = useRouter()
  const [pending, setPending] = useState<"approve" | "reject" | null>(null)
  const [done, setDone] = useState<"approved" | "rejected" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleProposalAction(action: "approve" | "reject") {
    if (props.type !== "proposal") return
    setPending(action)
    setError(null)
    try {
      const res = await fetch(`/api/curator/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: props.id, group_id: "allura-system" }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setError(body.error ?? "Action failed")
        return
      }
      setDone(action === "approve" ? "approved" : "rejected")
      router.refresh()
    } catch {
      setError("Network error")
    } finally {
      setPending(null)
    }
  }

  async function handleCheckpointAction(action: "approve" | "reject") {
    if (props.type !== "checkpoint") return
    setPending(action)
    setError(null)
    try {
      const eventType = action === "approve" ? "checkpoint_resumed" : "checkpoint_rejected"
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          group_id: "allura-system",
          metadata: { checkpoint_id: props.checkpointId, source: "dashboard" },
        }),
      })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        setError(body.error ?? "Action failed")
        return
      }
      setDone(action === "approve" ? "approved" : "rejected")
      router.refresh()
    } catch {
      setError("Network error")
    } finally {
      setPending(null)
    }
  }

  const handleAction = props.type === "proposal" ? handleProposalAction : handleCheckpointAction

  if (done) {
    return (
      <span
        style={{
          ...btnBase,
          background: done === "approved" ? "#d1fae5" : "#fee2e2",
          color: done === "approved" ? "#065f46" : "#991b1b",
          borderColor: done === "approved" ? "#a7f3d0" : "#fecaca",
          cursor: "default",
        }}
      >
        {done === "approved" ? "Approved" : "Rejected"}
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
        style={pending ? disabledBtn : approveBtn}
        disabled={pending !== null}
        onClick={() => handleAction("approve")}
        aria-label="Approve"
      >
        {pending === "approve" ? "..." : "Approve"}
      </button>
      <button
        style={pending ? disabledBtn : rejectBtn}
        disabled={pending !== null}
        onClick={() => handleAction("reject")}
        aria-label="Reject"
      >
        {pending === "reject" ? "..." : "Reject"}
      </button>
    </div>
  )
}
