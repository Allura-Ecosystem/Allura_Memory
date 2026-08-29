import { describe, expect, it, vi } from "vitest"

import type { ConformedRecord } from "../batch-conformance"
import type { BatchStoreDeps } from "../batch-store"
import type { IngestLease } from "../ingest-pipeline"
import {
  evaluatePromotion,
  persistPromotion,
  type PromotionContext,
} from "../promotion-engine"

// ── Test helpers ──────────────────────────────────────────────────────────

const lease: IngestLease = {
  groupId: "allura-acme",
  workspaceId: "ws-1",
  sourceId: "source-1",
  sourceRevisionId: "rev-1",
  leaseId: "lease-1",
}

function makeSummary(overrides: Partial<ConformedRecord> = {}): ConformedRecord {
  return {
    line_number: 99,
    line_sha256: "a".repeat(64),
    record_type: "scan_summary",
    record_id: "scan_summary:" + "e".repeat(64),
    run_id: "c".repeat(32),
    sanitized_payload: {
      status: "complete",
      timed_out: false,
      error: "",
      roots: [{ path: "/repo", kind: "git" }],
      counts: { npm: 2 },
      package_records_emitted: 2,
      package_records_suppressed: 0,
      findings_emitted: 0,
      duplicates: 0,
      diagnostics_count: 0,
      files_considered: 10,
      duration_ms: 1000,
    },
    canonical_id_inputs: "baseline|complete|...",
    redaction_provenance: { endpoint: "stripped" },
    ...overrides,
  }
}

function makePackage(
  index = 0,
  ecosystem = "npm",
  payloadOverrides: Record<string, unknown> = {},
): ConformedRecord {
  return {
    line_number: index + 1,
    line_sha256: "b".repeat(64),
    record_type: "package",
    record_id: `package:${"b".repeat(60)}${String(index).padStart(4, "0")}`,
    run_id: "c".repeat(32),
    sanitized_payload: {
      ecosystem,
      normalized_name: "lodash",
      version: "4.17.21",
      ...payloadOverrides,
    },
    canonical_id_inputs: `baseline|${ecosystem}|lodash|4.17.21`,
    redaction_provenance: { endpoint: "stripped" },
  }
}

function makeCtx(overrides: Partial<PromotionContext> = {}): PromotionContext {
  return {
    lease,
    batchId: "batch_abc",
    records: [makePackage(0), makePackage(1)],
    summary: makeSummary(),
    sourceProfile: "baseline",
    sourceMode: "inventory",
    sourceEcosystems: ["npm"],
    sourceRoots: [{ path: "/repo", kind: "git" }],
    ...overrides,
  }
}

// A fake pool that records every query verbatim.  Same pattern as
// batch-store.test.ts — lets us assert the exact INSERT without a database.
function fakePool() {
  const calls: { text: string; params: unknown[] }[] = []
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    calls.push({ text, params })
    return { rows: [] }
  })
  return { pool: { query } as unknown as BatchStoreDeps["pool"], calls }
}

// ── evaluatePromotion ─────────────────────────────────────────────────────

describe("evaluatePromotion", () => {
  it("complete baseline inventory with matching counts → PROMOTED_COMPLETE", () => {
    const result = evaluatePromotion(makeCtx())
    expect(result.decision).toBe("promoted")
    expect(result.reasonCode).toBe("PROMOTED_COMPLETE")
  })

  it("complete empty baseline inventory (counts=0, no package records) → PROMOTED_COMPLETE", () => {
    const ctx = makeCtx({
      records: [],
      summary: makeSummary({
        sanitized_payload: {
          ...makeSummary().sanitized_payload,
          package_records_emitted: 0,
          counts: {},
        },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("promoted")
    expect(result.reasonCode).toBe("PROMOTED_COMPLETE")
  })

  it("complete project profile inventory with matching counts → PROMOTED_COMPLETE", () => {
    const ctx = makeCtx({ sourceProfile: "project" })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("promoted")
    expect(result.reasonCode).toBe("PROMOTED_COMPLETE")
  })

  it("findings-only mode → HELD_FINDINGS_ONLY", () => {
    const ctx = makeCtx({ sourceMode: "findings-only" })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_FINDINGS_ONLY")
  })

  it("deep profile → HELD_DEEP_PROFILE", () => {
    const ctx = makeCtx({ sourceProfile: "deep" })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_DEEP_PROFILE")
  })

  it("partial status → HELD_PARTIAL", () => {
    const ctx = makeCtx({
      summary: makeSummary({
        sanitized_payload: { ...makeSummary().sanitized_payload, status: "partial" },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_PARTIAL")
  })

  it("error status → HELD_ERROR", () => {
    const ctx = makeCtx({
      summary: makeSummary({
        sanitized_payload: { ...makeSummary().sanitized_payload, status: "error" },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_ERROR")
  })

  it("timeout → HELD_TIMEOUT", () => {
    const ctx = makeCtx({
      summary: makeSummary({
        sanitized_payload: { ...makeSummary().sanitized_payload, timed_out: true },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_TIMEOUT")
  })

  it("missing summary → HELD_MISSING_SUMMARY", () => {
    const ctx = makeCtx({ summary: undefined })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_MISSING_SUMMARY")
  })

  it("contradictory counts (summary says 2 packages but only 1 package record) → HELD with reason", () => {
    const ctx = makeCtx({
      records: [makePackage(0)],
      summary: makeSummary({
        sanitized_payload: {
          ...makeSummary().sanitized_payload,
          package_records_emitted: 2,
          counts: { npm: 2 },
        },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toMatch(/^HELD_/)
  })

  it("changed roots (summary roots don't match source config) → HELD_CHANGED_ROOTS", () => {
    const ctx = makeCtx({
      sourceRoots: [{ path: "/expected", kind: "git" }],
      summary: makeSummary({
        sanitized_payload: {
          ...makeSummary().sanitized_payload,
          roots: [{ path: "/different", kind: "git" }],
        },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_CHANGED_ROOTS")
  })

  it("non-empty error field with complete status → HELD_ERROR", () => {
    const ctx = makeCtx({
      summary: makeSummary({
        sanitized_payload: {
          ...makeSummary().sanitized_payload,
          status: "complete",
          error: "something went wrong",
        },
      }),
    })
    const result = evaluatePromotion(ctx)
    expect(result.decision).toBe("held")
    expect(result.reasonCode).toBe("HELD_ERROR")
  })
})

// ── persistPromotion ──────────────────────────────────────────────────────

describe("persistPromotion", () => {
  it("writes a promoted decision with summary_record_id (mock pool, assert INSERT)", async () => {
    const { pool, calls } = fakePool()
    const summaryRecordId = "scan_summary:" + "e".repeat(64)

    await persistPromotion(
      { pool, transactional: false },
      {
        lease,
        batchId: "batch_abc",
        runId: "c".repeat(32),
        summaryRecordId,
        decision: "promoted",
        reasonCode: "PROMOTED_COMPLETE",
      },
    )

    const insertCall = calls.find((c) => c.text.includes("INSERT INTO bumblebee_run_decisions"))
    expect(insertCall).toBeDefined()
    // The decision column must carry 'promoted'
    expect(insertCall!.params).toContain("promoted")
    // The reason_code column must carry the stable code
    expect(insertCall!.params).toContain("PROMOTED_COMPLETE")
    // The summary_record_id must be present for a promoted decision
    expect(insertCall!.params).toContain(summaryRecordId)
  })

  it("writes a held decision (summary_record_id optional)", async () => {
    const { pool, calls } = fakePool()

    await persistPromotion(
      { pool, transactional: false },
      {
        lease,
        batchId: "batch_abc",
        runId: "c".repeat(32),
        summaryRecordId: "",
        decision: "held",
        reasonCode: "HELD_FINDINGS_ONLY",
      },
    )

    const insertCall = calls.find((c) => c.text.includes("INSERT INTO bumblebee_run_decisions"))
    expect(insertCall).toBeDefined()
    expect(insertCall!.params).toContain("held")
    expect(insertCall!.params).toContain("HELD_FINDINGS_ONLY")
  })

  it("rejects promoted without summaryRecordId", async () => {
    const { pool } = fakePool()

    await expect(
      persistPromotion(
        { pool, transactional: false },
        {
          lease,
          batchId: "batch_abc",
          runId: "c".repeat(32),
          summaryRecordId: "",
          decision: "promoted",
          reasonCode: "PROMOTED_COMPLETE",
        },
      ),
    ).rejects.toThrow()
  })
})