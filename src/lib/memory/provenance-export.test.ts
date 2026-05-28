import { describe, expect, it } from "vitest"
import { buildProvenanceExportText } from "@/lib/memory/provenance-export"

describe("buildProvenanceExportText", () => {
  it("includes memory provenance fields needed for external review", () => {
    const text = buildProvenanceExportText({
      id: "mem-1",
      content: "Remember the boundary.",
      source: "semantic",
      provenance: "conversation",
      user_id: "woz-builder",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      status: "approved",
      score: 0.91,
      evidence: [{ id: "event-1", type: "event", label: "Source event", status: "available" }],
      hash: "hash-1",
      previous_hash: "hash-0",
    })

    expect(text).toContain("Memory ID: mem-1")
    expect(text).toContain("Source: semantic")
    expect(text).toContain("Actor: Unavailable")
    expect(text).toContain("User: woz-builder")
    expect(text).toContain("Tenant scope: allura-system")
    expect(text).toContain("Status: approved")
    expect(text).toContain("Confidence: 91%")
    expect(text).toContain("Source event: event-1")
    expect(text).toContain("Hash: hash-1")
    expect(text).toContain("Previous hash: hash-0")
  })

  it("preserves distinct creator and approver roles when present", () => {
    const text = buildProvenanceExportText({
      id: "audit-1",
      content: "Proposal approved.",
      source: "audit",
      actor: "curator-1",
      creator: "author-1",
      approver: "curator-1",
      group_id: "allura-system",
      timestamp: "2026-05-24T09:05:00.000Z",
      status: "approved",
      confidence: 0.86,
      evidence: [{ id: "trace-1", type: "trace", label: "Audit trace", status: "available" }],
      hash: "hash-audit-1",
      previous_hash: "hash-audit-0",
    })

    expect(text).toContain("Actor: curator-1")
    expect(text).toContain("Creator: author-1")
    expect(text).toContain("Approver: curator-1")
    expect(text).toContain("Audit trace: trace-1")
  })

  it("does not infer actor from creator or approver when actor is unavailable", () => {
    const text = buildProvenanceExportText({
      id: "audit-2",
      content: "Approval record without actor field.",
      source: "audit",
      creator: "author-2",
      approver: "curator-2",
      group_id: "allura-system",
      timestamp: "2026-05-24T09:07:00.000Z",
      status: "approved",
      confidence: 0.86,
    })

    expect(text).toContain("Actor: Unavailable")
    expect(text).toContain("Creator: author-2")
    expect(text).toContain("Approver: curator-2")
  })

  it("does not relabel creator or approver as actor when actor is absent", () => {
    const text = buildProvenanceExportText({
      id: "audit-2",
      content: "Approval receipt.",
      source: "audit",
      creator: "author-2",
      approver: "curator-2",
      group_id: "allura-system",
      timestamp: "2026-05-24T09:05:00.000Z",
      status: "approved",
      confidence: 0.86,
    })

    expect(text).toContain("Actor: Unavailable")
    expect(text).toContain("Creator: author-2")
    expect(text).toContain("Approver: curator-2")
  })

  it("keeps user identity separate from missing actor provenance", () => {
    const text = buildProvenanceExportText({
      id: "mem-user-only",
      content: "User identity is not actor provenance.",
      source: "semantic",
      provenance: "conversation",
      user_id: "woz-builder",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      status: "approved",
      score: 0.91,
    })

    expect(text).toContain("Actor: Unavailable")
    expect(text).toContain("User: woz-builder")
  })

  it("preserves legacy evidence references supplied by the detail evidence chain", () => {
    const text = buildProvenanceExportText({
      id: "mem-legacy",
      content: "Legacy evidence record.",
      source: "semantic",
      provenance: "conversation",
      user_id: "scout-recon",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      status: "approved",
      score: 0.77,
      evidence: [
        { id: "event-legacy", type: "event", label: "Source event", status: "available" },
        { id: "proposal-legacy", type: "proposal", label: "Curator proposal", status: "available" },
        { id: "trace-legacy", type: "trace", label: "Trace reference", status: "available" },
      ],
    })

    expect(text).toContain("Source event: event-legacy")
    expect(text).toContain("Curator proposal: proposal-legacy")
    expect(text).toContain("Trace reference: trace-legacy")
  })

  it("keeps unavailable markers when canonical evidence is partial", () => {
    const text = buildProvenanceExportText({
      id: "mem-partial",
      content: "Partial evidence.",
      source: "semantic",
      provenance: "conversation",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      score: 0.77,
      evidence: [{ id: "event-partial", type: "event", label: "Source event", status: "available" }],
    })

    expect(text).toContain("Source event: event-partial")
    expect(text).toContain("Curator proposal: Unavailable (unavailable)")
    expect(text).toContain("Trace reference: Unavailable (unavailable)")
  })

  it("preserves canonical and legacy evidence references on mixed records", () => {
    const text = buildProvenanceExportText({
      id: "mem-mixed",
      content: "Mixed evidence record.",
      source: "semantic",
      provenance: "conversation",
      user_id: "scout-recon",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      status: "approved",
      evidence: [{ id: "canonical-event", type: "event", label: "Canonical evidence", status: "available" }],
      source_event_id: "legacy-event",
      proposal_id: "legacy-proposal",
      trace_ref: "legacy-trace",
    })

    expect(text).toContain("Canonical evidence: canonical-event")
    expect(text).toContain("Source event: legacy-event")
    expect(text).toContain("Curator proposal: legacy-proposal")
    expect(text).toContain("Trace reference: legacy-trace")
  })

  it("keeps valid legacy evidence when canonical evidence is unavailable", () => {
    const text = buildProvenanceExportText({
      id: "mem-mixed-unavailable",
      content: "Mixed unavailable evidence record.",
      source: "semantic",
      provenance: "conversation",
      user_id: "scout-recon",
      group_id: "allura-system",
      evidence: [{ id: null, type: "event", label: "Canonical placeholder", status: "unavailable" }],
      source_event_id: "legacy-event",
      proposal_id: "legacy-proposal",
    })

    expect(text).toContain("Canonical placeholder: Unavailable (unavailable)")
    expect(text).toContain("Source event: legacy-event")
    expect(text).toContain("Curator proposal: legacy-proposal")
  })

  it("falls back to legacy source references when canonical evidence is absent", () => {
    const text = buildProvenanceExportText({
      id: "mem-legacy-fields",
      content: "Legacy evidence fields.",
      source: "semantic",
      provenance: "conversation",
      user_id: "scout-recon",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      status: "approved",
      score: 0.77,
      source_event_id: "event-field",
      proposal_id: "proposal-field",
      trace_ref: "trace-field",
    })

    expect(text).toContain("Source event: event-field")
    expect(text).toContain("Curator proposal: proposal-field")
    expect(text).toContain("Trace reference: trace-field")
  })

  it("preserves creator and approver as distinct provenance roles", () => {
    const text = buildProvenanceExportText({
      id: "audit-1",
      content: "Approval receipt",
      source: "semantic",
      provenance: "manual",
      creator: "curator-a",
      approver: "curator-b",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      status: "approved",
      score: 0.8,
    })

    expect(text).toContain("Creator: curator-a")
    expect(text).toContain("Approver: curator-b")
  })

  it("exports legacy evidence references when canonical evidence array is absent", () => {
    const text = buildProvenanceExportText({
      id: "mem-legacy",
      content: "Legacy evidence fields",
      source: "episodic",
      provenance: "conversation",
      user_id: "scout-recon",
      group_id: "allura-system",
      created_at: "2026-05-24T09:00:00.000Z",
      score: 0.7,
      source_event_id: "event-legacy",
      proposal_id: "proposal-legacy",
      trace_ref: "trace-legacy",
    })

    expect(text).toContain("Source event: event-legacy")
    expect(text).toContain("Curator proposal: proposal-legacy")
    expect(text).toContain("Trace reference: trace-legacy")
  })

  it("labels missing provenance as unavailable without inventing values", () => {
    const text = buildProvenanceExportText({
      id: "mem-2",
      content: "Sparse record.",
      source: "episodic",
      provenance: "manual",
      created_at: "2026-05-24T09:00:00.000Z",
      score: 0.5,
    })

    expect(text).toContain("Actor: Unavailable")
    expect(text).toContain("Creator: Unavailable")
    expect(text).toContain("Approver: Unavailable")
    expect(text).toContain("Tenant scope: Unavailable")
    expect(text).toContain("Status: Unavailable")
    expect(text).toContain("Evidence: Unavailable")
    expect(text).not.toContain("allura-system")
  })
})
