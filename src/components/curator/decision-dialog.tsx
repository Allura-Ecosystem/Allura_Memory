"use client"

import { useEffect, useRef, useState } from "react"

import type { CuratorDecision, Proposal } from "./types"

const COPY: Record<CuratorDecision, { title: string; confirm: string; description: string }> = {
  approve: {
    title: "Approve proposal",
    confirm: "Record approval",
    description: "Approval queues governed promotion. It is complete only after the server returns a receipt.",
  },
  reject: {
    title: "Reject proposal",
    confirm: "Record rejection",
    description: "Rejection preserves the proposal and source evidence in the audit trail.",
  },
  request_evidence: {
    title: "Request more evidence",
    confirm: "Record evidence request",
    description: "The proposal remains pending and the evidence request is recorded append-only.",
  },
}

export function DecisionDialog({
  proposal,
  decision,
  submitting,
  serverError,
  onCancel,
  onConfirm,
}: {
  proposal: Proposal
  decision: CuratorDecision
  submitting: boolean
  serverError: string | null
  onCancel: () => void
  onConfirm: (rationale: string) => Promise<void>
}) {
  const [rationale, setRationale] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const rationaleRef = useRef<HTMLTextAreaElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const copy = COPY[decision]

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    rationaleRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== "Tab") return
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled])") ?? [])
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="curator-dialog-backdrop" onKeyDown={handleKeyDown}>
      <div ref={dialogRef} className="curator-dialog" role="dialog" aria-modal="true" aria-labelledby="decision-title" aria-describedby="decision-description">
        <p className="curator-eyebrow">Governed human decision</p>
        <h2 id="decision-title">{copy.title}</h2>
        <p id="decision-description">{copy.description}</p>
        <dl className="curator-dialog-context">
          <div><dt>Proposal</dt><dd>{proposal.id}</dd></div>
          <div><dt>Current state</dt><dd>{proposal.status}</dd></div>
        </dl>
        <label htmlFor="decision-rationale">Human rationale <span aria-hidden="true">*</span></label>
        <textarea
          ref={rationaleRef}
          id="decision-rationale"
          value={rationale}
          rows={5}
          disabled={submitting}
          aria-invalid={Boolean(localError || serverError)}
          aria-describedby={localError || serverError ? "decision-error" : undefined}
          onChange={(event) => {
            setRationale(event.target.value)
            setLocalError(null)
          }}
          placeholder="Explain which evidence supports this decision."
        />
        {(localError || serverError) && <p id="decision-error" role="alert" className="curator-error">{localError ?? serverError}</p>}
        <div className="curator-dialog-actions">
          <button type="button" className="curator-button curator-button-secondary" disabled={submitting} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={decision === "reject" ? "curator-button curator-button-danger" : "curator-button curator-button-primary"}
            disabled={submitting}
            onClick={async () => {
              const trimmed = rationale.trim()
              if (!trimmed) {
                setLocalError("Rationale is required before a decision can be recorded.")
                rationaleRef.current?.focus()
                return
              }
              await onConfirm(trimmed)
            }}
          >
            {submitting ? "Recording…" : copy.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

