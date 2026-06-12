/**
 * score.test.ts — Unit tests for curatorScore()
 *
 * Covers the machine echo guard (Signal 0) and verifies
 * normal human-authored content is NOT suppressed.
 */

import { describe, expect, it } from "vitest";
import { curatorScore } from "./score";

// ── Machine echo guard ────────────────────────────────────────────────────────

describe("curatorScore — Signal 0: machine echo guard", () => {
  it("suppresses governance_gate_checked tool-call JSON: confidence ≤ 0.3 and tier = emerging", async () => {
    const score = await curatorScore({
      content: `{"type":"governance_gate_checked","tool":"memory_add","result":"pass","ts":1718000000}`,
      source: "conversation",
      usageCount: 5,
      daysSinceCreated: 0,
    });

    expect(score.confidence).toBeLessThanOrEqual(0.3);
    expect(score.tier).toBe("emerging");
    expect(score.reasoning).toMatch(/machine echo/i);
  });

  it("suppresses memory_add tool-call JSON: confidence ≤ 0.3 and tier = emerging", async () => {
    const score = await curatorScore({
      content: `{"type":"memory_add","content":"I prefer dark mode","group_id":"allura-system"}`,
      source: "conversation",
      usageCount: 3,
      daysSinceCreated: 1,
    });

    expect(score.confidence).toBeLessThanOrEqual(0.3);
    expect(score.tier).toBe("emerging");
    expect(score.reasoning).toMatch(/machine echo/i);
  });

  it("does NOT suppress a normal sentence that mentions the word 'type'", async () => {
    const score = await curatorScore({
      content: "My preferred type of deploy is blue-green",
      source: "conversation",
      usageCount: 2,
      daysSinceCreated: 3,
    });

    // Must score above the suppression cap and may reach any non-suppressed tier
    expect(score.confidence).toBeGreaterThan(0.3);
    expect(score.reasoning).not.toMatch(/machine echo/i);
  });
});
