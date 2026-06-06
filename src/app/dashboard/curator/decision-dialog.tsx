"use client"

import { useEffect, useRef, useState } from "react"

import type { CuratorDecision, Proposal } from "./types"

export function DecisionDialog({
  proposal,
  decision,
  submitting,
  error,
  restoreFocusRef,
  onCancel,
  onConfirm,
}: {
  proposal: Proposal
  decision: CuratorDecision
  submitting: boolean
  error: string | null
  restoreFocusRef?: React.RefObject<HTMLElement | null>
  onCancel: () => void
  onConfirm: (rationale: string) => Promise<void>
}) {
  const [rationale, setRationale] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const rationaleRef = useRef<HTMLTextAreaElement | null>(null)
  const previouslyFocusedElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const fallbackFocusElement = restoreFocusRef?.current ?? null
    rationaleRef.current?.focus()

    return () => {
      if (fallbackFocusElement) {
        fallbackFocusElement.focus()
        return
      }
      previouslyFocusedElement.current?.focus()
    }
  }, [restoreFocusRef])

  const focusableSelectors = [
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",")

  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && !submitting) {
      e.preventDefault()
      onCancel()
      return
    }

    if (e.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelectors) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const label: Record<CuratorDecision, string> = {
    approve: "Approve proposal",
    reject: "Reject proposal",
    request_evidence: "Request Evidence",
    request_changes: "Request Changes",
  }
  const body: Record<CuratorDecision, string> = {
    approve: "Approval queues governed promotion through the curator flow. Autonomous Neo4j promotion remains blocked.",
    reject: "Rejection preserves source evidence and episodic traces. Nothing is deleted.",
    request_evidence: "Requesting evidence records an append-only audit event and keeps the proposal pending.",
    request_changes: "Requesting changes maps to the documented request-evidence backend behavior and keeps the proposal pending.",
  }
  const isDestructiveDecision = decision === "reject"
  const trimmedRationale = rationale.trim()

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(17, 24, 39, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onKeyDown={trapFocus}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="curator-decision-title"
        aria-describedby="curator-decision-description"
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
          padding: 20,
          border: "1px solid #e5e7eb",
        }}
      >
        <h2 id="curator-decision-title" style={{ fontSize: 18, margin: "0 0 8px", color: "#111827" }}>
          {label[decision]}
        </h2>
        <p id="curator-decision-description" style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, margin: "0 0 12px" }}>
          {body[decision]} Decision receipt will include actor, timestamp, rationale, proposal ID, prior status, and new status.
        </p>
        <div style={{ fontSize: 12, color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, marginBottom: 12 }}>
          Proposal <code>{proposal.id}</code> • current status <strong>{proposal.status}</strong>
        </div>
        <label htmlFor="curator-decision-rationale" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
          Human rationale <span aria-hidden="true">*</span>
        </label>
        <textarea
          ref={rationaleRef}
          id="curator-decision-rationale"
          value={rationale}
          onChange={(e) => {
            setRationale(e.target.value)
            setLocalError(null)
          }}
          rows={5}
          aria-invalid={Boolean(localError || error)}
          aria-describedby="curator-decision-error"
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            padding: 10,
            fontSize: 13,
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
          placeholder="Explain the evidence and why this decision is appropriate."
        />
        {(localError || error) && (
          <p id="curator-decision-error" role="alert" style={{ color: "#991b1b", fontSize: 12, margin: "8px 0 0" }}>
            {localError || error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...dialogButtonStyle, background: "#fff", color: "#374151" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              if (!trimmedRationale) {
                setLocalError("rationale is required")
                rationaleRef.current?.focus()
                return
              }
              await onConfirm(trimmedRationale)
            }}
            style={{ ...dialogButtonStyle, background: isDestructiveDecision ? "#991b1b" : "#166534", color: "#fff", borderColor: isDestructiveDecision ? "#991b1b" : "#166534" }}
          >
            {submitting ? "Recording…" : label[decision]}
          </button>
        </div>
      </div>
    </div>
  )
}

const dialogButtonStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  cursor: "pointer",
}
