/**
 * Story 26.7 AC-7/AC-8 — incident replay through the real pipeline.
 *
 * These tests run the actual Story 26.2 inventory service, Story 26.3
 * exposure matcher, and Story 26.5 draft generator -- none of them mocked.
 * A green run here means those three shipped components genuinely produce an
 * exposure and a reviewable draft for each of the three named incident
 * patterns, not that a replay-specific reimplementation does.
 */

import { describe, expect, it } from "vitest"
import type { TenantScope } from "../../inventory/types"
import { replayIncident, replayIncidentById } from "../engine"
import { getReplayFixture, REPLAY_FIXTURES } from "../fixtures"

const scope: TenantScope = { group_id: "allura-replay", workspace_id: "workspace-replay" }

describe("Story 26.7 — replay fixture coverage", () => {
  it("covers exactly the three incidents the story names", () => {
    expect(REPLAY_FIXTURES.map((f) => f.id).sort()).toEqual([
      "mutable-action-ref",
      "nx-s1ngularity",
      "shai-hulud",
    ])
  })

  it("exercises three DIFFERENT matcher paths, not the same one three times", () => {
    const paths = REPLAY_FIXTURES.map((f) => f.expectedMatchType)
    expect(new Set(paths).size).toBe(3)
  })

  it("carries no free-text advisory prose into any fixture (trust-contract boundary)", () => {
    // Story 26.1's ThreatAdvisory has no field for attacker-controlled text.
    // This asserts the fixtures did not smuggle any in via another field.
    for (const fixture of REPLAY_FIXTURES) {
      const serialized = JSON.stringify(fixture.advisory)
      expect(serialized).not.toMatch(/<script|eval\(|curl\s|base64\s-d|process\.env\./i)
    }
  })

  it("throws a helpful error for an unknown fixture id", () => {
    expect(() => getReplayFixture("nope")).toThrow(/unknown replay fixture/i)
  })
})

describe.each(REPLAY_FIXTURES)("Story 26.7 — replay: $title", (fixture) => {
  const result = replayIncident(scope, fixture)

  it("produces exactly one exposure match", () => {
    expect(result.matches).toHaveLength(1)
  })

  it("matches via the expected matcher path", () => {
    expect(result.matches[0]?.match_type).toBe(fixture.expectedMatchType)
  })

  it("does not match the decoy inventory", () => {
    const decoyIds = fixture.decoyInventory.map((r) => r.id)
    for (const decoyId of decoyIds) {
      expect(result.matchedInventoryRefs).not.toContain(decoyId)
    }
    // Sanity: the decoys really were loaded, so this is a real negative.
    expect(result.inventoryLoaded).toBeGreaterThan(fixture.inventory.length)
  })

  it("produces one deduplicated alert at the expected severity", () => {
    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0]?.severity).toBe(fixture.expectedSeverity)
    expect(result.alerts[0]?.group_id).toBe(scope.group_id)
    expect(result.alerts[0]?.workspace_id).toBe(scope.workspace_id)
  })

  it("produces a reviewable mitigation draft bound to its alert", () => {
    expect(result.drafts).toHaveLength(1)
    const draft = result.drafts[0]
    expect(draft?.template_id).toBeTruthy()
    expect(draft?.alert_id).toBe(result.alerts[0]?.id)
    expect(draft?.rollback_evidence).toBeTruthy()
  })

  it("never activates enforcement — the draft is simulated_only, unapproved (AD-57)", () => {
    for (const draft of result.drafts) {
      expect(draft.authority_state).toBe("simulated_only")
      expect(draft.approval_state).toBe("draft")
    }
  })
})

describe("Story 26.7 — replay tenant scoping", () => {
  it("stamps the caller's scope on every alert, not the fixture's", () => {
    const other: TenantScope = { group_id: "allura-other", workspace_id: "workspace-other" }
    const result = replayIncidentById(other, "nx-s1ngularity")

    expect(result.alerts[0]?.group_id).toBe("allura-other")
    expect(result.alerts[0]?.workspace_id).toBe("workspace-other")
  })

  it("rejects a malformed tenant scope rather than replaying unscoped", () => {
    expect(() => replayIncidentById({ group_id: "bad-tenant", workspace_id: "w" }, "nx-s1ngularity")).toThrow()
  })
})
