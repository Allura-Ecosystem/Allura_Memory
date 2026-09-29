/**
 * Epic 30 — AI agents hold only explicitly assigned scope.
 *
 * Approved policy correction (Sabir Asheed, 2026-09-28): Allura and every
 * other AI agent MUST NOT have automatic cross-project access. An agent is
 * assigned scope-by-scope with least privilege, and removal terminates
 * access.
 *
 * The enforcement grain available in this repository today is the tenant
 * (`group_id`) allowlist in the agent registry. There is no project-grained
 * authority anywhere in the schema, so these tests pin the rule at the grain
 * that exists and the remaining project grain is recorded as an open gap in
 * the Epic 30 authorization contract, not silently implied here.
 *
 * The rule under test is the fail-closed direction only: an agent that has
 * not been explicitly assigned a tenant holds nothing. That is stricter than
 * the previous behaviour, which handed an unlisted agent the registry
 * fallback tenant.
 */

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { stringify as stringifyYaml } from "yaml"
import { describe, expect, it } from "vitest"

import { AgentAssignmentMissingError, getAgentAllowedGroupIds, getDefaultGroupId, isAgentAllowedGroupId, reloadRegistry } from "@/lib/config/group-id-registry"
import { applyPrincipalToArgs, createPrincipalContext } from "@/lib/auth/principal-context"

function writeTempRegistry(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "epic30-agent-assignment-"))
  const filePath = join(dir, "group-id-registry.yaml")
  writeFileSync(filePath, stringifyYaml(data), "utf-8")
  return filePath
}

const REGISTRY = {
  agents: [
    {
      id: "assigned-agent",
      default_group_id: "allura-faithmeats",
      allowed_group_ids: ["allura-faithmeats"],
    },
  ],
  fallback_group_id: "allura-system",
}

describe("Epic 30 — an AI agent holds only explicitly assigned scope", () => {
  it("grants an unassigned agent nothing, not the fallback tenant", () => {
    const registryPath = writeTempRegistry(REGISTRY)
    // The registry fallback must never become an access grant. An agent that
    // nobody assigned is an agent with no authority.
    expect(getAgentAllowedGroupIds("never-assigned-agent", registryPath)).toEqual([])
  })

  it("denies an unassigned agent every tenant, including the fallback", () => {
    const registryPath = writeTempRegistry(REGISTRY)
    for (const tenant of ["allura-system", "allura-faithmeats", "allura-coding"]) {
      expect(isAgentAllowedGroupId("never-assigned-agent", tenant, registryPath)).toBe(false)
    }
  })

  it("refuses to invent a default tenant for an unassigned agent", () => {
    const registryPath = writeTempRegistry(REGISTRY)
    // Match the class, not the message: a reword must not disable this.
    expect(() => getDefaultGroupId("never-assigned-agent", registryPath))
      .toThrow(AgentAssignmentMissingError)
  })

  it("gives an assigned agent exactly its assignment and nothing adjacent", () => {
    const registryPath = writeTempRegistry(REGISTRY)
    expect(getAgentAllowedGroupIds("assigned-agent", registryPath)).toEqual(["allura-faithmeats"])
    expect(isAgentAllowedGroupId("assigned-agent", "allura-faithmeats", registryPath)).toBe(true)
    // Least privilege: the fallback tenant is not an implicit second grant.
    expect(isAgentAllowedGroupId("assigned-agent", "allura-system", registryPath)).toBe(false)
    expect(getDefaultGroupId("assigned-agent", registryPath)).toBe("allura-faithmeats")
  })

  it("terminates access when the agent is removed, once the registry is reloaded", () => {
    // Rewrite the SAME path so the module cache is genuinely exercised. Using
    // two temp paths would force a cache miss and pass for the wrong reason.
    const registryPath = writeTempRegistry(REGISTRY)
    expect(isAgentAllowedGroupId("assigned-agent", "allura-faithmeats", registryPath)).toBe(true)

    writeFileSync(registryPath, stringifyYaml({ agents: [], fallback_group_id: "allura-system" }), "utf-8")
    reloadRegistry(registryPath)

    // Removal is the whole grant being withdrawn, not downgraded to a default.
    expect(getAgentAllowedGroupIds("assigned-agent", registryPath)).toEqual([])
    expect(isAgentAllowedGroupId("assigned-agent", "allura-faithmeats", registryPath)).toBe(false)
    expect(isAgentAllowedGroupId("assigned-agent", "allura-system", registryPath)).toBe(false)
  })

  it("records that removal does NOT take effect until the registry is reloaded", () => {
    // Known gap, pinned honestly: the module caches by path for the process
    // lifetime and nothing invalidates it outside tests, so editing the YAML
    // to remove an agent leaves the stale grant live until restart. Recorded
    // in the authorization contract, not silently implied to be solved.
    const registryPath = writeTempRegistry(REGISTRY)
    expect(isAgentAllowedGroupId("assigned-agent", "allura-faithmeats", registryPath)).toBe(true)

    writeFileSync(registryPath, stringifyYaml({ agents: [], fallback_group_id: "allura-system" }), "utf-8")

    expect(isAgentAllowedGroupId("assigned-agent", "allura-faithmeats", registryPath)).toBe(true)
  })

  it("keeps an explicitly multi-tenant agent bounded to its listed tenants", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "multi-agent",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system", "allura-faithmeats"],
        },
      ],
      fallback_group_id: "allura-system",
    })
    expect(getAgentAllowedGroupIds("multi-agent", registryPath)).toEqual(["allura-system", "allura-faithmeats"])
    expect(isAgentAllowedGroupId("multi-agent", "allura-difference-driven", registryPath)).toBe(false)
  })
})

describe("Epic 30 — an agent without a workspace assignment reaches nothing", () => {
  function agentWithoutWorkspace() {
    return createPrincipalContext({
      principalId: "unassigned-agent",
      tenantIds: ["allura-faithmeats"],
      roles: ["curator", "admin"],
      authMethod: "mcp_token" as const,
      sessionId: "session-unassigned",
    })
  }

  // The approved rule is fail-closed: absent an explicit assignment the agent
  // holds nothing. Previously only three read tools refused an agent with no
  // verified workspace binding; every other tool fell through and ran with a
  // tenant-only scope, which is tenant-wide reach on destructive and
  // audit-reading surfaces.
  const TOOLS = [
    "memory_search", "memory_get", "memory_list",
    "memory_delete", "memory_update", "memory_export", "memory_restore",
    "memory_promote", "audit_query_events", "governance_audit_log",
  ]

  for (const tool of TOOLS) {
    it(`denies ${tool} when the agent has no verified workspace binding`, () => {
      expect(() => applyPrincipalToArgs(agentWithoutWorkspace(), tool, {}))
        .toThrow(/no verified workspace binding/i)
    })
  }

  function serviceIdentityWithoutWorkspace() {
    return createPrincipalContext({
      principalId: "legacy-client",
      tenantIds: ["allura-system"],
      roles: ["curator"],
      authMethod: "service_identity" as const,
      sessionId: "session-service",
    })
  }

  it("keeps refusing the three reads for every auth method, not just agent credentials", () => {
    // Regression guard. Scoping the all-tool refusal to mcp_token must never
    // narrow the pre-existing read refusal: doing so removed a control and
    // turned an audited deny into an audited allow for shared-token callers.
    for (const tool of ["memory_search", "memory_get", "memory_list"]) {
      expect(() => applyPrincipalToArgs(serviceIdentityWithoutWorkspace(), tool, {}))
        .toThrow(/no verified workspace binding/i)
    }
  })

  it("documents the unclosed shared-token gap rather than asserting it is safe", () => {
    // NOT an endorsement. The HTTP shared-token service_identity path is not
    // fenced out of production and carries no workspace binding, while
    // audit_query_events, governance_audit_log and memory_export filter on
    // group_id alone. Widening the refusal here breaks the AC-10 shared-token
    // compatibility contract, so the gap is recorded as an open risk for the
    // policy owner. This test pins the CURRENT boundary so that closing the
    // gap is a deliberate, visible change rather than a silent one.
    expect(() => applyPrincipalToArgs(serviceIdentityWithoutWorkspace(), "governance_audit_log", {}))
      .not.toThrow()
  })

  it("allows an explicitly bound agent and injects only its own scope", () => {
    const bound = createPrincipalContext({
      principalId: "assigned-agent",
      tenantIds: ["allura-faithmeats"],
      workspaceId: "workspace-a",
      roles: ["curator"],
      authMethod: "mcp_token" as const,
      sessionId: "session-assigned",
    })
    // A caller-supplied workspace selector is an assertion, never a grant.
    const applied = applyPrincipalToArgs(bound, "memory_search", { workspace_id: "workspace-b" })
    expect(applied.args.group_id).toBe("allura-faithmeats")
    expect(applied.args.workspace_id).toBe("workspace-a")
  })
})
