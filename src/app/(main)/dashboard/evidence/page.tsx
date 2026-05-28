import { FileSearch, MoreHorizontal, AlertTriangle } from "lucide-react"
import { loadEvidence } from "@/lib/dashboard/queries"
import type { Evidence } from "@/lib/dashboard/types"

// Status badge hardcoded hex — documented exception per frontend-craft Token Authority:
// Canvas/JS-only contexts and status semantics not covered by allura.css tone tokens.
// Verified/Approved green = #16a34a, Reviewed/Pending amber = #b45309, Rejected red = #dc2626
function getBadgeProps(evidence: Evidence): { label: string; borderColor: string; textColor: string } {
  const { status, tags } = evidence
  if (status === "approved") {
    return { label: "Approved", borderColor: "#16a34a", textColor: "#16a34a" }
  }
  if (status === "active" || tags.includes("verified")) {
    return { label: "Verified", borderColor: "#16a34a", textColor: "#16a34a" }
  }
  if (status === "pending") {
    return { label: "Reviewed", borderColor: "#b45309", textColor: "#b45309" }
  }
  if (status === "rejected" || status === "superseded") {
    return { label: "Rejected", borderColor: "#dc2626", textColor: "#dc2626" }
  }
  // unknown or anything else — neutral muted badge
  return { label: "Unknown", borderColor: "#9ca3af", textColor: "#6b7280" }
}

function getThumbnailLabel(evidence: Evidence): string {
  const titleLower = evidence.title.toLowerCase()
  if (
    evidence.source === "image" ||
    titleLower.includes("screenshot") ||
    titleLower.includes("logo") ||
    titleLower.includes("image")
  ) {
    return "[IMG]"
  }
  return "[DOC]"
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function EvidenceRow({ item, isLast }: { item: Evidence; isLast: boolean }) {
  const badge = getBadgeProps(item)
  const thumbLabel = getThumbnailLabel(item)

  return (
    <div
      className={`flex items-center gap-4 px-5 py-4 ${isLast ? "" : "border-b border-[var(--dashboard-border)]"}`}
    >
      {/* Thumbnail */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-[var(--allura-cream)]">
        <span className="text-xs text-[var(--dashboard-text-muted)]">{thumbLabel}</span>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col px-4">
        <p className="truncate text-sm font-semibold text-[var(--dashboard-text-primary)]">
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-[var(--dashboard-text-muted)]">
          {item.source} &bull; {item.agent} &bull; {formatTimestamp(item.timestamp)}
        </p>
        {/* Status badge */}
        <span
          className="mt-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
          style={{ borderColor: badge.borderColor, color: badge.textColor }}
        >
          {badge.label}
        </span>
      </div>

      {/* Overflow button */}
      <button
        type="button"
        aria-label="More options"
        className="shrink-0 rounded p-1 hover:bg-[var(--dashboard-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--allura-blue)]"
      >
        <MoreHorizontal size={16} className="text-[var(--dashboard-text-muted)]" />
      </button>
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`px-5 py-4 ${i < 3 ? "border-b border-[var(--dashboard-border)]" : ""}`}
        >
          <div className="h-20 animate-pulse rounded-lg bg-[var(--dashboard-border)]" />
        </div>
      ))}
    </>
  )
}

export default async function EvidencePage() {
  const result = await loadEvidence()

  const items: Evidence[] = result.data ?? []
  const isDegraded = result.degraded === true || result.error !== null

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-[var(--dashboard-text-primary)]">Evidence</h1>

      {/* Degraded / error banner */}
      {isDegraded && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--allura-gold-10)] px-4 py-3">
          <AlertTriangle size={14} className="shrink-0 text-[var(--allura-gold-text)]" />
          <p className="text-xs text-[var(--allura-gold-text)]">
            {result.error
              ? "Evidence data could not be loaded. Showing partial results."
              : "Evidence data may be incomplete or delayed."}
          </p>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-surface)]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <FileSearch size={32} className="text-[var(--dashboard-text-muted)]" />
            <p className="text-sm text-[var(--dashboard-text-muted)]">No evidence records found.</p>
          </div>
        ) : (
          items.map((item, idx) => (
            <EvidenceRow key={item.id} item={item} isLast={idx === items.length - 1} />
          ))
        )}
      </div>
    </div>
  )
}
