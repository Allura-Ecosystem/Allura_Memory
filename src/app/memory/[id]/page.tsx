"use client"

import { ArrowLeft, Clock, Sparkles } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import type { JSX } from "react"
import { Spinner } from "@/components/ui/spinner"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { buildMemoryEvidenceChain, memoryVersionStatus } from "@/lib/memory/detail-view"
import { buildProvenanceExportText } from "@/lib/memory/provenance-export"
import { formatRelativeTime, normalizeNeo4jTimestamp } from "@/lib/utils/date"

// ── Types ─────────────────────────────────────────────────────────────────

interface MemoryDetail {
  id: string
  content: string
  score: number
  source: "episodic" | "semantic" | "both"
  provenance: "conversation" | "manual"
  user_id: string
  actor?: string | null
  creator?: string | null
  approver?: string | null
  group_id?: string
  created_at: string
  status?: "approved" | "proposed" | "pending" | "deprecated" | "active" | "deleted"
  source_event_id?: string | null
  proposal_id?: string | null
  trace_ref?: string | number | null
  version?: number
  superseded_by?: string
  usage_count?: number
  recent_usage_count?: number | null
  evidence?: Parameters<typeof buildMemoryEvidenceChain>[0]["evidence"]
  hash?: string | null
  previous_hash?: string | null
}

interface DeletedMemoryItem {
  id: string
  content: string
  deleted_at: string
  recovery_days_remaining: number
  created_at: string
  score: number
  source: "episodic" | "semantic" | "both"
  provenance: "conversation" | "manual"
  user_id: string
  actor?: string | null
  creator?: string | null
  approver?: string | null
  group_id?: string
  status?: MemoryDetail["status"]
  source_event_id?: string | null
  proposal_id?: string | null
  trace_ref?: string | number | null
  superseded_by?: string
  evidence?: MemoryDetail["evidence"]
  hash?: string | null
  previous_hash?: string | null
  version?: number
}

// ── Plain-English helpers ─────────────────────────────────────────────────

function toSourceProse(memory: MemoryDetail): string {
  const date = new Date(memory.created_at).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  if (memory.provenance === "conversation") {
    return `Heard during a conversation on ${date}`
  }
  return `Written by hand on ${date}`
}

function toStoreProse(source: MemoryDetail["source"]): string {
  if (source === "both") return "Kept in both memory stores for safekeeping."
  if (source === "episodic") return "Stored in the day-to-day memory store."
  return "Stored in the long-term knowledge store."
}

function toConfidenceProse(score: number): string {
  const pct = Math.round(score * 100)
  if (pct >= 90) return `High confidence (${pct}%) — Allura is very sure about this.`
  if (pct >= 70) return `Fairly confident (${pct}%) — the system believes this is accurate.`
  if (pct >= 50) return `Moderate confidence (${pct}%) — worth verifying.`
  return `Low confidence (${pct}%) — take this one with a grain of salt.`
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function MemoryDetailPage(): JSX.Element | null {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const memoryId = params.id

  const [memory, setMemory] = useState<MemoryDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Delete state
  const [isForgotten, setIsForgotten] = useState(false)
  const [forgottenAt, setForgottenAt] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const groupId = DEFAULT_GROUP_ID

  const fetchMemory = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      const resp = await fetch(
        `/api/memory/${encodeURIComponent(memoryId)}?group_id=${encodeURIComponent(groupId)}`
      )

      if (!resp.ok) {
        if (resp.status === 404) {
          // Check deleted list
          try {
            const deletedResp = await fetch(
              `/api/memory?group_id=${encodeURIComponent(groupId)}&status=deleted&limit=200`
            )
            if (deletedResp.ok) {
              const data = await deletedResp.json()
              const deleted = (data.memories ?? []).find((m: DeletedMemoryItem) => m.id === memoryId)
              if (deleted) {
                setMemory({
                  id: deleted.id,
                  content: deleted.content,
                  score: deleted.score,
                  source: deleted.source,
                  provenance: deleted.provenance,
                  user_id: deleted.user_id,
                  actor: deleted.actor,
                  creator: deleted.creator,
                  approver: deleted.approver,
                  group_id: deleted.group_id,
                  created_at: normalizeNeo4jTimestamp(deleted.created_at),
                  status: deleted.status ?? "deleted",
                  source_event_id: deleted.source_event_id,
                  proposal_id: deleted.proposal_id,
                  trace_ref: deleted.trace_ref,
                  superseded_by: deleted.superseded_by,
                  evidence: deleted.evidence,
                  hash: deleted.hash,
                  previous_hash: deleted.previous_hash,
                  version: deleted.version,
                  usage_count: 0,
                })
                setIsForgotten(true)
                setForgottenAt(deleted.deleted_at)
                setIsLoading(false)
                return
              }
            }
          } catch { /* fallthrough */ }
          setError("This memory has been removed or replaced.")
        } else {
          setError("Could not load this memory right now.")
        }
        return
      }

      const data: MemoryDetail = await resp.json()
      setMemory({
        ...data,
        created_at: normalizeNeo4jTimestamp(data.created_at),
      })
    } catch {
      setError("Something went wrong. Try again in a moment.")
    } finally {
      setIsLoading(false)
    }
  }, [groupId, memoryId])

  useEffect(() => { void fetchMemory() }, [fetchMemory])

  // ── Loading ──

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--allura-white)" }}>
        <Spinner />
      </div>
    )
  }

  // ── Error ──

  if (error && !memory) {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: "var(--allura-white)" }}>
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 text-center">
          <h1
            className="font-display text-2xl font-black"
            style={{ fontFamily: "var(--font-family-display)", color: "var(--allura-charcoal)" }}
          >
            Can&apos;t open this memory
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--allura-text-2)" }}>{error}</p>
          <button
            type="button"
            onClick={() => router.push("/memory")}
            className="mt-6 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--allura-muted)]"
            style={{ border: "1px solid var(--allura-border-1)", color: "var(--allura-charcoal)" }}
          >
            <ArrowLeft className="mr-1.5 inline size-3.5" />
            Back to memories
          </button>
          <button
            type="button"
            onClick={() => void fetchMemory()}
            className="mt-3 text-sm font-medium underline underline-offset-4 transition-colors hover:text-[var(--allura-charcoal)]"
            style={{ color: "var(--allura-text-2)" }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!memory) return null

  const evidenceChain = buildMemoryEvidenceChain(memory)
  const versionStatus = memoryVersionStatus(memory)
  const provenanceExportText = buildProvenanceExportText({ ...memory, status: versionStatus, evidence: evidenceChain })

  const copyProvenance = async (): Promise<void> => {
    setExportError(null)
    try {
      await navigator.clipboard.writeText(provenanceExportText)
    } catch {
      setExportError("Clipboard export failed. Provenance was not copied.")
    }
  }

  const downloadProvenance = (): void => {
    setExportError(null)
    try {
      const blob = new Blob([provenanceExportText], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${memory.id}-provenance.txt`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch {
      setExportError("File export failed. Provenance was not downloaded.")
    }
  }

  // ── Render ──

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--allura-white)" }}>
      {/* ── Top bar ── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{
          borderColor: "var(--allura-border-1)",
          background: "color-mix(in srgb, var(--allura-white) 92%, transparent)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => router.push("/memory")}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-[var(--allura-charcoal)]"
            style={{ color: "var(--allura-text-2)" }}
          >
            <ArrowLeft className="size-4" />
            Back to memories
          </button>
          <span className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide" style={{ background: "var(--allura-cream)", color: "var(--allura-text-2)" }}>
            Read-only detail
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {/* ── Forgotten banner ── */}
        {isForgotten && forgottenAt && (
          <div className="memory-forgotten mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--allura-charcoal)" }}>
                  This memory was forgotten on{" "}
                  {new Date(forgottenAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="memory-forgotten-recovery-note">
                  It&apos;s in the 30-day recovery window and can be restored.
                </p>
              </div>
              <p className="text-xs" style={{ color: "var(--allura-text-3)" }}>
                Restore is intentionally not exposed in this read-only provenance view.
              </p>
            </div>
          </div>
        )}

        {/* ── Content card ── */}
        <div className="memory-card mb-6">
          {/* Timestamp & sparkle */}
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="size-4 shrink-0" style={{ color: "var(--allura-text-3)" }} />
            <span className="text-xs" style={{ color: "var(--allura-text-3)" }}>
              {formatRelativeTime(memory.created_at)}
            </span>
          </div>

          <div className="rounded-xl p-3">
            <p className="text-xl leading-relaxed font-medium" style={{ color: "var(--allura-charcoal)" }}>
              {memory.content}
            </p>
            <p className="mt-3 text-xs" style={{ color: "var(--allura-text-3)" }}>
              Memory ID: {memory.id}
            </p>
          </div>
        </div>

        {/* ── Provenance + Confidence ── */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="memory-card">
            <p
              className="text-xs font-semibold tracking-wider uppercase"
              style={{ color: "var(--allura-text-2)" }}
            >
              Where this came from
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--allura-charcoal)" }}>
              {toSourceProse(memory)}
            </p>
            <p className="mt-2 text-xs" style={{ color: "var(--allura-text-3)" }}>
              {toStoreProse(memory.source)}
            </p>
          </div>

          <div className="memory-card">
            <p
              className="text-xs font-semibold tracking-wider uppercase"
              style={{ color: "var(--allura-text-2)" }}
            >
              Confidence
            </p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--allura-charcoal)" }}>
              {toConfidenceProse(memory.score)}
            </p>
          </div>
        </div>

        {/* ── Detail metadata ── */}
        <div className="memory-card mb-6">
          <p className="text-xs font-semibold tracking-wider uppercase" style={{ color: "var(--allura-text-2)" }}>
            Provenance details
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>Tenant scope</dt>
              <dd className="font-medium" style={{ color: "var(--allura-charcoal)" }}>{memory.group_id ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>Actor</dt>
              <dd className="font-medium" style={{ color: "var(--allura-charcoal)" }}>{memory.actor || "Unavailable"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>User</dt>
              <dd className="font-medium" style={{ color: "var(--allura-charcoal)" }}>{memory.user_id || "Unavailable"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>Creator</dt>
              <dd className="font-medium" style={{ color: "var(--allura-charcoal)" }}>{memory.creator || "Unavailable"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>Approver</dt>
              <dd className="font-medium" style={{ color: "var(--allura-charcoal)" }}>{memory.approver || "Unavailable"}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>Status</dt>
              <dd className="font-medium capitalize" style={{ color: "var(--allura-charcoal)" }}>{versionStatus}</dd>
            </div>
            <div>
              <dt style={{ color: "var(--allura-text-3)" }}>Created</dt>
              <dd className="font-medium" style={{ color: "var(--allura-charcoal)" }}>{new Date(memory.created_at).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        {/* ── Evidence section ── */}
        <div
          className="mb-6 rounded-xl p-6"
          style={{ background: "var(--allura-cream)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Clock className="size-4" style={{ color: "var(--allura-text-2)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--allura-text-2)" }}>
              Evidence chain
            </p>
          </div>

          <div className="space-y-3 pl-6 border-l-2" style={{ borderColor: "var(--allura-border-1)" }}>
            {evidenceChain.map((item) => (
              <div key={`${item.type}:${item.label}:${item.id ?? "unavailable"}`}>
                <p className="text-sm font-medium" style={{ color: "var(--allura-charcoal)" }}>
                  {item.label}
                </p>
                <p className="text-xs" style={{ color: "var(--allura-text-3)" }}>
                  {item.status === "available" ? item.id : "Unavailable — not present in retrieved evidence"}
                </p>
              </div>
            ))}
            {memory.version != null && memory.version > 1 ? (
              <>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--allura-charcoal)" }}>
                    Version 1
                  </p>
                  <p className="text-xs" style={{ color: "var(--allura-text-3)" }}>
                    Created{" "}
                    {new Date(memory.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--allura-charcoal)" }}>
                    Version {memory.version}
                  </p>
                  <p className="text-xs" style={{ color: "var(--allura-text-3)" }}>
                    Updated most recently
                  </p>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--allura-charcoal)" }}>
                  Original version
                </p>
                <p className="text-xs" style={{ color: "var(--allura-text-3)" }}>
                  This memory has never been edited.
                </p>
              </div>
            )}

            {memory.superseded_by && (
              <div>
                <p className="text-xs italic" style={{ color: "var(--allura-text-3)" }}>
                  A newer version of this memory exists.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Read-only actions ── */}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void copyProvenance()}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--allura-muted)]"
            style={{ border: "1px solid var(--allura-border-1)", color: "var(--allura-charcoal)" }}
          >
            Copy provenance
          </button>
          <button
            type="button"
            onClick={downloadProvenance}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--allura-muted)]"
            style={{ border: "1px solid var(--allura-border-1)", color: "var(--allura-charcoal)" }}
          >
            Export provenance
          </button>
          <button
            type="button"
            onClick={() => void fetchMemory()}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--allura-muted)]"
            style={{ color: "var(--allura-text-2)" }}
          >
            Retry load
          </button>
        </div>
        {exportError && (
          <p className="mt-3 text-sm" style={{ color: "var(--allura-text-2)" }}>
            {exportError}
          </p>
        )}
      </div>

    </div>
  )
}
