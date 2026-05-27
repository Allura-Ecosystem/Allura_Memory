import type { MemoryEvidenceInputItem } from "@/lib/memory/detail-view"
import { buildMemoryEvidenceChain } from "@/lib/memory/detail-view"

export interface ProvenanceExportRecord {
  id: string
  content: string
  source?: string | null
  provenance?: string | null
  user_id?: string | null
  actor?: string | null
  creator?: string | null
  approver?: string | null
  group_id?: string | null
  created_at?: string | null
  timestamp?: string | null
  status?: string | null
  score?: number | null
  confidence?: number | null
  evidence?: MemoryEvidenceInputItem[] | null
  source_event_id?: string | null
  proposal_id?: string | null
  trace_ref?: string | number | null
  superseded_by?: string | null
  version?: number
  hash?: string | null
  previous_hash?: string | null
}

export const PROVENANCE_EXPORT_LABELS = [
  "Memory ID",
  "Content",
  "Source",
  "Provenance",
  "Actor",
  "User",
  "Creator",
  "Approver",
  "Timestamp",
  "Tenant scope",
  "Status",
  "Confidence",
  "Evidence",
  "Hash",
  "Previous hash",
] as const

function valueOrUnavailable(value: unknown): string {
  if (value == null || value === "") return "Unavailable"
  return String(value)
}

function formatConfidence(record: ProvenanceExportRecord): string {
  const raw = record.confidence ?? record.score
  if (raw == null) return "Unavailable"
  return `${Math.round(raw * 100)}%`
}

function formatEvidence(evidence: MemoryEvidenceInputItem[] | null | undefined): string[] {
  if (!evidence?.length) return ["Evidence: Unavailable"]
  if (evidence.every((item) => item.id == null || item.id === "")) return ["Evidence: Unavailable"]
  return evidence.map((item) => {
    const label = item.label?.trim() || item.type
    const id = valueOrUnavailable(item.id)
    const suffix = item.status === "unavailable" ? " (unavailable)" : ""
    return `${label}: ${id}${suffix}`
  })
}

function mergeEvidence(
  canonical: MemoryEvidenceInputItem[] | null | undefined,
  legacy: MemoryEvidenceInputItem[]
): MemoryEvidenceInputItem[] {
  const canonicalItems = canonical ?? []
  if (!canonicalItems.length) return legacy

  const merged: MemoryEvidenceInputItem[] = []
  const seen = new Set<string>()

  for (const item of canonicalItems) {
    const key = `${item.type}:${item.id ?? ""}:${item.label ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  for (const item of legacy) {
    const key = `${item.type}:${item.id ?? ""}:${item.label ?? ""}`
    const hasSameType = merged.some((mergedItem) => mergedItem.type === item.type)
    if ((item.id == null || item.id === "") && hasSameType) continue
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  return merged
}

export function buildProvenanceExportText(record: ProvenanceExportRecord): string {
  const timestamp = record.timestamp ?? record.created_at
  const legacyEvidence = buildMemoryEvidenceChain({
    id: record.id,
    group_id: record.group_id ?? undefined,
    status: record.status ?? undefined,
    source_event_id: record.source_event_id ?? undefined,
    proposal_id: record.proposal_id ?? undefined,
    trace_ref: record.trace_ref ?? undefined,
    superseded_by: record.superseded_by ?? undefined,
    version: record.version,
  })
  const evidence = mergeEvidence(record.evidence, legacyEvidence)

  return [
    "Allura Memory Provenance Export",
    `Memory ID: ${record.id}`,
    `Content: ${record.content}`,
    `Source: ${valueOrUnavailable(record.source)}`,
    `Provenance: ${valueOrUnavailable(record.provenance)}`,
    `Actor: ${valueOrUnavailable(record.actor)}`,
    `User: ${valueOrUnavailable(record.user_id)}`,
    `Creator: ${valueOrUnavailable(record.creator)}`,
    `Approver: ${valueOrUnavailable(record.approver)}`,
    `Timestamp: ${valueOrUnavailable(timestamp)}`,
    `Tenant scope: ${valueOrUnavailable(record.group_id)}`,
    `Status: ${valueOrUnavailable(record.status)}`,
    `Confidence: ${formatConfidence(record)}`,
    ...formatEvidence(evidence),
    `Hash: ${valueOrUnavailable(record.hash)}`,
    `Previous hash: ${valueOrUnavailable(record.previous_hash)}`,
    "Read-only: this export performed no memory mutation.",
  ].join("\n")
}
