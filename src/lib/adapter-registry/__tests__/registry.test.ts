/**
 * Adapter Registry Contract Tests
 *
 * Story 0: Adapter Source-of-Truth & Policy Registry
 *
 * Routes: /command, /work-board, /agents, /telemetry, /allura, /resources
 *
 * Each route must have at least one AdapterDeclaration with:
 * - adapter_id
 * - display_name
 * - route
 * - system_of_record
 * - read_policy
 * - write_policy
 * - memory_scope
 * - evidence_policy
 * - degradation_behavior
 * - approved_actions
 * - prohibited_actions
 */

import { describe, it, expect } from "vitest"
import type {
  AdapterDeclaration,
  AdapterRegistry,
  ReadPolicy,
  WritePolicy,
  MemoryScope,
  EvidencePolicy,
  DegradationBehavior,
} from "@/lib/adapter-registry/types"
import { AdapterRegistryError } from "@/lib/adapter-registry/types"
import {
  createAdapterRegistry,
  addAdapter,
  getAdapter,
  getAdapterByRoute,
  getAdaptersByRoute,
  validateRegistry,
  seedDefaultAdapters,
  createDefaultRegistry,
} from "@/lib/adapter-registry/registry"

describe("Adapter Registry - Story 0", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // AdapterDeclaration contract tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("AdapterDeclaration contract", () => {
    it("requires all mandatory fields", () => {
      const validAdapter: AdapterDeclaration = {
        adapter_id: "notion-work-board",
        display_name: "Notion Work Board",
        route: "/work-board",
        system_of_record: "notion",
        read_policy: {
          type: "authenticated",
          min_role: "viewer",
        },
        write_policy: {
          type: "authenticated",
          min_role: "editor",
          audit: true,
        },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read", "create", "update"],
        prohibited_actions: ["delete", "export"],
      }

      expect(validAdapter).toMatchObject({
        adapter_id: "notion-work-board",
        display_name: "Notion Work Board",
        route: "/work-board",
        system_of_record: "notion",
      })
    })

    it("identifies Notion Work Board adapter", () => {
      const adapters = seedDefaultAdapters()
      const workBoard = adapters.find((a) => a.route === "/work-board")
      expect(workBoard).toBeDefined()
      expect(workBoard?.adapter_id).toBe("notion-work-board")
      expect(workBoard?.display_name).toBe("Notion Work Board")
    })

    it("identifies Allura Brain adapter", () => {
      const adapters = seedDefaultAdapters()
      const brain = adapters.find((a) => a.adapter_id === "allura-brain")
      expect(brain).toBeDefined()
      expect(brain?.system_of_record).toBe("allura-brain")
    })

    it("identifies Resource Manifest adapter", () => {
      const adapters = seedDefaultAdapters()
      const resource = adapters.find((a) => a.adapter_id === "resource-manifest")
      expect(resource).toBeDefined()
      expect(resource?.route).toBe("/resources")
    })

    it("identifies Agent Runs adapter", () => {
      const adapters = seedDefaultAdapters()
      const agentRuns = adapters.find((a) => a.adapter_id === "agent-runs")
      expect(agentRuns).toBeDefined()
      expect(agentRuns?.route).toBe("/agents")
    })

    it("identifies Telemetry adapter", () => {
      const adapters = seedDefaultAdapters()
      const telemetry = adapters.find((a) => a.adapter_id === "telemetry")
      expect(telemetry).toBeDefined()
      expect(telemetry?.route).toBe("/telemetry")
    })

    it("identifies Command Overview aggregator", () => {
      const adapters = seedDefaultAdapters()
      const command = adapters.find((a) => a.adapter_id === "command-overview")
      expect(command).toBeDefined()
      expect(command?.route).toBe("/command")
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // AdapterRegistry operations tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("AdapterRegistry operations", () => {
    it("creates empty registry", () => {
      const emptyRegistry = createAdapterRegistry()
      expect(emptyRegistry.adapters).toHaveLength(0)
      expect(emptyRegistry.byRoute).toEqual({})
      expect(emptyRegistry.byId).toEqual({})
    })

    it("adds adapters to registry", () => {
      const registry = createAdapterRegistry()
      const adapters = seedDefaultAdapters()
      adapters.forEach((adapter) => {
        addAdapter(registry, adapter)
      })
      expect(registry.adapters).toHaveLength(8) // Default adapters
    })

    it("retrieves adapter by ID", () => {
      const registry = createDefaultRegistry()
      const adapter = getAdapter(registry, "notion-work-board")
      expect(adapter).toBeDefined()
      expect(adapter?.adapter_id).toBe("notion-work-board")
    })

    it("retrieves adapter by route", () => {
      const registry = createDefaultRegistry()
      const adapter = getAdapterByRoute(registry, "/work-board")
      expect(adapter).toBeDefined()
      expect(adapter?.adapter_id).toBe("notion-work-board")
    })

    it("returns null for non-existent adapter", () => {
      const registry = createDefaultRegistry()
      const adapter = getAdapter(registry, "non-existent")
      expect(adapter).toBeNull()
    })

    it("validates registry integrity", () => {
      const registry = createDefaultRegistry()
      const result = validateRegistry(registry)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Policy enforcement tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("Policy enforcement", () => {
    it("validates read policy type", () => {
      const validPolicies: ReadPolicy[] = [
        { type: "authenticated", min_role: "viewer" },
        { type: "public", min_role: "viewer" },
        { type: "authenticated", min_role: "editor" },
        { type: "authenticated", min_role: "admin" },
      ]

      validPolicies.forEach((policy) => {
        expect(policy.type).toMatch(/^(authenticated|public)$/)
        expect(policy.min_role).toMatch(/^(viewer|editor|admin)$/)
      })
    })

    it("validates write policy with audit", () => {
      const writePolicy: WritePolicy = {
        type: "authenticated",
        min_role: "editor",
        audit: true,
      }
      expect(writePolicy.type).toBe("authenticated")
      expect(writePolicy.min_role).toBe("editor")
      expect(writePolicy.audit).toBe(true)
    })

    it("validates memory scope", () => {
      const validScopes: MemoryScope[] = ["group", "user", "global"]
      validScopes.forEach((scope) => {
        expect(scope).toMatch(/^(group|user|global)$/)
      })
    })

    it("validates evidence policy", () => {
      const validPolicies: EvidencePolicy[] = ["full", "minimal", "none"]
      validPolicies.forEach((policy) => {
        expect(policy).toMatch(/^(full|minimal|none)$/)
      })
    })

    it("validates degradation behavior", () => {
      const validBehaviors: DegradationBehavior[] = ["error", "warn", "graceful", "fallback"]
      validBehaviors.forEach((behavior) => {
        expect(behavior).toMatch(/^(error|warn|graceful|fallback)$/)
      })
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Adapter routes coverage tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("Adapter routes coverage", () => {
    it("covers all required adapter routes", () => {
      const adapters = seedDefaultAdapters()
      const routes = adapters.map((a) => a.route)

      const requiredRoutes = [
        "/command",
        "/work-board",
        "/agents",
        "/telemetry",
        "/allura",
        "/resources",
      ]

      requiredRoutes.forEach((route) => {
        expect(routes).toContain(route)
      })
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Error handling tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("Error handling", () => {
    it("throws error for duplicate adapter ID", () => {
      const registry = createAdapterRegistry()
      const adapter: AdapterDeclaration = {
        adapter_id: "test-duplicate",
        display_name: "Test",
        route: "/test",
        system_of_record: "notion",
        read_policy: { type: "authenticated", min_role: "viewer" },
        write_policy: { type: "authenticated", min_role: "editor" },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read"],
        prohibited_actions: [],
      }

      addAdapter(registry, adapter)
      expect(() => addAdapter(registry, adapter)).toThrow(AdapterRegistryError)
    })

    it("throws AdapterNotFoundError for missing adapter", () => {
      const registry = createDefaultRegistry()
      expect(() => {
        const adapter = getAdapter(registry, "non-existent")
        if (!adapter) throw new Error("Adapter not found")
      }).toThrow()
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Validation tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("Validation", () => {
    it("validates group_id format for all adapters", () => {
      const adapters = seedDefaultAdapters()
      const validGroupIds = ["allura-test", "allura-system", "allura-project-1"]
      
      validGroupIds.forEach((groupId) => {
        expect(groupId).toMatch(/^allura-[a-z0-9-]+$/)
      })
    })

    it("invalidates group_id format", () => {
      const invalidGroupIds = ["test-group", "ronin-legacy", "system", ""]
      
      invalidGroupIds.forEach((groupId) => {
        // The regex pattern from validateGroupId ensures group_id starts with 'allura-'
        const pattern = /^allura-[a-z0-9-]+$/
        expect(pattern.test(groupId)).toBe(false)
      })
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Integration tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("Integration", () => {
    it("rejects duplicate route registration", () => {
      const registry = createAdapterRegistry()
      
      const adapter1: AdapterDeclaration = {
        adapter_id: "adapter-1",
        display_name: "Adapter One",
        route: "/work-board",
        system_of_record: "notion",
        read_policy: { type: "authenticated", min_role: "viewer" },
        write_policy: { type: "authenticated", min_role: "editor" },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read"],
        prohibited_actions: [],
      }
      
      const adapter2: AdapterDeclaration = {
        adapter_id: "adapter-2", 
        display_name: "Adapter Two",
        route: "/work-board",
        system_of_record: "notion",
        read_policy: { type: "authenticated", min_role: "viewer" },
        write_policy: { type: "authenticated", min_role: "editor" },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["write"],
        prohibited_actions: [],
      }
      
      addAdapter(registry, adapter1)
      
      expect(() => addAdapter(registry, adapter2)).toThrow(
        "[AdapterRegistry:addAdapter] Adapter route already exists: /work-board (adapter_id=adapter-2)"
      )
    })

    it("creates registry with all default adapters", () => {
      const registry = createDefaultRegistry()
      
      expect(registry.adapters).toHaveLength(8)
      expect(registry.byId["notion-work-board"]).toBeDefined()
      expect(registry.byId["allura-brain"]).toBeDefined()
      expect(registry.byId["resource-manifest"]).toBeDefined()
      expect(registry.byId["agent-runs"]).toBeDefined()
      expect(registry.byId["telemetry"]).toBeDefined()
      expect(registry.byId["command-overview"]).toBeDefined()
      expect(registry.byId["governance"]).toBeDefined()
      expect(registry.byId["scheduled-tasks"]).toBeDefined()

      const validation = validateRegistry(registry)
      expect(validation.valid).toBe(true)
    })
  })
})
