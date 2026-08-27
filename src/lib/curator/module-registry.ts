import type { AuthUser, AlluraRole } from "@/lib/auth/types"
import { BUMBLEBEE_MODULE, isBumblebeeEnabled } from "@/lib/bumblebee/module"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { getBumblebeeSummary } from "@/lib/curator/operator-read-service"

import {
  CURATOR_MODULE_CONTRACT_VERSION,
  type CuratorModuleIssue,
  type CuratorModuleManifest,
} from "./module-contract"

export { CURATOR_MODULE_CONTRACT_VERSION } from "./module-contract"

const SOURCE_ALLOWLIST = new Map([["bumblebee", BUMBLEBEE_MODULE] as const])
const CURATOR_CAPABILITIES = ["read:inventory", "read:exposures", "read:receipts"] as const

function capabilitiesForRole(role: AlluraRole): readonly string[] {
  return role === "curator" || role === "admin" ? CURATOR_CAPABILITIES : []
}

function validateManifest(manifest: CuratorModuleManifest): void {
  const trusted = SOURCE_ALLOWLIST.get(manifest.id)
  if (!trusted) throw new Error(`untrusted module id: ${String(manifest.id)}`)
  if (manifest !== trusted) throw new Error(`untrusted module manifest: ${manifest.id}`)
  if (manifest.contractVersion !== CURATOR_MODULE_CONTRACT_VERSION) throw new Error(`incompatible contract version: ${manifest.contractVersion}`)
  if (!/^1\.\d+\.\d+$/.test(manifest.version)) throw new Error(`incompatible module version: ${manifest.version}`)
  if (manifest.trust !== "allura-source" || manifest.readOnly !== true) throw new Error(`invalid trust or authority declaration: ${manifest.id}`)
  if (manifest.hostBindings.length !== 1 || manifest.hostBindings[0] !== "dashboard/curator") throw new Error(`invalid host binding: ${manifest.id}`)
  if (!manifest.featureFlag || !manifest.rollbackId || manifest.stages.length === 0) throw new Error(`malformed module manifest: ${manifest.id}`)
  if (manifest.requiredCapabilities.some((capability) => !CURATOR_CAPABILITIES.includes(capability as never))) {
    throw new Error(`module requests non-read capability: ${manifest.id}`)
  }
}

/** Validate the complete source-controlled set before any module can render. */
export function validateModuleManifests(manifests: readonly CuratorModuleManifest[]): void {
  const ids = new Set<string>()
  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`duplicate module id: ${manifest.id}`)
    ids.add(manifest.id)
    validateManifest(manifest)
  }
  if (manifests.length !== SOURCE_ALLOWLIST.size) throw new Error("incomplete source-controlled module set")
}

async function appendDecision(scope: { tenantId: string; workspaceId: string; principalId: string }, decision: "issued" | "denied", reason: string): Promise<void> {
  await withWorkspaceTransaction(scope, async (client) => {
    await client.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, 'curator_module_registry_decision', $2, $3, $4, NOW())`,
      [scope.tenantId, scope.principalId, decision, JSON.stringify({ schema_version: 1, workspace_id: scope.workspaceId, decision, reason, module_ids: ["bumblebee"] })],
    )
  })
}

function deriveScope(user: AuthUser) {
  if (!user.id || !user.groupId || !user.workspaceId || !user.sessionId) throw new Error("authenticated principal lacks required curator scope")
  return { tenantId: user.groupId, workspaceId: user.workspaceId, principalId: user.id }
}

/**
 * Server-only issuer. The optional second argument is deliberately ignored: no
 * caller, URL, browser storage, or module can influence scope/capabilities.
 */
export async function issueCuratorModules(user: AuthUser, _untrustedInput?: unknown): Promise<CuratorModuleIssue> {
  let scope: ReturnType<typeof deriveScope>
  try {
    scope = deriveScope(user)
    validateModuleManifests([BUMBLEBEE_MODULE])
    const capabilities = capabilitiesForRole(user.role)
    const missing = BUMBLEBEE_MODULE.requiredCapabilities.filter((capability) => !capabilities.includes(capability))
    if (missing.length > 0) {
      await appendDecision(scope, "denied", "capability_missing")
      return { state: "denied", modules: [], message: "Your role cannot access this curator workflow." }
    }
  } catch {
    // No event can be safely scoped if principal derivation itself failed.
    return { state: "denied", modules: [], message: "Curator workflow access is unavailable." }
  }

  if (!isBumblebeeEnabled()) {
    await appendDecision(scope, "issued", "module_disabled")
    return { state: "complete", modules: [{ id: "bumblebee", state: "unavailable", title: BUMBLEBEE_MODULE.title }] }
  }

  try {
    const summary = await getBumblebeeSummary(scope)
    await appendDecision(scope, "issued", "issued")
    return { state: "complete", modules: [{ id: "bumblebee", state: "available", title: BUMBLEBEE_MODULE.title, summary }] }
  } catch {
    await appendDecision(scope, "denied", "read_failure")
    return { state: "error", modules: [], message: "Curator workflow data is temporarily unavailable." }
  }
}
