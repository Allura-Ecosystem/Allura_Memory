/**
 * Incident replay engine (Story 26.7).
 *
 * Drives a fixture through the REAL, unmodified pipeline primitives --
 * Story 26.2's inventory service, Story 26.3's exposure matcher, and Story
 * 26.5's draft generator -- and reports what each stage actually produced.
 * Nothing here reimplements matching or drafting; a replay that used its own
 * private logic would prove nothing about the shipped system.
 *
 * SCOPE. This is the in-memory half of the replay: advisory -> exposure ->
 * simulated policy draft. It deliberately performs no persistence, no
 * approval, and no containment: those stages are governed, require a real
 * approval_ref through the REQ-GOV-008 control-plane gate, and are exercised
 * against a real database in the replay integration test rather than here.
 * Keeping this module side-effect-free is what makes it safe to run a replay
 * from an operator surface without any risk of it mutating tenant state.
 */

import { getReplayFixture, type ReplayFixture } from "./fixtures"
import { createExposureMatcher } from "../exposure/matcher"
import type { ExposureAlert, ExposureMatch } from "../exposure/types"
import { createInventoryService } from "../inventory/service"
import type { TenantScope } from "../inventory/types"
import { createDraftGenerator } from "../mitigation/draft-generator"
import type { MitigationDraft } from "../mitigation/types"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export interface ReplayResult {
  fixtureId: string
  title: string
  /** Inventory records loaded, including the decoys that must not match. */
  inventoryLoaded: number
  matches: ExposureMatch[]
  alerts: ExposureAlert[]
  drafts: MitigationDraft[]
  /** Inventory refs that matched -- used to assert decoys stayed clean. */
  matchedInventoryRefs: string[]
}

/**
 * Replay one fixture end-to-end through the in-memory pipeline.
 *
 * Decoy inventory is loaded alongside the real exposure on purpose: a replay
 * that only ever loads known-bad records would pass even if the matcher
 * matched indiscriminately. Loading both and asserting only the intended
 * record matched is what makes the replay meaningful.
 */
export function replayIncident(scope: TenantScope, fixture: ReplayFixture): ReplayResult {
  const inventory = createInventoryService()
  const allRecords = [...fixture.inventory, ...fixture.decoyInventory]
  inventory.ingestSources(scope, allRecords)

  const matcher = createExposureMatcher()
  const matches = matcher.matchAdvisory(scope, inventory, fixture.advisory)
  const alerts = matcher.createAlerts(scope, matches)

  const draftGenerator = createDraftGenerator()
  const drafts = alerts.map((alert) => draftGenerator.generateDraft(scope, alert))

  return {
    fixtureId: fixture.id,
    title: fixture.title,
    inventoryLoaded: allRecords.length,
    matches,
    alerts,
    drafts,
    matchedInventoryRefs: matches.map((m) => m.inventory_ref),
  }
}

export function replayIncidentById(scope: TenantScope, fixtureId: string): ReplayResult {
  return replayIncident(scope, getReplayFixture(fixtureId))
}
