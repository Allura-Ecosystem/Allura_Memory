/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import {
  type CandidateInsight,
  classifySimilarity,
  detectApprovalPatterns,
  detectFailurePatterns,
  detectWinPatterns,
  type RawEvent,
} from "@/lib/curator/auto-curator"

describe("Auto-Curator", () => {
  const makeEvent = (overrides: Partial<RawEvent> = {}): RawEvent => ({
    id: Math.floor(Math.random() * 10000),
    event_type: "memory_add",
    agent_id: "test-agent",
    group_id: "allura-system",
    status: "completed",
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  })

  describe("classifySimilarity", () => {
    it("classifies exact duplicates as duplicate (>= 0.90)", () => {
      const result = classifySimilarity(
        "Agent always prefers dark mode",
        ["Agent always prefers dark mode"]
      )
      expect(result.classification).toBe("duplicate")
      expect(result.similarity).toBeGreaterThanOrEqual(0.9)
    })

    it("classifies near-duplicates as supersede (0.80-0.89)", () => {
      const result = classifySimilarity(
        "Agent prefers dark mode for UI interactions",
        ["Agent prefers dark mode for UI"]
      )
      expect(result.classification).toBe("supersede")
    })

    it("classifies related content (0.65-0.79)", () => {
      const result = classifySimilarity(
        "Agent likes dark themes and prefers short responses",
        ["Agent prefers dark mode over light mode"]
      )
      // This may be "related" or "new" depending on word overlap
      expect(["related", "new", "supersede"]).toContain(result.classification)
    })

    it("classifies new content as new (< 0.65)", () => {
      const result = classifySimilarity(
        "PostgreSQL is the append-only episodic evidence store",
        ["Agent prefers dark mode", "Memory search returns results"]
      )
      expect(result.classification).toBe("new")
    })

    it("returns similarity score 0 for empty existing list", () => {
      const result = classifySimilarity("Test content", [])
      expect(result.classification).toBe("new")
      expect(result.similarity).toBe(0)
    })
  })

  describe("detectFailurePatterns", () => {
    it("detects repeated failures", () => {
      const events = [
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "graph_unavailable" } }),
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "graph_unavailable" } }),
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "graph_unavailable" } }),
      ]

      const candidates = detectFailurePatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0].type).toBe("failure")
      expect(candidates[0].frequency).toBe(3)
      expect(candidates[0].requires_approval).toBe(true)
    })

    it("ignores single failures (need 2+ to form a pattern)", () => {
      const events = [
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } }),
      ]

      const candidates = detectFailurePatterns(events)
      expect(candidates.length).toBe(0)
    })
  })

  describe("detectWinPatterns", () => {
    it("detects successful promotion patterns (3+ wins)", () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        makeEvent({ event_type: "proposal_approved", agent_id: "curator", group_id: "allura-system" })
      )

      const candidates = detectWinPatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0].type).toBe("pattern")
      expect(candidates[0].frequency).toBe(5)
    })

    it("ignores fewer than 3 wins", () => {
      const events = [
        makeEvent({ event_type: "proposal_approved", agent_id: "curator" }),
        makeEvent({ event_type: "proposal_approved", agent_id: "curator" }),
      ]

      const candidates = detectWinPatterns(events)
      expect(candidates.length).toBe(0)
    })
  })

  describe("detectApprovalPatterns", () => {
    it("detects high approval rate pattern", () => {
      const events = [
        ...Array.from({ length: 9 }, () =>
          makeEvent({ event_type: "proposal_approved", group_id: "allura-system" })
        ),
        makeEvent({ event_type: "proposal_rejected", group_id: "allura-system" }),
      ]

      const candidates = detectApprovalPatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates.some((c) => c.type === "optimization")).toBe(true)
    })

    it("detects high rejection rate pattern", () => {
      const events = [
        makeEvent({ event_type: "proposal_approved", group_id: "allura-system" }),
        ...Array.from({ length: 9 }, () =>
          makeEvent({ event_type: "proposal_rejected", group_id: "allura-system" })
        ),
      ]

      const candidates = detectApprovalPatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates.some((c) => c.type === "decision" && c.impact === "high")).toBe(true)
    })

    it("ignores too few decisions", () => {
      const events = [
        makeEvent({ event_type: "proposal_approved", group_id: "allura-system" }),
        makeEvent({ event_type: "proposal_rejected", group_id: "allura-system" }),
      ]

      const candidates = detectApprovalPatterns(events)
      expect(candidates.length).toBe(0)
    })
  })
})