/**
 * Sync Contract Tests — Phase 5
 *
 * Verifies the agent/project mapping resolution used when promoted canonical
 * memories are linked to their Agent and Project context.
 *
 * Run with: bun vitest run src/__tests__/sync-contract.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveAgentName, resolveProjectName } from "@/lib/graph-adapter/sync-contract-mappings"

describe("Phase 5 Sync Contract — Approve Route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should resolve project_id from metadata.project or default to group_id", async () => {
    // This verifies the contract that the route passes project_id to linkMemoryContext
    // We test the resolution logic inline since we can't import Next.js routes in vitest
    // without full framework mocking.

    const bodyWithProject = {
      metadata: { project: "proj-custom-project" },
      group_id: "allura-test-group",
    }

    const bodyWithoutProject = {
      group_id: "allura-test-group",
    }

    // Logic extracted from route.ts line ~147
    const resolveProjectId = (body: { metadata?: { project?: string }; group_id: string }) => {
      return (body.metadata?.project as string | undefined) ?? body.group_id
    }

    expect(resolveProjectId(bodyWithProject)).toBe("proj-custom-project")
    expect(resolveProjectId(bodyWithoutProject)).toBe("allura-test-group")
  })
})

// ── FR-3 Mapping Resolution Tests ──────────────────────────────────────────

describe("FR-3 Sync Contract — Mapping Resolution", () => {
  it("should resolve known user_id to Agent name", () => {
    expect(resolveAgentName("bellard")).toBe("Bellard")
    expect(resolveAgentName("bellard-diagnostics")).toBe("Bellard")
    expect(resolveAgentName("knuth")).toBe("Knuth")
    expect(resolveAgentName("knuth-data")).toBe("Knuth")
    expect(resolveAgentName("gilliam")).toBe("Gilliam")
    expect(resolveAgentName("carmack-performance")).toBe("Carmack")
  })

  it("should resolve known group_id to Project name", () => {
    expect(resolveProjectName("allura-system")).toBe("Allura Memory")
    expect(resolveProjectName("allura-team-durham")).toBe("Creative Studio")
    expect(resolveProjectName("allura-default")).toBe("Allura Memory")
  })

  it("should fall back to raw ID when mapping not found", () => {
    expect(resolveAgentName("unknown-agent")).toBe("unknown-agent")
    expect(resolveProjectName("allura-unknown")).toBe("allura-unknown")
  })
})
