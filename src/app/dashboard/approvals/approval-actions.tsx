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
          background: done === "approved" ? "var(--allura-success-light)" : "var(--allura-error-light)",
          color: done === "approved" ? "var(--allura-success-text)" : "var(--allura-error-text)",
          borderColor: done === "approved" ? "var(--allura-success-border)" : "var(--allura-error-border)",
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
