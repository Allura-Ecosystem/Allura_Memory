/**
 * Adapter Registry - Malformed Registry Data Tests
 *
 * Preground: validateRegistry() must catch validation issues even when
 * registry.adapters is directly modified (bypassing addAdapter validation).
 *
 * This simulates edge cases where:
 * - Registry was created externally
 * - Data was loaded from persisted state
 * - Manual construction of registry.adapters array
 */

import { describe, expect, it } from "vitest"
import { createAdapterRegistry, validateRegistry } from "@/lib/adapter-registry/registry"

describe("Adapter Registry - Malformed Registry Data (Pike Blocker)", () => {
  describe("validateRegistry catches missing required fields", () => {
    it("detects missing read_policy in manual registry construction", () => {
      // Directly construct a registry with malformed adapter data
      // This simulates loading from persistent storage or external source
      const registry = createAdapterRegistry()
      registry.adapters.push({
        adapter_id: "no-read-policy",
        display_name: "No Read Policy",
        route: "/test",
        system_of_record: "notion",
        write_policy: {
          type: "authenticated",
          min_role: "editor",
        },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read"],
        prohibited_actions: [],
      } as any) // Bypass TypeScript type checking

      const result = validateRegistry(registry)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Missing required fields in adapter: no-read-policy")
    })

    it("detects missing write_policy in manual registry construction", () => {
      const registry = createAdapterRegistry()
      registry.adapters.push({
        adapter_id: "no-write-policy",
        display_name: "No Write Policy",
        route: "/test",
        system_of_record: "notion",
        read_policy: {
          type: "authenticated",
          min_role: "viewer",
        },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read"],
        prohibited_actions: [],
      } as any)

      const result = validateRegistry(registry)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Missing required fields in adapter: no-write-policy")
    })

    it("detects missing system_of_record in manual registry construction", () => {
      const registry = createAdapterRegistry()
      registry.adapters.push({
        adapter_id: "no-system",
        display_name: "No System",
        route: "/test",
        read_policy: {
          type: "authenticated",
          min_role: "viewer",
        },
        write_policy: {
          type: "authenticated",
          min_role: "editor",
        },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read"],
        prohibited_actions: [],
      } as any)

      const result = validateRegistry(registry)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Missing required fields in adapter: no-system")
    })

    it("detects missing degradation_behavior in manual registry construction", () => {
      const registry = createAdapterRegistry()
      registry.adapters.push({
        adapter_id: "no-degradation",
        display_name: "No Degradation",
        route: "/test",
        system_of_record: "notion",
        read_policy: {
          type: "authenticated",
          min_role: "viewer",
        },
        write_policy: {
          type: "authenticated",
          min_role: "editor",
        },
        memory_scope: "group",
        evidence_policy: "full",
        approved_actions: ["read"],
        prohibited_actions: [],
      } as any)

      const result = validateRegistry(registry)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("Missing required fields in adapter: no-degradation")
    })

    it("detects all missing fields at once in manual registry construction", () => {
      const registry = createAdapterRegistry()
      registry.adapters.push({
        adapter_id: "super-incomplete",
        display_name: "Super Incomplete",
        route: "/test",
        // Missing: system_of_record, read_policy, write_policy, degradation_behavior
        approved_actions: ["read"],
        prohibited_actions: [],
      } as any)

      const result = validateRegistry(registry)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors).toContain("Missing required fields in adapter: super-incomplete")
    })
  })

  describe("validateRegistry handles mixed valid/invalid adapters", () => {
    it("flags registry as invalid when one adapter has missing fields", () => {
      const registry = createAdapterRegistry()
      
      // Add valid adapter first
      registry.adapters.push({
        adapter_id: "valid-adapter",
        display_name: "Valid Adapter",
        route: "/valid",
        system_of_record: "notion",
        read_policy: {
          type: "authenticated",
          min_role: "viewer",
        },
        write_policy: {
          type: "authenticated",
          min_role: "editor",
        },
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: ["read"],
        prohibited_actions: [],
      })

      // Add invalid adapter with missing field
      registry.adapters.push({
        adapter_id: "invalid-adapter",
        display_name: "Invalid Adapter",
        route: "/invalid",
        system_of_record: "notion",
        read_policy: {
          type: "authenticated",
          min_role: "viewer",
        },
        write_policy: {
          type: "authenticated",
          min_role: "editor",
        },
        memory_scope: "group",
        evidence_policy: "full",
        // Missing: degradation_behavior
        approved_actions: ["read"],
        prohibited_actions: [],
      } as any)

      const result = validateRegistry(registry)
      expect(result.valid).toBe(false)
      // Should contain errors for the invalid adapter
      expect(result.errors.some(e => e.includes("invalid-adapter"))).toBe(true)
    })
  })
})
