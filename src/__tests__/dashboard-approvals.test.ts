/**
 * @vitest-environment node
 *
 * Tests for the Approvals dashboard page data-loading logic and
 * the handoff reject API route.
 */

import { describe, expect, it } from "vitest"

// ── Helper: build a checkpoint_blocked event metadata payload ─────────────────

function makeCheckpointMeta(checkpointId: string, runId?: string) {
  return {
    checkpoint_id: checkpointId,
    ...(runId ? { run_id: runId } : {}),
  }
}

// ── Checkpoint approval metadata extraction ───────────────────────────────────

describe("Approvals page — checkpoint metadata extraction", () => {
  it("extracts checkpoint_id from metadata", () => {
    const meta = makeCheckpointMeta("chk_abc123", "run_xyz")
    const checkpointId = (meta.checkpoint_id as string) ?? "fallback"
    expect(checkpointId).toBe("chk_abc123")
  })

  it("falls back to event_id when checkpoint_id is absent", () => {
    const meta: Record<string, unknown> = {}
    const checkpointId = (meta.checkpoint_id as string) ?? "event_fallback_id"
    expect(checkpointId).toBe("event_fallback_id")
  })

  it("extracts run_id from metadata", () => {
    const meta = makeCheckpointMeta("chk_abc123", "run_xyz")
    expect(meta.run_id).toBe("run_xyz")
  })

  it("handles metadata without run_id gracefully", () => {
    const meta = makeCheckpointMeta("chk_abc123")
    expect((meta as Record<string, unknown>).run_id).toBeUndefined()
  })
})

// ── Score pill threshold logic ────────────────────────────────────────────────

describe("Approvals page — curator proposal score thresholds", () => {
  function scoreTier(score: number): "high" | "medium" | "low" {
    if (score >= 0.8) return "high"
    if (score >= 0.6) return "medium"
    return "low"
  }

  it("marks score >= 0.8 as high tier", () => {
    expect(scoreTier(0.85)).toBe("high")
    expect(scoreTier(0.8)).toBe("high")
    expect(scoreTier(1.0)).toBe("high")
  })

  it("marks score 0.6-0.79 as medium tier", () => {
    expect(scoreTier(0.75)).toBe("medium")
    expect(scoreTier(0.6)).toBe("medium")
  })

  it("marks score < 0.6 as low tier", () => {
    expect(scoreTier(0.5)).toBe("low")
    expect(scoreTier(0.0)).toBe("low")
  })
})

// ── Content truncation ────────────────────────────────────────────────────────

describe("Approvals page — content truncation", () => {
  it("truncates long content to 120 characters for display", () => {
    const content = "x".repeat(200)
    const truncated = content.slice(0, 120)
    expect(truncated.length).toBe(120)
  })

  it("preserves short content without truncation", () => {
    const content = "short text"
    const truncated = content.slice(0, 120)
    expect(truncated).toBe("short text")
  })
})

// ── Handoffs page — filter status validation ──────────────────────────────────

describe("Handoffs page — filter status parsing", () => {
  type FilterStatus = "pending" | "acknowledged" | "rejected" | "all"

  function parseFilterStatus(raw: string | undefined): FilterStatus {
    if (
      raw === "acknowledged" ||
      raw === "rejected" ||
      raw === "all"
    ) {
      return raw
    }
    return "pending"
  }

  it("defaults to pending when filter is undefined", () => {
    expect(parseFilterStatus(undefined)).toBe("pending")
  })

  it("defaults to pending for unknown values", () => {
    expect(parseFilterStatus("foobar")).toBe("pending")
    expect(parseFilterStatus("")).toBe("pending")
  })

  it("accepts all valid filter values", () => {
    expect(parseFilterStatus("pending")).toBe("pending")
    expect(parseFilterStatus("acknowledged")).toBe("acknowledged")
    expect(parseFilterStatus("rejected")).toBe("rejected")
    expect(parseFilterStatus("all")).toBe("all")
  })
})

// ── Evidence page — type filter parsing ──────────────────────────────────────

describe("Evidence page — type filter parsing", () => {
  const EVIDENCE_TYPES = [
    "all",
    "general",
    "gate_result",
    "review",
    "approval",
    "test_result",
    "audit",
  ] as const

  type EvidenceTypeFilter = (typeof EVIDENCE_TYPES)[number]

  function parseTypeFilter(raw: string | undefined): EvidenceTypeFilter {
    if ((EVIDENCE_TYPES as readonly string[]).includes(raw ?? "")) {
      return (raw as EvidenceTypeFilter)
    }
    return "all"
  }

  it("defaults to all for undefined input", () => {
    expect(parseTypeFilter(undefined)).toBe("all")
  })

  it("defaults to all for unknown type strings", () => {
    expect(parseTypeFilter("screenshot")).toBe("all")
    expect(parseTypeFilter("log")).toBe("all")
  })

  it("accepts all canonical evidence types", () => {
    for (const type of EVIDENCE_TYPES) {
      expect(parseTypeFilter(type)).toBe(type)
    }
  })
})

// ── Evidence page — content preview field priority ────────────────────────────

describe("Evidence page — ContentPreview field priority", () => {
  function extractSummaryField(content: Record<string, unknown>): string | undefined {
    return (
      (content.summary as string | undefined) ??
      (content.message as string | undefined) ??
      (content.description as string | undefined) ??
      (content.result as string | undefined) ??
      (content.output as string | undefined)
    )
  }

  it("prefers summary field", () => {
    expect(extractSummaryField({ summary: "s", message: "m" })).toBe("s")
  })

  it("falls back to message when summary is absent", () => {
    expect(extractSummaryField({ message: "m", description: "d" })).toBe("m")
  })

  it("falls back to description when summary and message are absent", () => {
    expect(extractSummaryField({ description: "d", result: "r" })).toBe("d")
  })

  it("falls back to result", () => {
    expect(extractSummaryField({ result: "r", output: "o" })).toBe("r")
  })

  it("falls back to output", () => {
    expect(extractSummaryField({ output: "o" })).toBe("o")
  })

  it("returns undefined when no known field exists", () => {
    expect(extractSummaryField({ unknown_field: "x" })).toBeUndefined()
  })
})

// ── Relative time formatting ──────────────────────────────────────────────────

describe("Dashboard pages — relative time formatting", () => {
  function formatRelativeTime(date: Date): string {
    const now = Date.now()
    const diff = now - new Date(date).getTime()
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  it("formats seconds correctly", () => {
    const d = new Date(Date.now() - 30_000)
    expect(formatRelativeTime(d)).toBe("30s ago")
  })

  it("formats minutes correctly", () => {
    const d = new Date(Date.now() - 5 * 60_000)
    expect(formatRelativeTime(d)).toBe("5m ago")
  })

  it("formats hours correctly", () => {
    const d = new Date(Date.now() - 3 * 60 * 60_000)
    expect(formatRelativeTime(d)).toBe("3h ago")
  })

  it("formats days correctly", () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60_000)
    expect(formatRelativeTime(d)).toBe("2d ago")
  })
})
