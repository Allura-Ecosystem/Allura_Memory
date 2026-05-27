"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Link2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { approveProposal, rejectProposal } from "@/lib/dashboard/api"
import { loadEvidenceDetail } from "@/lib/dashboard/queries"
import type { Evidence } from "@/lib/dashboard/types"

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-32 shrink-0 text-xs font-medium text-[var(--dashboard-text-muted)] uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-[var(--dashboard-text-primary)]">{value}</span>
    </div>
  )
}

function statusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case "approved":
    case "active":
      return { bg: "bg-green-50 border-green-200", text: "text-green-700" }
    case "pending":
      return { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" }
    case "rejected":
      return { bg: "bg-red-50 border-red-200", text: "text-red-700" }
    case "superseded":
      return { bg: "bg-gray-50 border-gray-200", text: "text-gray-600" }
    default:
      return { bg: "bg-gray-50 border-gray-200", text: "text-gray-500" }
  }
}

export default function MemoryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : ""

  const [memory, setMemory] = useState<Evidence | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [_, startTransition] = useTransition()
  const [rejectReason, setRejectReason] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    loadEvidenceDetail(id, "allura-system")
      .then((result) => {
        if (result.error) setError(result.error)
        setMemory(result.data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load memory")
      })
      .finally(() => setLoading(false))
  }, [id])

  const handleApprove = async () => {
    setBusyAction("approve")
    try {
      await approveProposal(id, { rationale: "Approved from memory detail view" })
      toast.success("Memory approved")
      startTransition(() => router.push("/dashboard/memory"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed")
    } finally {
      setBusyAction(null)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    setBusyAction("reject")
    try {
      await rejectProposal(id, rejectReason)
      toast.success("Memory rejected")
      startTransition(() => router.push("/dashboard/memory"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rejection failed")
    } finally {
      setBusyAction(null)
      setShowRejectForm(false)
      setRejectReason("")
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-64 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !memory) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/memory" className="inline-flex items-center gap-1 text-sm text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]">
          <ArrowLeft className="size-4" /> Back to Memories
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-700">Memory not found</p>
          <p className="mt-1 text-xs text-red-600">{error ?? "This memory does not exist or could not be loaded."}</p>
        </div>
      </div>
    )
  }

  const badge = statusBadge(memory.status)
  const confidence = typeof memory.metadata?.confidence === "number" ? memory.metadata.confidence : undefined

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link href="/dashboard/memory" className="inline-flex items-center gap-1 text-sm text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]">
        <ArrowLeft className="size-4" /> Back to Memories
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">{memory.title || "Untitled Memory"}</h1>
          <div className="mt-2 flex items-center gap-3">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>
              {memory.status}
            </span>
            {memory.source && (
              <span className="text-xs text-[var(--dashboard-text-muted)]">Source: {memory.source}</span>
            )}
          </div>
        </div>
        {/* Actions */}
        <div className="flex gap-2">
          {memory.status === "pending" && (
            <>
              <Button
                size="sm"
                className="bg-[var(--dashboard-cta-approval)] text-white hover:opacity-90"
                disabled={busyAction !== null}
                onClick={handleApprove}
              >
                {busyAction === "approve" ? <RefreshCw className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/20 text-red-600 hover:bg-red-50"
                disabled={busyAction !== null}
                onClick={() => setShowRejectForm((p) => !p)}
              >
                <XCircle className="mr-1 size-4" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Reject form */}
      {showRejectForm && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <label className="text-sm font-medium text-red-700">Rejection reason</label>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this memory being rejected?"
            className="mt-2 w-full rounded-lg border border-red-200 bg-[var(--dashboard-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setShowRejectForm(false); setRejectReason("") }}>Cancel</Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-500/20 text-red-600"
              disabled={!rejectReason.trim() || busyAction !== null}
              onClick={handleReject}
            >
              {busyAction === "reject" ? <RefreshCw className="mr-1 size-4 animate-spin" /> : null}
              Confirm Reject
            </Button>
          </div>
        </div>
      )}

      {/* Detail card */}
      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--dashboard-text-primary)] uppercase tracking-wide">Details</h2>
        <div className="divide-y divide-[var(--dashboard-border)]">
          <DetailRow label="ID" value={<code className="text-xs">{memory.id}</code>} />
          <DetailRow label="Agent" value={memory.agent} />
          <DetailRow label="Project" value={memory.project} />
          <DetailRow label="Source" value={memory.source} />
          <DetailRow label="Timestamp" value={memory.timestamp ? new Date(memory.timestamp).toLocaleString() : "—"} />
          {confidence !== undefined && (
            <DetailRow label="Confidence" value={`${Math.round(confidence * 100)}%`} />
          )}
          {memory.tags.length > 0 && (
            <DetailRow
              label="Tags"
              value={
                <div className="flex flex-wrap gap-1">
                  {memory.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[var(--dashboard-surface-muted)] px-2 py-0.5 text-xs text-[var(--dashboard-text-secondary)]">
                      {tag}
                    </span>
                  ))}
                </div>
              }
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
        <h2 className="mb-4 text-sm font-semibold text-[var(--dashboard-text-primary)] uppercase tracking-wide">Content</h2>
        <pre className="whitespace-pre-wrap text-sm text-[var(--dashboard-text-primary)]">{memory.rawLog || "No content available."}</pre>
      </div>

      {/* Linked evidence */}
      {memory.relatedMemoryId && memory.relatedMemoryId !== memory.id && (
        <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)] p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--dashboard-text-primary)] uppercase tracking-wide">Related</h2>
          <Link
            href={`/dashboard/memory/${encodeURIComponent(memory.relatedMemoryId)}`}
            className="inline-flex items-center gap-1 text-sm text-[var(--dashboard-cta-primary)] hover:underline"
          >
            <Link2 className="size-4" /> View related memory <ArrowUpRight className="size-3" />
          </Link>
        </div>
      )}
    </div>
  )
}
