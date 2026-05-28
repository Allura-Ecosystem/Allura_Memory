export type ProvenanceDriftSeverity = "none" | "major" | "critical"
export type ProvenanceDriftStatus = "mapped" | "derived" | "missing" | "unknown"

export interface ProvenanceBaselineMapping {
  label: string
  dictionaryRefs: string[]
  derivedFrom: string[]
  required: boolean
  missingSeverity: Exclude<ProvenanceDriftSeverity, "none">
  notes: string
}

export interface ProvenanceDriftItem extends ProvenanceBaselineMapping {
  severity: ProvenanceDriftSeverity
  status: ProvenanceDriftStatus
}

export interface ProvenanceDriftReport {
  items: ProvenanceDriftItem[]
  summary: Record<ProvenanceDriftSeverity, number>
}

export const PROVENANCE_BASELINE_MAPPINGS: readonly ProvenanceBaselineMapping[] = [
  {
    label: "Memory ID",
    dictionaryRefs: ["Neo4j: Memory.id", "Retrieval Gateway Contract: MemoryResult.id"],
    derivedFrom: [],
    required: true,
    missingSeverity: "major",
    notes: "Stable identifier for the inspected memory record.",
  },
  {
    label: "Content",
    dictionaryRefs: ["Neo4j: Memory.content", "Retrieval Gateway Contract: MemoryResult.content"],
    derivedFrom: [],
    required: true,
    missingSeverity: "major",
    notes: "Human-readable memory text being inspected or exported.",
  },
  {
    label: "Source",
    dictionaryRefs: ["Neo4j: Memory.source", "Retrieval Gateway Contract: MemoryResult.source"],
    derivedFrom: [],
    required: true,
    missingSeverity: "major",
    notes: "Origin or source store/source type, depending on the retrieved record shape.",
  },
  {
    label: "Provenance",
    dictionaryRefs: ["PostgreSQL: events.metadata.source", "Neo4j: Memory.source"],
    derivedFrom: ["UI label distinguishing conversation/manual provenance from storage source"],
    required: false,
    missingSeverity: "major",
    notes: "Documented derived label; schema exposes provenance for API items and source metadata for event traces.",
  },
  {
    label: "Actor",
    dictionaryRefs: ["PostgreSQL: events.agent_id", "AuditEvent.actor_id", "Neo4j: AUTHORED_BY"],
    derivedFrom: ["user_id/agent identity when canonical actor is unavailable"],
    required: false,
    missingSeverity: "major",
    notes: "Who caused or authored the memory/evidence event.",
  },
  {
    label: "User",
    dictionaryRefs: ["Retrieval Gateway Contract: SearchRequest.user_id", "Retrieval Gateway Contract: MemoryResult.user_id"],
    derivedFrom: [],
    required: false,
    missingSeverity: "major",
    notes: "Scoped user identifier for retrieval and provenance display.",
  },
  {
    label: "Creator",
    dictionaryRefs: ["PostgreSQL: events.agent_id", "PostgreSQL: canonical_proposals.trace_ref"],
    derivedFrom: ["proposal creator from originating trace when present"],
    required: false,
    missingSeverity: "major",
    notes: "Creation actor is derived from trace/proposal context when the retrieved envelope exposes it.",
  },
  {
    label: "Approver",
    dictionaryRefs: ["PostgreSQL: canonical_proposals.decided_by", "Metadata Payloads: proposal_approved.rationale"],
    derivedFrom: [],
    required: false,
    missingSeverity: "major",
    notes: "Human or curator identifier that made an approval decision when applicable.",
  },
  {
    label: "Timestamp",
    dictionaryRefs: ["PostgreSQL: events.created_at", "Neo4j: Memory.created_at", "AuditEvent.timestamp"],
    derivedFrom: ["created_at displayed as Timestamp for operator readability"],
    required: true,
    missingSeverity: "major",
    notes: "Temporal evidence for when the record or audit event was created.",
  },
  {
    label: "Tenant scope",
    dictionaryRefs: ["PostgreSQL: events.group_id", "Neo4j: Memory.group_id", "Retrieval Gateway Contract: MemoryResult.group_id"],
    derivedFrom: ["group_id displayed as Tenant scope for operator readability"],
    required: true,
    missingSeverity: "critical",
    notes: "Tenant boundary; missing scope is a cross-tenant leakage risk.",
  },
  {
    label: "Status",
    dictionaryRefs: ["PostgreSQL: events.status", "PostgreSQL: canonical_proposals.status", "Neo4j: Memory.status"],
    derivedFrom: [],
    required: true,
    missingSeverity: "major",
    notes: "Lifecycle state of the memory, proposal, or evidence record.",
  },
  {
    label: "Confidence",
    dictionaryRefs: ["Neo4j: Memory.confidence", "Neo4j: Memory.score", "Retrieval Gateway Contract: MemoryResult.score"],
    derivedFrom: ["score displayed as Confidence when confidence is unavailable"],
    required: false,
    missingSeverity: "major",
    notes: "Confidence/relevance score used to explain trust level.",
  },
  {
    label: "Evidence",
    dictionaryRefs: ["AuditEvent.evidence_ids", "Neo4j: Memory.source_event_id", "PostgreSQL: canonical_proposals.trace_ref"],
    derivedFrom: ["source_event_id/proposal_id/trace_ref rendered as evidence rows"],
    required: true,
    missingSeverity: "major",
    notes: "Evidence chain linking display/export back to stored trace/proposal/version records.",
  },
  {
    label: "Hash",
    dictionaryRefs: ["AuditEvent.hash", "PostgreSQL: canonical_proposals.witness_hash"],
    derivedFrom: [],
    required: false,
    missingSeverity: "major",
    notes: "Integrity hash when the source record supplies one.",
  },
  {
    label: "Previous hash",
    dictionaryRefs: ["AuditEvent.prev_hash"],
    derivedFrom: ["previous_hash is the UI/API alias for AuditEvent.prev_hash"],
    required: false,
    missingSeverity: "major",
    notes: "Previous audit-chain hash when the source record supplies one.",
  },
] as const

export const REQUIRED_PROVENANCE_BASELINE_LABELS = PROVENANCE_BASELINE_MAPPINGS
  .filter((mapping) => mapping.required)
  .map((mapping) => mapping.label)

export function validateProvenanceDriftAgainstBaseline(labels: readonly string[]): ProvenanceDriftReport {
  const provided = new Set(labels)
  const configuredLabels = new Set(PROVENANCE_BASELINE_MAPPINGS.map((mapping) => mapping.label))
  const items: ProvenanceDriftItem[] = []

  for (const mapping of PROVENANCE_BASELINE_MAPPINGS) {
    const status: ProvenanceDriftStatus = provided.has(mapping.label)
      ? mapping.dictionaryRefs.length > 0
        ? "mapped"
        : "derived"
      : "missing"
    const severity: ProvenanceDriftSeverity = status === "missing" && mapping.required ? mapping.missingSeverity : "none"
    items.push({ ...mapping, status, severity })
  }

  for (const label of labels) {
    if (configuredLabels.has(label)) continue
    items.push({
      label,
      dictionaryRefs: [],
      derivedFrom: [],
      required: false,
      missingSeverity: "major",
      notes: "No Data Dictionary mapping or derived-label documentation exists for this provenance label.",
      status: "unknown",
      severity: "major",
    })
  }

  return {
    items,
    summary: {
      none: items.filter((item) => item.severity === "none").length,
      major: items.filter((item) => item.severity === "major").length,
      critical: items.filter((item) => item.severity === "critical").length,
    },
  }
}
