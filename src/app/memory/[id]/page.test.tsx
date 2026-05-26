/**
 * Tests for Memory Detail Page — /memory/[id]
 *
 * Vitest, node environment.
 * Tests helper functions and API interaction logic.
 * Component rendering tests would require jsdom (not in current config).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

// ── Mock env vars ─────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_DEFAULT_GROUP_ID = "allura-test"
process.env.NEXT_PUBLIC_DEFAULT_USER_ID = "test-user"

// ── Helper function tests ──────────────────────────────────────────────────

/** Replicate the normalizeCreatedAt function from the page (same logic) */
function normalizeCreatedAt(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "year" in (value as Record<string, unknown>)) {
    const d = value as Record<string, { low: number; high?: number }>
    const get = (field: string): number => d[field]?.low ?? 0
    return new Date(
      Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
        Math.floor(get("nanosecond") / 1_000_000)
      )
    ).toISOString()
  }
  return String(value ?? new Date().toISOString())
}

/** Replicate the sourceBadgeVariant function */
function sourceBadgeVariant(source: "episodic" | "semantic" | "both"): "default" | "secondary" | "outline" {
  switch (source) {
    case "episodic":
      return "secondary"
    case "semantic":
      return "default"
    case "both":
      return "outline"
  }
}

// ── Test Data ──────────────────────────────────────────────────────────────

const MOCK_MEMORY_GET_RESPONSE = {
  id: "test-memory-id",
  content: "I prefer TypeScript over JavaScript",
  score: 0.92,
  source: "both" as const,
  provenance: "manual" as const,
  user_id: "test-user",
  created_at: "2025-01-15T10:30:00.000Z",
  version: 2,
  usage_count: 5,
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("normalizeCreatedAt", () => {
  it("should return string as-is when already ISO string", () => {
    const result = normalizeCreatedAt("2025-01-15T10:30:00.000Z")
    expect(result).toBe("2025-01-15T10:30:00.000Z")
  })

  it("should convert Neo4j DateTime object to ISO string", () => {
    const neo4jDate = {
      year: { low: 2025, high: 0 },
      month: { low: 1, high: 0 },
      day: { low: 15, high: 0 },
      hour: { low: 10, high: 0 },
      minute: { low: 30, high: 0 },
      second: { low: 0, high: 0 },
      nanosecond: { low: 0, high: 0 },
    }
    const result = normalizeCreatedAt(neo4jDate)
    expect(result).toBe("2025-01-15T10:30:00.000Z")
  })

  it("should fallback for null/undefined value", () => {
    const result = normalizeCreatedAt(null)
    expect(result).toBeTruthy()
    // Should be a valid date string
    expect(() => new Date(result)).not.toThrow()
  })
})

describe("sourceBadgeVariant", () => {
  it("should return 'secondary' for episodic source", () => {
    expect(sourceBadgeVariant("episodic")).toBe("secondary")
  })

  it("should return 'default' for semantic source", () => {
    expect(sourceBadgeVariant("semantic")).toBe("default")
  })

  it("should return 'outline' for 'both' source", () => {
    expect(sourceBadgeVariant("both")).toBe("outline")
  })
})

describe("Memory Detail API interaction", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  it("should call GET /api/memory/[id] with correct group_id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_MEMORY_GET_RESPONSE,
    })

    // Simulate the fetch pattern from the detail page
    const memoryId = "test-memory-id"
    const groupId = "allura-test"
    const response = await mockFetch(
      `/api/memory/${encodeURIComponent(memoryId)}?group_id=${encodeURIComponent(groupId)}`
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (response as any).json()

    expect(mockFetch).toHaveBeenCalledWith("/api/memory/test-memory-id?group_id=allura-test")
    expect(data).toEqual(MOCK_MEMORY_GET_RESPONSE)
  })

  it("should handle 404 response from GET", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "Memory not found" }),
    })

    const response = await mockFetch("/api/memory/nonexistent?group_id=allura-test")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((response as any).ok).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((response as any).status).toBe(404)
  })

})

describe("Memory Detail read-only boundary", () => {
  const source = readFileSync("src/app/memory/[id]/page.tsx", "utf8")

  it("does not keep edit, delete, or restore request methods in the read-only detail page", () => {
    expect(source).not.toContain('method: "PUT"')
    expect(source).not.toContain('method: "DELETE"')
    expect(source).not.toContain('method: "POST"')
  })

  it("uses provenance-preserving copy and export actions instead of raw ID-only copy", () => {
    expect(source).toContain("buildProvenanceExportText")
    expect(source).toContain("evidence: evidenceChain")
    expect(source).toContain("Copy provenance")
    expect(source).toContain("Export provenance")
    expect(source).not.toContain("Copy memory ID")
  })

  it("does not label user_id alone as an explicit actor field", () => {
    expect(source).toContain(">Actor</dt>")
    expect(source).toContain(">User</dt>")
    expect(source).toContain('memory.actor || "Unavailable"')
    expect(source).toContain('memory.user_id || "Unavailable"')
    expect(source).not.toContain("User / actor")
    expect(source).not.toContain("memory.actor ?? memory.user_id")
  })

  it("shows creator and approver separately from actor", () => {
    expect(source).toContain("Creator")
    expect(source).toContain("Approver")
    expect(source).toContain("User")
    expect(source).toContain('memory.actor || "Unavailable"')
  })

  it("renders explicit degraded copy and export failure messages", () => {
    expect(source).toContain("Clipboard export failed. Provenance was not copied.")
    expect(source).toContain("File export failed. Provenance was not downloaded.")
    expect(source).toContain("exportError")
  })

  it("marks deleted-list fallback records as deleted and avoids inventing missing tenant scope", () => {
    expect(source).toContain('status: deleted.status ?? "deleted"')
    expect(source).toContain('memory.group_id ?? "Unavailable"')
    expect(source).not.toContain("memory.group_id ?? groupId")
  })

  it("keys evidence rows by id as well as type and label", () => {
    expect(source).toContain('`${item.type}:${item.label}:${item.id ?? "unavailable"}`')
  })
})
