export type MemoryEvidenceType = "event" | "proposal" | "trace" | "version"
export type MemoryEvidenceStatus = "available" | "unavailable"

export interface MemoryEvidenceChainItem {
  id: string | null
  type: MemoryEvidenceType
  label: string
  status: MemoryEvidenceStatus
}

export interface MemoryEvidenceInputItem {
  id?: string | number | null
  type: MemoryEvidenceType
  label?: string | null
  status?: MemoryEvidenceStatus | null
}

export interface MemoryEvidenceSource {
  id: string
  group_id?: string
  status?: string
  source_event_id?: string | null
  proposal_id?: string | null
  trace_ref?: string | number | null
  superseded_by?: string | null
  version?: number
  evidence?: MemoryEvidenceInputItem[] | null
}

function evidenceItem(
  id: string | number | null | undefined,
  type: MemoryEvidenceType,
  label: string
): MemoryEvidenceChainItem {
  const normalizedId = id == null || id === "" ? null : String(id)
  return {
    id: normalizedId,
    type,
    label,
    status: normalizedId ? "available" : "unavailable",
  }
}

export function buildMemoryEvidenceChain(memory: MemoryEvidenceSource): MemoryEvidenceChainItem[] {
  const canonicalEvidence = memory.evidence?.map((item) => ({
    id: item.id == null || item.id === "" ? null : String(item.id),
    type: item.type,
    label: item.label?.trim() || defaultEvidenceLabel(item.type),
    status: item.status ?? (item.id == null || item.id === "" ? "unavailable" : "available"),
  }))

  const legacyEvidence = [
    evidenceItem(memory.source_event_id, "event", "Source event"),
    evidenceItem(memory.proposal_id, "proposal", "Curator proposal"),
    evidenceItem(memory.trace_ref, "trace", "Trace reference"),
  ]

  const chain = mergeEvidenceChain(canonicalEvidence, legacyEvidence)

  if (memory.superseded_by) {
    chain.push(evidenceItem(memory.superseded_by ?? null, "version", "Superseding memory"))
  }

  return chain
}

function mergeEvidenceChain(
  canonicalEvidence: MemoryEvidenceChainItem[] | undefined,
  legacyEvidence: MemoryEvidenceChainItem[]
): MemoryEvidenceChainItem[] {
  if (!canonicalEvidence?.length) return legacyEvidence

  const merged: MemoryEvidenceChainItem[] = []
  const seen = new Set<string>()

  for (const item of canonicalEvidence) {
    const key = `${item.type}:${item.id ?? ""}:${item.label}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  for (const item of legacyEvidence) {
    if (item.status === "unavailable" && merged.some((mergedItem) => mergedItem.type === item.type && mergedItem.status === "available")) continue
    const key = `${item.type}:${item.id ?? ""}:${item.label}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }

  return merged
}

function defaultEvidenceLabel(type: MemoryEvidenceType): string {
  if (type === "event") return "Source event"
  if (type === "proposal") return "Curator proposal"
  if (type === "trace") return "Trace reference"
  return "Superseding memory"
}

export function getMemoryReadOnlyActions(): string[] {
  return ["copy-provenance", "export-provenance", "retry-load"]
}

export function memoryVersionStatus(memory: Pick<MemoryEvidenceSource, "status" | "superseded_by">): string {
  if (memory.status) return memory.status
  return memory.superseded_by ? "deprecated" : "active"
}
