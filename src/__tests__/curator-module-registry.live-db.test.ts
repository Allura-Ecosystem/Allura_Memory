import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

import { issueCuratorModules } from "@/lib/curator/module-registry"
import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { closePool, getAppPool, getPool } from "@/lib/postgres/connection"

const describeLive = process.env.POSTGRES_PASSWORD ? describe : describe.skip
const GROUP = "allura-253b-live"
const WORKSPACE = "workspace-253b-live"
const PRINCIPAL = "curator-253b-live"
const SESSION = "session-253b-live"

function authenticatedRequest(role: "curator" | "viewer") {
  return new NextRequest("http://allura.local/dashboard/curator", {
    headers: {
      "x-allura-user-id": PRINCIPAL,
      "x-allura-role": role,
      "x-allura-group-id": GROUP,
      "x-allura-workspace-id": WORKSPACE,
      "x-allura-session-id": SESSION,
    },
  })
}

async function latestDecision() {
  const result = await getPool().query(
    `SELECT workspace_id, status, session_id, metadata
       FROM events
      WHERE group_id = $1 AND workspace_id = $2 AND event_type = 'curator_module_registry_decision'
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [GROUP, WORKSPACE],
  )
  return result.rows[0]
}

describeLive("Story 25.3b managed app-role registry ledger", () => {
  afterEach(() => { delete process.env.BUMBLEBEE_MODULE_ENABLED })
  afterAll(async () => { await closePool() })

  it("records a completed scoped issuance atomically with its live summary snapshot", async () => {
    await getPool().query(
      `INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, '25.3b live')
       ON CONFLICT (workspace_id) DO UPDATE SET group_id = EXCLUDED.group_id`,
      [WORKSPACE, GROUP],
    )
    process.env.BUMBLEBEE_MODULE_ENABLED = "true"

    await expect(issueCuratorModules(authenticatedRequest("curator"))).resolves.toMatchObject({
      state: "complete", modules: [{ id: "bumblebee", state: "available" }],
    })
    const event = await latestDecision()
    expect(event).toMatchObject({ workspace_id: WORKSPACE, status: "completed", session_id: SESSION })
    expect(event.metadata).toMatchObject({
      decision: "issued", principal_id: PRINCIPAL, session_id: SESSION,
      contract_revision: "25.3b-r1", capability_policy: "auth.permission-action-role.READ_CAPABILITY_ACTIONS",
    })
    expect(event.metadata.issuance_snapshot).toMatchObject({ sources: expect.any(Number) })

    await expect(withTenantTransaction(
      { tenantId: GROUP, workspaceId: WORKSPACE, principalId: PRINCIPAL },
      (client) => client.query("UPDATE events SET status = 'failed' WHERE group_id=$1 AND workspace_id=$2", [GROUP, WORKSPACE]),
      getAppPool(),
    )).rejects.toThrow()
  })

  it("records failed denied and disabled decisions through the managed app role", async () => {
    await expect(issueCuratorModules(authenticatedRequest("viewer"))).resolves.toMatchObject({ state: "denied" })
    expect(await latestDecision()).toMatchObject({ workspace_id: WORKSPACE, status: "failed", metadata: { decision: "denied" } })

    await expect(issueCuratorModules(authenticatedRequest("curator"))).resolves.toMatchObject({ state: "degraded", modules: [{ state: "unavailable" }] })
    expect(await latestDecision()).toMatchObject({ workspace_id: WORKSPACE, status: "failed", metadata: { decision: "disabled" } })
  })

  // Read-failure handling is exercised in the focused unit suite by rejecting
  // the host-owned summary reader. Do not revoke a shared role grant here:
  // Vitest runs this live inventory in parallel and a global REVOKE can deny
  // unrelated app-role tests in another worker.
})
