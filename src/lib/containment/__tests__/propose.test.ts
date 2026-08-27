import { describe, expect, it } from "vitest"
import type { TenantScope } from "../../inventory/types"
import { proposeMcpTokenRevocation, proposeWorkspaceLock } from "../propose"

function scope(): TenantScope {
  return { group_id: "allura-test", workspace_id: "workspace-a" }
}

describe("Story 26.6 — proposeMcpTokenRevocation", () => {
  it("describes the action without touching anything", () => {
    const proposal = proposeMcpTokenRevocation(scope(), "token-123", "abc12345", "suspected leaked token")
    expect(proposal.connector).toBe("mcp_token_revocation")
    expect(proposal.action).toBe("revoke")
    expect(proposal.target_ref).toBe("token-123")
    expect(proposal.description).toContain("abc12345")
    expect(proposal.description).toContain("suspected leaked token")
    expect(proposal.reversible).toBe(false)
  })
})

describe("Story 26.6 — proposeWorkspaceLock", () => {
  it("describes a lock action as reversible with a rollback description", () => {
    const proposal = proposeWorkspaceLock(scope(), "workspace-b", "full_lockdown", "active incident containment")
    expect(proposal.connector).toBe("workspace_lock")
    expect(proposal.action).toBe("lock:full_lockdown")
    expect(proposal.target_ref).toBe("workspace-b")
    expect(proposal.reversible).toBe(true)
    expect(proposal.rollback_description).toContain("normal")
  })
})
