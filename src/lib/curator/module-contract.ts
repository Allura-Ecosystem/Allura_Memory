/**
 * Server-owned contract for source-controlled curator modules.
 *
 * This contract is declarative: a module can describe a presentational adapter,
 * but never brings its own authority, data access, mutation, or route.
 */
export const CURATOR_MODULE_CONTRACT_VERSION = "1.0" as const

export type CuratorModuleId = "bumblebee"
export type CuratorHostBinding = "dashboard/curator"
export type CuratorModuleTrust = "allura-source"

export interface CuratorModuleManifest {
  id: CuratorModuleId
  version: string
  contractVersion: typeof CURATOR_MODULE_CONTRACT_VERSION
  title: string
  stages: readonly string[]
  requiredCapabilities: readonly string[]
  hostBindings: readonly CuratorHostBinding[]
  featureFlag: string
  rollbackId: string
  trust: CuratorModuleTrust
  readOnly: true
}

export interface BumblebeeModuleView {
  id: "bumblebee"
  state: "available" | "unavailable"
  title: string
  summary?: {
    sources: number
    unpinnedActions: number
    openExposures: number
    incidents: number
    receipts: number
  }
}

export type CuratorShellState = "loading" | "empty" | "denied" | "stale" | "partial" | "degraded" | "conflict" | "error" | "complete"

export interface CuratorModuleIssue {
  state: CuratorShellState
  modules: readonly BumblebeeModuleView[]
  message?: string
}
