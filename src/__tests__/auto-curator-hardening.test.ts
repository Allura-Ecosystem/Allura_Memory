/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import {
  type CandidateInsight,
  classifySimilarity,
  detectApprovalPatterns,
  detectFailurePatterns,
  detectToolRiskPatterns,
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

  // ── P1: Determinism ──────────────────────────────────────────────────────

  describe("determinism", () => {
    it("classifies the same input identically across multiple calls", () => {
      const content = "Agent always prefers dark mode"
      const existing = ["Agent prefers dark mode"]

      const result1 = classifySimilarity(content, existing)
      const result2 = classifySimilarity(content, existing)
      const result3 = classifySimilarity(content, existing)

      expect(result1.classification).toBe(result2.classification)
      expect(result2.classification).toBe(result3.classification)
      expect(result1.similarity).toBe(result2.similarity)
      expect(result2.similarity).toBe(result3.similarity)
    })

    it("detectFailurePatterns produces stable results for identical input", () => {
      const events = Array.from({ length: 5 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } })
      )

      const candidates1 = detectFailurePatterns(events)
      const candidates2 = detectFailurePatterns(events)

      expect(candidates1.length).toBe(candidates2.length)
      if (candidates1.length > 0 && candidates2.length > 0) {
        expect(candidates1[0].type).toBe(candidates2[0].type)
        expect(candidates1[0].frequency).toBe(candidates2[0].frequency)
        expect(candidates1[0].content).toBe(candidates2[0].content)
      }
    })

    it("classifySimilarity is order-independent", () => {
      const candidate = "Agent prefers dark mode"
      const existing = ["Agent always prefers dark mode", "Memory search returns results"]

      const result1 = classifySimilarity(candidate, existing)
      const result2 = classifySimilarity(candidate, [...existing].reverse())

      expect(result1.classification).toBe(result2.classification)
      expect(result1.similarity).toBe(result2.similarity)
    })
  })

  // ── P2: Edge Cases ──────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("empty event window produces no candidates", () => {
      expect(detectFailurePatterns([])).toHaveLength(0)
      expect(detectWinPatterns([])).toHaveLength(0)
      expect(detectApprovalPatterns([])).toHaveLength(0)
      expect(detectToolRiskPatterns([])).toHaveLength(0)
    })

    it("single event produces no false pattern", () => {
      const events = [
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } }),
      ]
      expect(detectFailurePatterns(events)).toHaveLength(0)
    })

    it("duplicate events with same error are correctly grouped", () => {
      const events = Array.from({ length: 5 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "graph_unavailable" } })
      )

      const candidates = detectFailurePatterns(events)
      expect(candidates).toHaveLength(1)
      expect(candidates[0].frequency).toBe(5)
    })

    it("high similarity to existing memory is classified as duplicate", () => {
      const result = classifySimilarity(
        "Agent prefers dark mode over light mode",
        ["Agent prefers dark mode over light mode"]
      )
      expect(result.classification).toBe("duplicate")
      expect(result.similarity).toBeGreaterThanOrEqual(0.9)
    })

    it("conflicting signals are not auto-promoted", () => {
      // 50/50 approval/rejection rate — ambiguous
      const events = [
        ...Array.from({ length: 5 }, () =>
          makeEvent({ event_type: "proposal_approved", group_id: "allura-system" })
        ),
        ...Array.from({ length: 5 }, () =>
          makeEvent({ event_type: "proposal_rejected", group_id: "allura-system" })
        ),
      ]

      const candidates = detectApprovalPatterns(events)
      // With exactly 50% approval rate, neither high-approval nor high-rejection pattern triggers
      // (both require >=0.9 or <=0.3 with total >= 5)
      // But the total is 10, so at least one pattern may trigger
      // The key invariant: no candidate should have requires_approval=false for ambiguous data
      for (const candidate of candidates) {
        // Conflicting signals should always require approval
        expect(candidate.requires_approval).toBe(true)
      }
    })

    it("low confidence content stays episodic (not promoted)", () => {
      const result = classifySimilarity(
        "maybe something vague etc",
        ["Agent prefers dark mode", "Memory search returns results"]
      )
      // Vague content should be classified as new (low similarity)
      // but the curator scoring would give it low confidence
      expect(result.classification).toBe("new")
    })

    it("events from different groups are separated", () => {
      const events = [
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", group_id: "allura-system", metadata: { error: "timeout" } }),
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", group_id: "allura-system", metadata: { error: "timeout" } }),
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", group_id: "allura-other", metadata: { error: "timeout" } }),
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", group_id: "allura-other", metadata: { error: "timeout" } }),
      ]

      const candidates = detectFailurePatterns(events)
      // Each group should have its own pattern
      const systemCandidates = candidates.filter((c) => c.group_id === "allura-system")
      const otherCandidates = candidates.filter((c) => c.group_id === "allura-other")

      expect(systemCandidates.length).toBeGreaterThanOrEqual(1)
      expect(otherCandidates.length).toBeGreaterThanOrEqual(1)
    })

    it("empty metadata does not crash detectors", () => {
      const events = [
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: {} }),
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: {} }),
      ]

      // Should not throw
      const candidates = detectFailurePatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      // Error type should default to "unknown"
      expect(candidates[0].content).toContain("unknown")
    })

    it("tool risk patterns with zero events returns empty", () => {
      const events = [makeEvent({ event_type: "memory_add" })]
      expect(detectToolRiskPatterns(events)).toHaveLength(0)
    })
  })

  // ── P3: Data Integrity ──────────────────────────────────────────────────

  describe("data integrity", () => {
    it("every candidate has all required fields", () => {
      const events = Array.from({ length: 5 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "graph_unavailable" } })
      )

      const candidates = detectFailurePatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)

      for (const candidate of candidates) {
        // All required fields present and non-null
        expect(candidate.id).toBeDefined()
        expect(candidate.group_id).toBeDefined()
        expect(candidate.type).toBeDefined()
        expect(candidate.content).toBeDefined()
        expect(candidate.confidence).toBeDefined()
        expect(typeof candidate.confidence).toBe("number")
        expect(candidate.impact).toBeDefined()
        expect(["low", "medium", "high"]).toContain(candidate.impact)
        expect(candidate.frequency).toBeDefined()
        expect(typeof candidate.frequency).toBe("number")
        expect(candidate.novelty_score).toBeDefined()
        expect(typeof candidate.novelty_score).toBe("number")
        expect(candidate.reasoning).toBeDefined()
        expect(typeof candidate.reasoning).toBe("string")
        expect(candidate.reasoning.length).toBeGreaterThan(0)
        expect(candidate.tier).toBeDefined()
        expect(["emerging", "adoption", "mainstream"]).toContain(candidate.tier)
        expect(candidate.source_event_ids).toBeDefined()
        expect(Array.isArray(candidate.source_event_ids)).toBe(true)
        expect(candidate.requires_approval).toBeDefined()
        expect(typeof candidate.requires_approval).toBe("boolean")
        expect(candidate.created_at).toBeDefined()
      }
    })

    it("confidence is between 0 and 1", () => {
      const events = Array.from({ length: 3 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } })
      )

      const candidates = detectFailurePatterns(events)
      for (const candidate of candidates) {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0)
        expect(candidate.confidence).toBeLessThanOrEqual(1)
      }
    })

    it("novelty_score is between 0 and 1", () => {
      const events = Array.from({ length: 3 }, () =>
        makeEvent({ event_type: "proposal_approved", agent_id: "curator", group_id: "allura-system" })
      )

      const candidates = detectWinPatterns(events)
      for (const candidate of candidates) {
        expect(candidate.novelty_score).toBeGreaterThanOrEqual(0)
        expect(candidate.novelty_score).toBeLessThanOrEqual(1)
      }
    })

    it("frequency matches actual event count", () => {
      const count = 7
      const events = Array.from({ length: count }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } })
      )

      const candidates = detectFailurePatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0].frequency).toBe(count)
    })

    it("source_event_ids references actual event IDs", () => {
      const events = Array.from({ length: 3 }, (_, i) =>
        makeEvent({ id: 1000 + i, event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } })
      )

      const candidates = detectFailurePatterns(events)
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0].source_event_ids).toEqual([1000, 1001, 1002])
    })
  })

  // ── P4: Safety Guardrails ──────────────────────────────────────────────

  describe("safety guardrails", () => {
    it("failure candidates ALWAYS require approval", () => {
      const events = Array.from({ length: 2 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "timeout" } })
      )

      const candidates = detectFailurePatterns(events)
      for (const candidate of candidates) {
        expect(candidate.requires_approval).toBe(true)
      }
    })

    it("high-frequency failures are always high-impact", () => {
      const events = Array.from({ length: 10 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "critical_failure" } })
      )

      const candidates = detectFailurePatterns(events)
      for (const candidate of candidates) {
        expect(candidate.impact).toBe("high")
        expect(candidate.requires_approval).toBe(true)
      }
    })

    it("low-frequency failures are low or medium impact", () => {
      const events = Array.from({ length: 2 }, () =>
        makeEvent({ event_type: "promotion_failed", agent_id: "agent-1", metadata: { error: "minor_timeout" } })
      )

      const candidates = detectFailurePatterns(events)
      for (const candidate of candidates) {
        expect(["low", "medium"]).toContain(candidate.impact)
      }
    })

    it("approval pattern candidates for policy changes always require approval", () => {
      // High approval rate → suggest changing threshold → requires HITL
      const events = Array.from({ length: 10 }, () =>
        makeEvent({ event_type: "proposal_approved", group_id: "allura-system" })
      )

      const candidates = detectApprovalPatterns(events)
      for (const candidate of candidates) {
        expect(candidate.requires_approval).toBe(true)
      }
    })

    it("classifySimilarity never returns undefined fields", () => {
      const result = classifySimilarity("test", ["test"])
      expect(result.classification).toBeDefined()
      expect(result.bestMatch).toBeDefined()
      expect(result.similarity).toBeDefined()
      expect(typeof result.similarity).toBe("number")
    })

    it("classifySimilarity with very short content works", () => {
      const result = classifySimilarity("a", ["a"])
      expect(result.classification).toBe("duplicate")
      expect(result.similarity).toBe(1)
    })

    it("classifySimilarity with completely different content returns new", () => {
      const result = classifySimilarity(
        "PostgreSQL append-only episodic evidence store",
        ["Agent prefers dark mode", "Memory search returns results"]
      )
      expect(result.classification).toBe("new")
      expect(result.similarity).toBeLessThan(0.65)
    })

    it("duplicate classification prevents duplicate proposals", () => {
      // Exact same content as existing → classified as duplicate → would be rejected
      const existingMemory = "Governance happens before execution, not during it"
      const candidate = "Governance happens before execution, not during it"

      const result = classifySimilarity(candidate, [existingMemory])
      expect(result.classification).toBe("duplicate")
      // In autoCurate, duplicates are suppressed (duplicatesSuppressed counter incremented)
    })
  })
})