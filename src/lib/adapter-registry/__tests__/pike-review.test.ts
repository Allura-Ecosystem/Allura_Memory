/**
 * Adapter Registry Validation Tests - Pike Review Findings
 *
 * Story 0: Adapter Source-of-Truth & Policy Registry
 *
 * Pike Review Findings to address:
 * - Missing read_policy should be rejected
 * - Missing write_policy should be rejected
 * - Missing system_of_record should be rejected
 * - Missing degradation_behavior should be rejected
 * - Duplicate routes should be rejected
 */

import { describe, expect, it } from "vitest"
import type { AdapterDeclaration } from "@/lib/adapter-registry/types"
import {
  addAdapter,
  createAdapterRegistry,
  seedDefaultAdapters,
  validateRegistry,
} from "@/lib/adapter-registry/registry"

describe("Adapter Registry - Pike Review Findings", () => {
  describe("Required field validation", () => {
    it("rejects adapter with missing read_policy", () => {
      const registry = createAdapterRegistry()
      const invalidAdapter: Partial<AdapterDeclaration> = {
        adapter_id: "missing-read-policy",
        display_name: "Missing Read Policy",
        route: "/test-missing-read",
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
      }

      expect(() => addAdapter(registry, invalidAdapter as AdapterDeclaration)).toThrow(
        "[AdapterRegistry:validateFields] read_policy is required (adapter_id=missing-read-policy)"
      )
    })

    it("rejects adapter with missing write_policy", () => {
      const registry = createAdapterRegistry()
      const invalidAdapter: Partial<AdapterDeclaration> = {
        adapter_id: "missing-write-policy",
        display_name: "Missing Write Policy",
        route: "/test-missing-write",
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
      }

      expect(() => addAdapter(registry, invalidAdapter as AdapterDeclaration)).toThrow(
        "[AdapterRegistry:validateFields] write_policy is required (adapter_id=missing-write-policy)"
      )
    })

    it("rejects adapter with missing system_of_record", () => {
      const registry = createAdapterRegistry()
      const invalidAdapter: Partial<AdapterDeclaration> = {
        adapter_id: "missing-system",
        display_name: "Missing System",
        route: "/test-missing-system",
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
      }

      expect(() => addAdapter(registry, invalidAdapter as AdapterDeclaration)).toThrow(
        "[AdapterRegistry:validateFields] system_of_record is required (adapter_id=missing-system)"
      )
    })

    it("rejects adapter with missing degradation_behavior", () => {
      const registry = createAdapterRegistry()
      const invalidAdapter: Partial<AdapterDeclaration> = {
        adapter_id: "missing-degradation",
        display_name: "Missing Degradation",
        route: "/test-missing-degradation",
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
      }

      expect(() => addAdapter(registry, invalidAdapter as AdapterDeclaration)).toThrow(
        "[AdapterRegistry:validateFields] degradation_behavior is required (adapter_id=missing-degradation)"
      )
    })
  })

  describe("Route uniqueness validation", () => {
    it("rejects duplicate route in same registry", () => {
      const registry = createAdapterRegistry()
      
      const firstAdapter: AdapterDeclaration = {
        adapter_id: "first-adapter",
        display_name: "First Adapter",
        route: "/duplicate-test",
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
      }

      const secondAdapter: AdapterDeclaration = {
        adapter_id: "second-adapter",
        display_name: "Second Adapter",
        route: "/duplicate-test",
        system_of_record: "allura-brain",
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
        degradation_behavior: "warn",
        approved_actions: ["write"],
        prohibited_actions: [],
      }

      addAdapter(registry, firstAdapter)
      
      expect(() => addAdapter(registry, secondAdapter)).toThrow(
        "[AdapterRegistry:addAdapter] Adapter route already exists: /duplicate-test (adapter_id=second-adapter)"
      )
    })
  })

  describe("Validation at addAdapter time", () => {
    it("validates all required fields at addAdapter time", () => {
      const registry = createAdapterRegistry()
      
      // Try to add an adapter with missing write_policy
      const incomplete: Partial<AdapterDeclaration> = {
        adapter_id: "incomplete-adapter",
        display_name: "Incomplete",
        route: "/incomplete",
        system_of_record: "notion",
        read_policy: { type: "authenticated", min_role: "viewer" },
        // write_policy is missing - this should fail
        memory_scope: "group",
        evidence_policy: "full",
        degradation_behavior: "error",
        approved_actions: [],
        prohibited_actions: [],
      }

      expect(() => addAdapter(registry, incomplete as AdapterDeclaration)).toThrow(
        "AdapterRegistry:validateFields"
      )
    })
  })
})
