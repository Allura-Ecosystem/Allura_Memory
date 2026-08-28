if (typeof window !== "undefined") throw new Error("server-side only")

export interface BumblebeeScanContractInput {
  readonly schemaVersion: string
  readonly profile: string
  readonly mode: string
  readonly findingsEnabled: boolean
  readonly ecosystems: readonly string[]
}

export type ValidatedBumblebeeScanContract = Readonly<
  Omit<BumblebeeScanContractInput, "ecosystems"> & { readonly ecosystems: readonly string[] }
>

export const BUMBLEBEE_SCHEMA_VERSION = "0.1.0" as const

export const BUMBLEBEE_UPSTREAM_PIN = Object.freeze({
  repository: "perplexityai/bumblebee",
  tag: "v0.1.2",
  commit: "cc57710eeaf685e7b89924a36c8583cad0a378fe",
  tree: "985f57cf1749c15561c886c4476f10950ffa9cae",
  schemaVersion: BUMBLEBEE_SCHEMA_VERSION,
  license: "Apache-2.0",
} as const)

export const BUMBLEBEE_SCAN_MODES = Object.freeze(["inventory", "findings-only"] as const)
export const BUMBLEBEE_SCAN_PROFILES = Object.freeze(["baseline", "project", "deep"] as const)

export const BUMBLEBEE_CONTRACT_ERROR = Object.freeze({
  unsupportedSchema: "BUMBLEBEE_CONTRACT_UNSUPPORTED_SCHEMA",
  unsupportedMode: "BUMBLEBEE_CONTRACT_UNSUPPORTED_MODE",
  findingsNotEnabled: "BUMBLEBEE_CONTRACT_FINDINGS_NOT_ENABLED",
  unsupportedProfile: "BUMBLEBEE_CONTRACT_UNSUPPORTED_PROFILE",
  emptyEcosystems: "BUMBLEBEE_CONTRACT_EMPTY_ECOSYSTEMS",
  unsupportedEcosystem: "BUMBLEBEE_CONTRACT_UNSUPPORTED_ECOSYSTEM",
} as const)

export const BUMBLEBEE_INVENTORY_ECOSYSTEMS = Object.freeze([
  "npm",
  "pypi",
  "go",
  "rubygems",
  "packagist",
  "mcp",
  "editor-extension",
  "browser-extension",
  "homebrew",
] as const)

export const BUMBLEBEE_FINDING_ECOSYSTEMS = Object.freeze([
  "npm",
  "pypi",
  "go",
  "rubygems",
  "packagist",
  "mcp",
  "editor-extension",
  "browser-extension",
] as const)

/**
 * Fail closed on ecosystem values omitted by the pinned emitted schema.
 */
export function assertSupportedScanContract(input: BumblebeeScanContractInput): ValidatedBumblebeeScanContract {
  if (input.schemaVersion !== BUMBLEBEE_SCHEMA_VERSION) {
    throw new Error(BUMBLEBEE_CONTRACT_ERROR.unsupportedSchema)
  }
  if (!(BUMBLEBEE_SCAN_MODES as readonly string[]).includes(input.mode)) {
    throw new Error(BUMBLEBEE_CONTRACT_ERROR.unsupportedMode)
  }
  if (input.mode === "findings-only" && !input.findingsEnabled) {
    throw new Error(BUMBLEBEE_CONTRACT_ERROR.findingsNotEnabled)
  }
  if (!(BUMBLEBEE_SCAN_PROFILES as readonly string[]).includes(input.profile)) {
    throw new Error(BUMBLEBEE_CONTRACT_ERROR.unsupportedProfile)
  }
  if (input.ecosystems.length === 0) {
    throw new Error(BUMBLEBEE_CONTRACT_ERROR.emptyEcosystems)
  }

  const findingsCanBeEmitted = input.mode === "findings-only" || input.findingsEnabled
  const allowlist = findingsCanBeEmitted ? BUMBLEBEE_FINDING_ECOSYSTEMS : BUMBLEBEE_INVENTORY_ECOSYSTEMS
  for (const ecosystem of input.ecosystems) {
    if (!(allowlist as readonly string[]).includes(ecosystem)) {
      throw new Error(BUMBLEBEE_CONTRACT_ERROR.unsupportedEcosystem)
    }
  }

  return Object.freeze({
    schemaVersion: input.schemaVersion,
    profile: input.profile,
    mode: input.mode,
    findingsEnabled: input.findingsEnabled,
    ecosystems: Object.freeze([...input.ecosystems]),
  })
}
