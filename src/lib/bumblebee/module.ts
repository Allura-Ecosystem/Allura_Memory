/**
 * Bumblebee's source-controlled declarative module manifest and local rollback flag.
 * It is not a registry and cannot obtain data or authority on its own.
 */
import type { CuratorModuleManifest } from "../curator/module-contract"

export const BUMBLEBEE_REQUIRED_CAPABILITIES = Object.freeze([
  "read:inventory",
  "read:exposures",
  "read:receipts",
] as const)

export type BumblebeeCapability = (typeof BUMBLEBEE_REQUIRED_CAPABILITIES)[number]
export type ModuleDescriptor = Readonly<CuratorModuleManifest & { readonly surfaces: readonly string[] }>

export const BUMBLEBEE_ENABLED_ENV_VAR = "BUMBLEBEE_MODULE_ENABLED"

/**
 * Public descriptor is immutable data only. The registry creates and hashes its
 * own private snapshot; consumers never receive a mutable registry identity.
 */
export const BUMBLEBEE_MODULE: ModuleDescriptor = Object.freeze({
  id: "bumblebee",
  version: "1.0.0",
  contractVersion: "1.0",
  title: "Bumblebee — Supply-Chain Threat Intelligence",
  stages: Object.freeze(["sources", "exposures", "policy-drafts", "incidents", "receipts"]),
  surfaces: Object.freeze(["sources", "exposures", "policy-drafts", "incidents", "receipts"]),
  requiredCapabilities: BUMBLEBEE_REQUIRED_CAPABILITIES,
  hostBindings: Object.freeze(["dashboard/curator"] as const),
  featureFlag: BUMBLEBEE_ENABLED_ENV_VAR,
  rollbackId: "bumblebee-disable",
  trust: "allura-source",
  readOnly: true,
})

/** Default-off, exact true only, and evaluated on every server issue. */
export function isBumblebeeEnabled(): boolean {
  return process.env[BUMBLEBEE_ENABLED_ENV_VAR] === "true"
}

export function assertCapabilities(granted: readonly string[]): void {
  const missing = BUMBLEBEE_REQUIRED_CAPABILITIES.filter((c) => !granted.includes(c))
  if (missing.length > 0) {
    throw new Error(`bumblebee module requires capabilities not granted: ${missing.join(", ")}`)
  }
}

export function assertCompatible(descriptor: { id: string; version: string }): void {
  if (descriptor.id !== BUMBLEBEE_MODULE.id) throw new Error(`unknown module id "${descriptor.id}"`)
  if (descriptor.version.split(".")[0] !== BUMBLEBEE_MODULE.version.split(".")[0]) {
    throw new Error(`incompatible bumblebee module version "${descriptor.version}"`)
  }
}
