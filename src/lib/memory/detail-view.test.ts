import { describe, expect, it } from "vitest"
import { buildMemoryEvidenceChain, getMemoryReadOnlyActions } from "@/lib/memory/detail-view"

describe("buildMemoryEvidenceChain", () => {
  it("shows available source event and proposal references without inventing missing evidence", () => {
    const chain = buildMemoryEvidenceChain({
      id: "mem-1",
      group_id: "allura-system",
      status: "approved",
      source_event_id: "event-1",
      proposal_id: "proposal-1",
      trace_ref: null,
    })

    expect(chain).toEqual([
      { id: "event-1", type: "event", label: "Source event", status: "available" },
      { id: "proposal-1", type: "proposal", label: "Curator proposal", status: "available" },
      { id: null, type: "trace", label: "Trace reference", status: "unavailable" },
    ])
  })

  it("preserves canonical evidence entries instead of replacing them with unavailable placeholders", () => {
    const chain = buildMemoryEvidenceChain({
      id: "mem-1",
      group_id: "allura-system",
      evidence: [
        { id: "event-9", type: "event", label: "Original event", status: "available" },
        { id: "trace-9", type: "trace", label: "Audit trace", status: "available" },
      ],
    })

    expect(chain).toEqual([
      { id: "event-9", type: "event", label: "Original event", status: "available" },
      { id: "trace-9", type: "trace", label: "Audit trace", status: "available" },
      { id: null, type: "proposal", label: "Curator proposal", status: "unavailable" },
    ])
  })

  it("preserves legacy evidence references alongside canonical evidence entries", () => {
    const chain = buildMemoryEvidenceChain({
      id: "mem-1",
      group_id: "allura-system",
      source_event_id: "event-legacy",
      proposal_id: "proposal-legacy",
      trace_ref: "trace-legacy",
      evidence: [
        { id: null, type: "event", label: "Canonical placeholder", status: "unavailable" },
        { id: "trace-canonical", type: "trace", label: "Canonical trace", status: "available" },
      ],
    })

    expect(chain).toEqual([
      { id: null, type: "event", label: "Canonical placeholder", status: "unavailable" },
      { id: "trace-canonical", type: "trace", label: "Canonical trace", status: "available" },
      { id: "event-legacy", type: "event", label: "Source event", status: "available" },
      { id: "proposal-legacy", type: "proposal", label: "Curator proposal", status: "available" },
      { id: "trace-legacy", type: "trace", label: "Trace reference", status: "available" },
    ])
  })

  it("does not invent superseding evidence for versioned records without a superseded_by reference", () => {
    const chain = buildMemoryEvidenceChain({
      id: "mem-1",
      version: 1,
    })

    expect(chain).not.toContainEqual({
      id: null,
      type: "version",
      label: "Superseding memory",
      status: "unavailable",
    })
  })

  it("does not expose approval or mutation actions in the read-only detail story", () => {
    expect(getMemoryReadOnlyActions()).toEqual(["copy-provenance", "export-provenance", "retry-load"])
  })
})
