/**
 * Types for durable, tenant-routed exposure alerts (Story 26.4).
 */

import type { z } from "zod"
import type { DiscoveryCycleHeartbeat, LifecycleState, PersistedThreatAlert } from "./schemas"
import type { MitigationDraft } from "../mitigation/types"

export type LifecycleState = z.infer<typeof LifecycleState>
export type PersistedThreatAlert = z.infer<typeof PersistedThreatAlert>
export type DiscoveryCycleHeartbeat = z.infer<typeof DiscoveryCycleHeartbeat>

/** One high/critical-severity alert paired with its generated simulated draft. */
export interface AlertWithDraft {
  alert: PersistedThreatAlert
  draft: MitigationDraft
}

export interface DiscoveryCycleResult {
  alertsCreated: PersistedThreatAlert[]
  alertsAlreadyKnown: number
  draftsGenerated: AlertWithDraft[]
  heartbeat: DiscoveryCycleHeartbeat
}
