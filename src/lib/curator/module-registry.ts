import "server-only"

import { createHash } from "node:crypto"

import { getAuthUser } from "@/lib/auth/api-auth"
import { hasPermission } from "@/lib/auth/roles"
import type { AlluraRole } from "@/lib/auth/types"
import { BUMBLEBEE_MODULE, isBumblebeeEnabled } from "@/lib/bumblebee/module"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { getBumblebeeSummaryInTransaction, type BumblebeeSummary } from "@/lib/curator/operator-read-service"
import type { NextRequest } from "next/server"

import {
  CURATOR_MODULE_CONTRACT_VERSION,
  type CuratorModuleIssue,
  type CuratorModuleManifest,
} from "./module-contract"

export { CURATOR_MODULE_CONTRACT_VERSION } from "./module-contract"

const CURATOR_CAPABILITIES = ["read:inventory", "read:exposures", "read:receipts"] as const
const CONTRACT_REVISION = "25.3b-r1" as const

type Scope = { tenantId: string; workspaceId: string; principalId: string; sessionId: string; role: AlluraRole }
type Decision = "issued" | "denied" | "disabled" | "read_failure" | "manifest_invalid"

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as object)) deepFreeze(nested)
  }
  return value as Readonly<T>
}

function canonicalManifest(manifest: CuratorModuleManifest): string {
  return JSON.stringify({
    id: manifest.id,
    version: manifest.version,
    contractVersion: manifest.contractVersion,
    title: manifest.title,
    stages: manifest.stages,
    requiredCapabilities: manifest.requiredCapabilities,
    hostBindings: manifest.hostBindings,
    featureFlag: manifest.featureFlag,
    rollbackId: manifest.rollbackId,
    trust: manifest.trust,
    readOnly: manifest.readOnly,
  })
}

function manifestHash(manifest: CuratorModuleManifest): string {
  return createHash("sha256").update(canonicalManifest(manifest)).digest("hex")
}

/** Registry-private immutable snapshot; no mutable module descriptor is trusted. */
const SOURCE_ALLOWLIST = new Map<string, Readonly<CuratorModuleManifest>>([
  ["bumblebee", deepFreeze(JSON.parse(canonicalManifest(BUMBLEBEE_MODULE)) as CuratorModuleManifest)],
])
const SOURCE_HASHES = new Map([...SOURCE_ALLOWLIST].map(([id, manifest]) => [id, manifestHash(manifest)]))

/** Capability grant is explicitly derived from the canonical role hierarchy. */
function capabilitiesForRole(role: AlluraRole): readonly string[] {
  return hasPermission(role, "curator") ? CURATOR_CAPABILITIES : []
}

function validateManifest(manifest: CuratorModuleManifest): void {
  const trusted = SOURCE_ALLOWLIST.get(manifest.id)
  if (!trusted) throw new Error(`untrusted module id: ${String(manifest.id)}`)
  if (manifest !== trusted) throw new Error(`untrusted module manifest: ${manifest.id}`)
  if (manifestHash(manifest) !== SOURCE_HASHES.get(manifest.id)) throw new Error(`manifest integrity mismatch: ${manifest.id}`)
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

function deriveScope(request: NextRequest): Scope | null {
  const user = getAuthUser(request)
  if (!user?.id || !user.groupId || !user.workspaceId || !user.sessionId) return null
  return { tenantId: user.groupId, workspaceId: user.workspaceId, principalId: user.id, sessionId: user.sessionId, role: user.role }
}

function rollbackSnapshot() {
  return { feature_flag: BUMBLEBEE_MODULE.featureFlag, enabled: isBumblebeeEnabled(), rollback_id: BUMBLEBEE_MODULE.rollbackId }
}

async function appendDecision(
  client: import("pg").PoolClient,
  scope: Scope,
  decision: Decision,
  status: "completed" | "failed",
  snapshot?: BumblebeeSummary,
): Promise<void> {
  const manifest = SOURCE_ALLOWLIST.get("bumblebee")!
  await client.query(
    `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, session_id, metadata, created_at)
     VALUES ($1, $2, 'curator_module_registry_decision', $3, $4, $5, $6, NOW())`,
    [
      scope.tenantId,
      scope.workspaceId,
      scope.principalId,
      status,
      scope.sessionId,
      JSON.stringify({
        schema_version: 1,
        decision,
        principal_id: scope.principalId,
        session_id: scope.sessionId,
        manifest_version: manifest.version,
        manifest_sha256: SOURCE_HASHES.get("bumblebee"),
        contract_version: CURATOR_MODULE_CONTRACT_VERSION,
        contract_revision: CONTRACT_REVISION,
        capability_policy: "auth.roles.hasPermission(role, curator)",
        required_capabilities: manifest.requiredCapabilities,
        feature_flag: rollbackSnapshot(),
        rollback: rollbackSnapshot(),
        issuance_snapshot: snapshot ?? null,
      }),
    ],
  )
}

async function recordOutcome(scope: Scope, decision: Exclude<Decision, "issued">): Promise<void> {
  await withWorkspaceTransaction(scope, (client) => appendDecision(client, scope, decision, "failed"))
}

/**
 * Server-only authenticated entry. It accepts a request, never an AuthUser;
 * scope and role come only from the canonical server auth resolver. Available
 * issuance commits the exact summary snapshot and ledger event in one managed
 * app-role transaction. A failed read rolls back that transaction, then writes
 * a separate failed outcome (no issuance snapshot was emitted to replay).
 */
export async function issueCuratorModules(request: NextRequest): Promise<CuratorModuleIssue> {
  const scope = deriveScope(request)
  if (!scope) return { state: "denied", modules: [], message: "Curator workflow access is unavailable." }

  try {
    validateModuleManifests([...SOURCE_ALLOWLIST.values()])
  } catch {
    await recordOutcome(scope, "manifest_invalid").catch(() => undefined)
    return { state: "error", modules: [], message: "Curator workflow access is unavailable." }
  }

  const capabilities = capabilitiesForRole(scope.role)
  const manifest = SOURCE_ALLOWLIST.get("bumblebee")!
  if (manifest.requiredCapabilities.some((capability) => !capabilities.includes(capability))) {
    await recordOutcome(scope, "denied").catch(() => undefined)
    return { state: "denied", modules: [], message: "Your role cannot access this curator workflow." }
  }

  if (!isBumblebeeEnabled()) {
    await recordOutcome(scope, "disabled").catch(() => undefined)
    return { state: "complete", modules: [{ id: "bumblebee", state: "unavailable", title: manifest.title }] }
  }

  try {
    return await withWorkspaceTransaction(scope, async (client) => {
      const summary = await getBumblebeeSummaryInTransaction(client, scope)
      await appendDecision(client, scope, "issued", "completed", summary)
      return { state: "complete", modules: [{ id: "bumblebee", state: "available", title: manifest.title, summary }] }
    })
  } catch {
    await recordOutcome(scope, "read_failure").catch(() => undefined)
    return { state: "error", modules: [], message: "Curator workflow data is temporarily unavailable." }
  }
}
