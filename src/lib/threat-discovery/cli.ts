#!/usr/bin/env bun
/**
 * Threat Discovery Worker — CLI entrypoint (Story 26.4).
 *
 * Composes the whole approved pipeline: enumerate verified+fresh inventory
 * (Story 26.2) -> poll the three approved advisory sources (Slice B,
 * src/lib/threat-ingestion) -> match + persist + generate simulated drafts
 * (Slice A, ./worker.ts). Run on a schedule via the systemd timer in
 * scripts/systemd/allura-threat-discovery.timer (security-owner-approved
 * cadence: every 6 hours, docs/governance/2026-08-27-story-26-4-security-owner-approval.md).
 *
 * Scope resolution: unlike an HTTP request, a systemd-invoked process has
 * no bearer credential to authenticate. The trust boundary here is the
 * .service unit file itself -- only an operator with root/sudo can set its
 * ExecStart arguments, so --group-id/--workspace-id/--principal-id are
 * required, explicit CLI arguments rather than an invented authentication
 * shortcut. (src/curator/watchdog.ts's own CLI branch currently throws
 * instead of resolving a real scope for exactly this case -- that gap is
 * pre-existing and out of this story's scope to fix; this worker does not
 * repeat it.)
 *
 * Usage: bun src/lib/threat-discovery/cli.ts --group-id allura-system --workspace-id ws-main --principal-id threat-discovery-worker
 */

import { createInventoryService } from "../inventory/service"
import { buildQueryTargets, pollAdvisorySources } from "../threat-ingestion/poller"
import { runDiscoveryCycle } from "./worker"
import type { ResolvedWorkspaceScope } from "../db/workspace-scope"

const isMainModule = import.meta.path === Bun.main

function getArg(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined
}

export async function runOneCycle(scope: ResolvedWorkspaceScope): Promise<void> {
  // Story 26.2's inventory service is in-memory; a real deployment's
  // discovery worker must be handed a populated InventoryProvider from
  // wherever the live inventory actually lives (out of this story's
  // scope -- inventory persistence/reconciliation is not yet built).
  // This CLI wires the pipeline end-to-end against an empty inventory
  // until that exists, which is honestly a no-op in production today.
  const inventory = createInventoryService()
  const targets = buildQueryTargets({ group_id: scope.tenantId, workspace_id: scope.workspaceId }, inventory)

  console.log(`[ThreatDiscovery] Polling ${targets.length} inventory targets across 3 approved sources`)
  const poll = await pollAdvisorySources(targets)
  console.log(
    `[ThreatDiscovery] Sources returned: osv=${poll.osvCount} npm=${poll.npmCount} github=${poll.githubCount}`,
  )

  const result = await runDiscoveryCycle(scope, inventory, poll.advisories)
  console.log(
    `[ThreatDiscovery] Cycle complete: alerts_created=${result.alertsCreated.length} already_known=${result.alertsAlreadyKnown} drafts_generated=${result.draftsGenerated.length}`,
  )
}

if (isMainModule) {
  const args = process.argv.slice(2)
  const groupId = getArg(args, "group-id")
  const workspaceId = getArg(args, "workspace-id")
  const principalId = getArg(args, "principal-id")

  if (!groupId || !workspaceId || !principalId) {
    console.error(
      "[ThreatDiscovery] --group-id, --workspace-id, and --principal-id are all required (this is the systemd-unit trust boundary; see this file's header comment)",
    )
    process.exit(1)
  }

  if (!/^allura-[a-z0-9-]+$/.test(groupId)) {
    console.error(`[ThreatDiscovery] Invalid group_id: ${groupId}. Must match ^allura-[a-z0-9-]+$`)
    process.exit(1)
  }

  runOneCycle({ tenantId: groupId, workspaceId, principalId }).catch((error) => {
    console.error("[ThreatDiscovery] Cycle failed:", error)
    process.exit(1)
  })
}
