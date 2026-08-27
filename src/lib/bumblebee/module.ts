/**
 * Bumblebee module descriptor and rollback switch (Story 26.7 AC-2/AC-3/AC-6).
 *
 * ON AC-2 ("registered through the Epic 25 server-issued module registry").
 * That registry does not exist. `REQ-MOD-001/002/003` in
 * docs/allura/REQUIREMENTS-MATRIX.md are all marked `Dependency-blocked`
 * against story 25.3b, and no 25.3b story file exists in _bmad/bmm/stories/.
 * Rather than invent a private registry -- which would have to be thrown away
 * and would make AC-2 look satisfied when the actual dependency is still
 * missing -- this module publishes the descriptor a server-issued registry
 * would consume, and the story file records AC-2 as genuinely blocked.
 *
 * What IS real here is the fail-closed rollback behaviour (AC-3/AC-6): the
 * module is feature-flagged off by default, and when disabled the operator
 * surfaces render nothing while the dashboard shell, API, MCP, and every
 * other module keep working -- because nothing outside src/lib/bumblebee,
 * src/components/bumblebee, and the module's own route imports any of it.
 */

/** Capabilities this module requires a host to grant. Read-only by design. */
export const BUMBLEBEE_REQUIRED_CAPABILITIES = [
  "read:inventory",
  "read:exposures",
  "read:receipts",
] as const

export type BumblebeeCapability = (typeof BUMBLEBEE_REQUIRED_CAPABILITIES)[number]

export interface ModuleDescriptor {
  id: string
  version: string
  title: string
  surfaces: readonly string[]
  requiredCapabilities: readonly string[]
  /** This module never mutates state; a host may enforce that. */
  readOnly: boolean
}

export const BUMBLEBEE_MODULE: ModuleDescriptor = {
  id: "bumblebee",
  version: "1.0.0",
  title: "Bumblebee — Supply-Chain Threat Intelligence",
  surfaces: ["sources", "exposures", "policy-drafts", "incidents", "receipts"],
  requiredCapabilities: BUMBLEBEE_REQUIRED_CAPABILITIES,
  readOnly: true,
}

export const BUMBLEBEE_ENABLED_ENV_VAR = "BUMBLEBEE_MODULE_ENABLED"

/**
 * Whether the operator module is enabled. Default-off, read fresh on every
 * call, and only the exact string "true" enables it -- same convention as
 * src/lib/containment/feature-flags.ts.
 */
export function isBumblebeeEnabled(): boolean {
  return process.env[BUMBLEBEE_ENABLED_ENV_VAR] === "true"
}

/**
 * Fail-closed capability check (AC-3). A host that cannot grant every
 * required capability must be refused rather than served a degraded module:
 * a partially-capable security surface is worse than an absent one, because
 * an operator cannot tell which parts of it are lying.
 */
export function assertCapabilities(granted: readonly string[]): void {
  const missing = BUMBLEBEE_REQUIRED_CAPABILITIES.filter((c) => !granted.includes(c))
  if (missing.length > 0) {
    throw new Error(`bumblebee module requires capabilities not granted: ${missing.join(", ")}`)
  }
}

/**
 * Fail-closed compatibility check (AC-3). Only an exact major-version match
 * is accepted; an unknown or incompatible descriptor is rejected outright.
 */
export function assertCompatible(descriptor: Pick<ModuleDescriptor, "id" | "version">): void {
  if (descriptor.id !== BUMBLEBEE_MODULE.id) {
    throw new Error(`unknown module id "${descriptor.id}"`)
  }
  const major = descriptor.version.split(".")[0]
  const expected = BUMBLEBEE_MODULE.version.split(".")[0]
  if (major !== expected) {
    throw new Error(`incompatible bumblebee module version "${descriptor.version}" (host supports ${expected}.x)`)
  }
}
