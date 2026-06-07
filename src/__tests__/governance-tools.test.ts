/**
 * Governance MCP Tools Integration Tests (Story 9.1)
 *
 * Covers all 5 governance tools:
 * 1. governance_list_policies
 * 2. governance_get_policy
 * 3. governance_check_gate
 * 4. governance_update_policy
 * 5. governance_audit_log
 *
 * Pattern mirrors canonical-memory.test.ts:
 * - itIfE2E gating for live-DB tests (RUN_E2E_TESTS=true)
 * - plain `it` for pure-logic / validation tests (no DB required)
 * - happy path + error/validation cases per tool
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "crypto"
import type {
  GovernanceAuditLogRequest,
  GovernanceCheckGateRequest,
  GovernanceGetPolicyRequest,
  GovernanceListPoliciesRequest,
  GovernanceUpdatePolicyRequest,
  GroupId,
} from "../lib/memory/canonical-contracts"
import {
  governance_audit_log,
  governance_check_gate,
  governance_get_policy,
  governance_list_policies,
  governance_update_policy,
} from "../mcp/governance-tools"
import { CANONICAL_POLICIES } from "../lib/governance/policies"

// Live-DB gating: skip tests requiring live PostgreSQL unless RUN_E2E_TESTS=true
const itIfE2E = process.env.RUN_E2E_TESTS === "true" ? it : it.skip

// Test configuration
const RUN_ID = randomUUID().slice(0, 8)

// Use a typed helper to avoid casting repeatedly
function asGroupId(s: string): GroupId {
  return s as unknown as GroupId
}

const VALID_GROUP: GroupId = asGroupId(`allura-test-gov-${RUN_ID}`)

describe("Governance MCP Tools (Story 9.1)", () => {
  // ── 1. governance_list_policies ────────────────────────────────────────

  describe("governance_list_policies", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined } as unknown as GovernanceListPoliciesRequest
      await expect(governance_list_policies(req)).rejects.toThrow()
    })

    it("should reject invalid group_id (no allura- prefix)", async () => {
      const req: GovernanceListPoliciesRequest = {
        group_id: "bad-group" as unknown as GovernanceListPoliciesRequest["group_id"],
      }
      await expect(governance_list_policies(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject group_id without allura- prefix", async () => {
      const req: GovernanceListPoliciesRequest = {
        group_id: "myorg-project" as unknown as GovernanceListPoliciesRequest["group_id"],
      }
      await expect(governance_list_policies(req)).rejects.toThrow()
    })

    itIfE2E("should return all 6 canonical policies with valid group_id", async () => {
      const req: GovernanceListPoliciesRequest = { group_id: VALID_GROUP }
      const response = await governance_list_policies(req)

      expect(response.count).toBe(6)
      expect(response.policies).toHaveLength(6)
      expect(response.meta).toBeDefined()
      expect(response.meta?.degraded).toBe(false)

      // Verify each policy has required fields
      for (const policy of response.policies) {
        expect(policy.id).toMatch(/^pol-\d{3}$/)
        expect(policy.name).toBeTruthy()
        expect(policy.description).toBeTruthy()
        expect(["critical", "high", "medium", "low"]).toContain(policy.severity)
        expect(policy.invariant_key).toBeTruthy()
        expect(typeof policy.version).toBe("number")
        expect(policy.updated_at).toBeTruthy()
      }
    })

    itIfE2E("should return policies matching the canonical registry IDs", async () => {
      const req: GovernanceListPoliciesRequest = { group_id: VALID_GROUP }
      const response = await governance_list_policies(req)
      const returnedIds = response.policies.map((p) => p.id).sort()
      const canonicalIds = [...CANONICAL_POLICIES].map((p) => p.id).sort()
      expect(returnedIds).toEqual(canonicalIds)
    })

    // Pure logic test — no DB needed
    it("CANONICAL_POLICIES registry should contain exactly 6 policies", () => {
      expect(CANONICAL_POLICIES).toHaveLength(6)
    })

    it("CANONICAL_POLICIES should have unique IDs", () => {
      const ids = CANONICAL_POLICIES.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it("CANONICAL_POLICIES should cover all 6 invariant keys", () => {
      const keys = CANONICAL_POLICIES.map((p) => p.invariant_key)
      expect(keys).toContain("group_id_required")
      expect(keys).toContain("append_only_events")
      expect(keys).toContain("neo4j_supersedes")
      expect(keys).toContain("hitl_promotion")
      expect(keys).toContain("db_connection_only")
      expect(keys).toContain("allura_namespace")
    })
  })

  // ── 2. governance_get_policy ───────────────────────────────────────────

  describe("governance_get_policy", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined, policy_id: "pol-001" } as unknown as GovernanceGetPolicyRequest
      await expect(governance_get_policy(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: GovernanceGetPolicyRequest = {
        group_id: "invalid" as unknown as GovernanceGetPolicyRequest["group_id"],
        policy_id: "pol-001",
      }
      await expect(governance_get_policy(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject unknown policy_id", async () => {
      const req: GovernanceGetPolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-999",
      }
      await expect(governance_get_policy(req)).rejects.toThrow("Policy not found: pol-999")
    })

    it("should reject missing policy_id", async () => {
      const req = {
        group_id: VALID_GROUP,
        policy_id: "",
      } as unknown as GovernanceGetPolicyRequest
      await expect(governance_get_policy(req)).rejects.toThrow()
    })

    itIfE2E("should return pol-001 (group_id_required policy)", async () => {
      const req: GovernanceGetPolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-001",
      }
      const response = await governance_get_policy(req)

      expect(response.policy.id).toBe("pol-001")
      expect(response.policy.invariant_key).toBe("group_id_required")
      expect(response.policy.severity).toBe("critical")
      expect(response.override_event_id).toBeNull()
      expect(response.meta?.degraded).toBe(false)
    })

    itIfE2E("should return all 6 policies without error", async () => {
      for (const policy of CANONICAL_POLICIES) {
        const req: GovernanceGetPolicyRequest = {
          group_id: VALID_GROUP,
          policy_id: policy.id,
        }
        const response = await governance_get_policy(req)
        expect(response.policy.id).toBe(policy.id)
        expect(response.policy.invariant_key).toBe(policy.invariant_key)
      }
    })
  })

  // ── 3. governance_check_gate ───────────────────────────────────────────

  describe("governance_check_gate", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined, action: "memory_add" } as unknown as GovernanceCheckGateRequest
      await expect(governance_check_gate(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: GovernanceCheckGateRequest = {
        group_id: "not-allura" as unknown as GovernanceCheckGateRequest["group_id"],
        action: "memory_add",
      }
      await expect(governance_check_gate(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject missing action", async () => {
      const req = {
        group_id: VALID_GROUP,
        action: "",
      } as unknown as GovernanceCheckGateRequest
      await expect(governance_check_gate(req)).rejects.toThrow("action is required")
    })

    itIfE2E("should pass all 6 checks for a benign action", async () => {
      const req: GovernanceCheckGateRequest = {
        group_id: VALID_GROUP,
        action: "memory_add",
        context: { agent_id: "test-agent" },
      }
      const response = await governance_check_gate(req)

      expect(response.pass).toBe(true)
      expect(response.action).toBe("memory_add")
      expect(response.checks).toHaveLength(6)
      expect(response.checked_at).toBeTruthy()

      for (const check of response.checks) {
        expect(check.pass).toBe(true)
        expect(check.invariant_key).toBeTruthy()
        expect(check.reason).toBeTruthy()
      }
    })

    itIfE2E("should fail HITL check when bypass_hitl=true in context", async () => {
      const req: GovernanceCheckGateRequest = {
        group_id: VALID_GROUP,
        action: "memory_add",
        context: { bypass_hitl: true },
      }
      const response = await governance_check_gate(req)

      expect(response.pass).toBe(false)
      const hitlCheck = response.checks.find((c) => c.invariant_key === "hitl_promotion")
      expect(hitlCheck?.pass).toBe(false)
      expect(hitlCheck?.reason).toContain("bypass_hitl")
    })

    itIfE2E("should fail append_only check for a mutation action keyword", async () => {
      const req: GovernanceCheckGateRequest = {
        group_id: VALID_GROUP,
        action: "delete_events_directly",
      }
      const response = await governance_check_gate(req)

      expect(response.pass).toBe(false)
      const appendCheck = response.checks.find((c) => c.invariant_key === "append_only_events")
      expect(appendCheck?.pass).toBe(false)
    })

    itIfE2E("should return 6 checks with invariant keys covering all invariants", async () => {
      const req: GovernanceCheckGateRequest = {
        group_id: VALID_GROUP,
        action: "read_memories",
      }
      const response = await governance_check_gate(req)

      const keys = response.checks.map((c) => c.invariant_key)
      expect(keys).toContain("group_id_required")
      expect(keys).toContain("append_only_events")
      expect(keys).toContain("neo4j_supersedes")
      expect(keys).toContain("hitl_promotion")
      expect(keys).toContain("db_connection_only")
      expect(keys).toContain("allura_namespace")
    })
  })

  // ── 4. governance_update_policy ────────────────────────────────────────

  describe("governance_update_policy", () => {
    it("should reject missing group_id", async () => {
      const req = {
        group_id: undefined,
        policy_id: "pol-005",
        approval_ref: randomUUID(),
        description: "Updated description",
        updated_by: "test-curator",
      } as unknown as GovernanceUpdatePolicyRequest
      await expect(governance_update_policy(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: GovernanceUpdatePolicyRequest = {
        group_id: "no-prefix" as unknown as GovernanceUpdatePolicyRequest["group_id"],
        policy_id: "pol-005",
        approval_ref: randomUUID(),
        description: "Updated description",
        updated_by: "test-curator",
      }
      await expect(governance_update_policy(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject missing approval_ref", async () => {
      const req = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: "",
        description: "Updated description",
        updated_by: "test-curator",
      } as unknown as GovernanceUpdatePolicyRequest
      await expect(governance_update_policy(req)).rejects.toThrow("approval_ref is required")
    })

    it("should reject missing description", async () => {
      const req = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: randomUUID(),
        description: "",
        updated_by: "test-curator",
      } as unknown as GovernanceUpdatePolicyRequest
      await expect(governance_update_policy(req)).rejects.toThrow("description is required")
    })

    it("should reject unknown policy_id", async () => {
      const req: GovernanceUpdatePolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-999",
        approval_ref: randomUUID(),
        description: "Some description",
        updated_by: "curator",
      }
      await expect(governance_update_policy(req)).rejects.toThrow("Policy not found: pol-999")
    })

    it("should reject missing updated_by", async () => {
      const req = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: randomUUID(),
        description: "Updated description",
        updated_by: "",
      } as unknown as GovernanceUpdatePolicyRequest
      await expect(governance_update_policy(req)).rejects.toThrow("updated_by is required")
    })

    itIfE2E("should reject a non-existent approval_ref (HITL gate)", async () => {
      const req: GovernanceUpdatePolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: randomUUID(), // valid UUID but not in canonical_proposals
        description: "Updated description for pol-005",
        updated_by: "test-curator",
      }
      await expect(governance_update_policy(req)).rejects.toThrow("HITL gate rejected")
    })

    itIfE2E("should reject a pending (not yet approved) proposal ref", async () => {
      // Insert a pending proposal to use as approval_ref
      const { pg } = await import("../mcp/canonical-tools/connection").then((m) => m.getConnections())
      const proposalId = randomUUID()
      await pg.query(
        `INSERT INTO canonical_proposals (id, group_id, content, score, tier, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [proposalId, VALID_GROUP, "test content for governance test", 0.9, "mainstream", "pending"]
      )

      const req: GovernanceUpdatePolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: proposalId,
        description: "Updated description",
        updated_by: "test-curator",
      }

      await expect(governance_update_policy(req)).rejects.toThrow("status 'pending'")
    })

    itIfE2E("should succeed and prevent approval replay when given an approved proposal", async () => {
      // Insert an approved proposal
      const { pg } = await import("../mcp/canonical-tools/connection").then((m) => m.getConnections())
      const proposalId = randomUUID()
      await pg.query(
        `INSERT INTO canonical_proposals (id, group_id, content, score, tier, status, decided_at, decided_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW())`,
        [proposalId, VALID_GROUP, "governance update approval content", 0.9, "mainstream", "approved", "test-curator"]
      )

      const req: GovernanceUpdatePolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: proposalId,
        description: "Updated: DB Operations via canonical connection — enforce circuit breakers.",
        updated_by: "test-curator",
        rationale: "Test override for Story 9.1 verification",
      }

      const response = await governance_update_policy(req)
      expect(response.updated).toBe(true)
      expect(response.policy_id).toBe("pol-005")
      expect(response.version).toBeGreaterThan(1)
      expect(response.event_id).toBeTruthy()
      expect(response.updated_at).toBeTruthy()

      // Attempt replay — same approval_ref should be rejected
      const replayReq: GovernanceUpdatePolicyRequest = {
        group_id: VALID_GROUP,
        policy_id: "pol-005",
        approval_ref: proposalId,
        description: "Replay attempt",
        updated_by: "malicious-agent",
      }
      await expect(governance_update_policy(replayReq)).rejects.toThrow("already been consumed")
    })
  })

  // ── 5. governance_audit_log ────────────────────────────────────────────

  describe("governance_audit_log", () => {
    it("should reject missing group_id", async () => {
      const req = { group_id: undefined } as unknown as GovernanceAuditLogRequest
      await expect(governance_audit_log(req)).rejects.toThrow()
    })

    it("should reject invalid group_id", async () => {
      const req: GovernanceAuditLogRequest = {
        group_id: "bad" as unknown as GovernanceAuditLogRequest["group_id"],
      }
      await expect(governance_audit_log(req)).rejects.toThrow("Invalid group_id")
    })

    it("should reject unknown event_type filter", async () => {
      const req: GovernanceAuditLogRequest = {
        group_id: VALID_GROUP,
        event_type: "totally_unknown_event_type",
      }
      await expect(governance_audit_log(req)).rejects.toThrow("Unknown governance event_type")
    })

    it("should accept valid known event_type filters", async () => {
      const validTypes = [
        "governance_policy_updated",
        "governance_gate_checked",
        "governance_approval_consumed",
        "proposal_created",
        "proposal_approved",
        "proposal_rejected",
        "memory_promote_requested",
      ]
      for (const eventType of validTypes) {
        const req: GovernanceAuditLogRequest = {
          group_id: VALID_GROUP,
          event_type: eventType,
          limit: 1,
        }
        // Should not throw on validation (will throw on DB if no E2E)
        // This just checks the event_type guard passes
        if (process.env.RUN_E2E_TESTS !== "true") {
          // In non-E2E mode, expect DB error (not validation error)
          try {
            await governance_audit_log(req)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            expect(msg).not.toContain("Unknown governance event_type")
          }
        }
      }
    })

    itIfE2E("should return paginated governance events for a valid group_id", async () => {
      // First produce a gate_checked event via governance_check_gate
      const checkReq: GovernanceCheckGateRequest = {
        group_id: VALID_GROUP,
        action: "audit_log_test",
        context: { agent_id: "test-agent" },
      }
      await governance_check_gate(checkReq)

      const req: GovernanceAuditLogRequest = {
        group_id: VALID_GROUP,
        limit: 10,
        offset: 0,
      }
      const response = await governance_audit_log(req)

      expect(response.entries).toBeDefined()
      expect(typeof response.total).toBe("number")
      expect(typeof response.count).toBe("number")
      expect(typeof response.has_more).toBe("boolean")
      expect(response.meta?.degraded).toBe(false)

      // Should have at least the gate_checked event we just created
      const gateEvent = response.entries.find((e) => e.event_type === "governance_gate_checked")
      expect(gateEvent).toBeDefined()
    })

    itIfE2E("should respect limit/offset pagination", async () => {
      const req1: GovernanceAuditLogRequest = {
        group_id: VALID_GROUP,
        limit: 1,
        offset: 0,
      }
      const req2: GovernanceAuditLogRequest = {
        group_id: VALID_GROUP,
        limit: 1,
        offset: 1,
      }

      const [page1, page2] = await Promise.all([governance_audit_log(req1), governance_audit_log(req2)])

      // Both pages should have at most 1 entry
      expect(page1.entries.length).toBeLessThanOrEqual(1)
      expect(page2.entries.length).toBeLessThanOrEqual(1)

      // If both have entries, they should be different events
      if (page1.entries.length > 0 && page2.entries.length > 0) {
        expect(page1.entries[0].id).not.toBe(page2.entries[0].id)
      }
    })

    itIfE2E("should filter by governance_gate_checked event type", async () => {
      const req: GovernanceAuditLogRequest = {
        group_id: VALID_GROUP,
        event_type: "governance_gate_checked",
        limit: 50,
      }
      const response = await governance_audit_log(req)

      for (const entry of response.entries) {
        expect(entry.event_type).toBe("governance_gate_checked")
      }
    })

    itIfE2E("should return empty result for group with no governance events", async () => {
      const emptyGroup = asGroupId(`allura-empty-gov-${randomUUID().slice(0, 8)}`)
      const req: GovernanceAuditLogRequest = {
        group_id: emptyGroup,
        limit: 10,
      }
      const response = await governance_audit_log(req)

      expect(response.entries).toHaveLength(0)
      expect(response.total).toBe(0)
      expect(response.has_more).toBe(false)
    })
  })
})
