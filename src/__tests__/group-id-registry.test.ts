/**
 * Group ID Registry Tests — Story 20.1
 *
 * Verifies:
 * - Valid registry loads and returns correct defaults
 * - Invalid group_id format is rejected (fail closed)
 * - Missing agent returns allura-system fallback
 * - Cross-tenant agent returns all allowed tenants
 * - isAgentAllowedGroupId enforces tenant boundaries
 */

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { stringify as stringifyYaml } from "yaml";

import {
  loadRegistry,
  reloadRegistry,
  getDefaultGroupId,
  getAllowedGroupIds,
  isAgentAllowedGroupId,
} from "@/lib/config/group-id-registry";

// Helper: write a YAML registry to a temp file
function writeTempRegistry(data: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "registry-test-"));
  const filePath = join(dir, "group-id-registry.yaml");
  writeFileSync(filePath, stringifyYaml(data), "utf-8");
  return filePath;
}

// Each test uses a unique temp file path so the module-level cache doesn't interfere.

describe("Story 20.1 — Group ID Registry", () => {
  it("AC-1/AC-3: valid registry loads and getDefaultGroupId returns correct default", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "gilliam",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system", "allura-faithmeats"],
        },
        {
          id: "woz",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    const registry = loadRegistry(registryPath);
    expect(registry.agents).toHaveLength(2);
    expect(getDefaultGroupId("gilliam", registryPath)).toBe("allura-system");
  });

  it("AC-4: invalid group_id format is rejected (fail closed)", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "bad-agent",
          default_group_id: "INVALID_FORMAT",
          allowed_group_ids: ["INVALID_FORMAT"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    expect(() => loadRegistry(registryPath)).toThrow(
      /does not match \^allura-\[a-z0-9-\]\+\$/
    );
  });

  it("AC-4: invalid group_id in allowed_group_ids is rejected", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "test-agent",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system", "BadGroup"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    expect(() => loadRegistry(registryPath)).toThrow(/Invalid group_id/);
  });

  it("AC-5: missing agent returns allura-system fallback", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "gilliam",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    loadRegistry(registryPath);
    expect(getDefaultGroupId("nonexistent-agent", registryPath)).toBe("allura-system");
    expect(getAllowedGroupIds("nonexistent-agent", registryPath)).toEqual([
      "allura-system",
    ]);
  });

  it("AC-5: cross-tenant agent returns all allowed tenants", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "gilliam",
          default_group_id: "allura-system",
          allowed_group_ids: [
            "allura-system",
            "allura-faithmeats",
            "allura-difference-driven",
            "allura-coding",
          ],
        },
      ],
      fallback_group_id: "allura-system",
    });

    loadRegistry(registryPath);
    const allowed = getAllowedGroupIds("gilliam", registryPath);
    expect(allowed).toHaveLength(4);
    expect(allowed).toContain("allura-system");
    expect(allowed).toContain("allura-faithmeats");
    expect(allowed).toContain("allura-difference-driven");
    expect(allowed).toContain("allura-coding");
  });

  it("AC-2: nonprofit agents are scoped to allura-difference-driven only", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "nonprofit-organizer",
          default_group_id: "allura-difference-driven",
          allowed_group_ids: ["allura-difference-driven"],
        },
        {
          id: "nonprofit-researcher",
          default_group_id: "allura-difference-driven",
          allowed_group_ids: ["allura-difference-driven"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    loadRegistry(registryPath);
    expect(getDefaultGroupId("nonprofit-organizer", registryPath)).toBe(
      "allura-difference-driven"
    );
    expect(getAllowedGroupIds("nonprofit-organizer", registryPath)).toEqual([
      "allura-difference-driven",
    ]);
    expect(
      isAgentAllowedGroupId("nonprofit-organizer", "allura-system", registryPath)
    ).toBe(false);
    expect(
      isAgentAllowedGroupId(
        "nonprofit-organizer",
        "allura-difference-driven",
        registryPath
      )
    ).toBe(true);
  });

  it("isAgentAllowedGroupId enforces tenant boundaries", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "woz",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system", "allura-coding"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    loadRegistry(registryPath);
    expect(isAgentAllowedGroupId("woz", "allura-system", registryPath)).toBe(true);
    expect(isAgentAllowedGroupId("woz", "allura-coding", registryPath)).toBe(true);
    expect(isAgentAllowedGroupId("woz", "allura-faithmeats", registryPath)).toBe(false);
  });

  it("rejects registry where default_group_id is not in allowed_group_ids", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "test-agent",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-coding"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    expect(() => loadRegistry(registryPath)).toThrow(/is not in allowed_group_ids/);
  });

  it("rejects registry with empty allowed_group_ids", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "test-agent",
          default_group_id: "allura-system",
          allowed_group_ids: [],
        },
      ],
      fallback_group_id: "allura-system",
    });

    expect(() => loadRegistry(registryPath)).toThrow(/has no allowed_group_ids/);
  });

  it("reloadRegistry forces re-read from disk", () => {
    const registryPath = writeTempRegistry({
      agents: [
        {
          id: "agent-a",
          default_group_id: "allura-system",
          allowed_group_ids: ["allura-system"],
        },
      ],
      fallback_group_id: "allura-system",
    });

    loadRegistry(registryPath);
    expect(getDefaultGroupId("agent-a", registryPath)).toBe("allura-system");

    // Overwrite with different data
    writeFileSync(
      registryPath,
      stringifyYaml({
        agents: [
          {
            id: "agent-a",
            default_group_id: "allura-coding",
            allowed_group_ids: ["allura-coding"],
          },
        ],
        fallback_group_id: "allura-system",
      }),
      "utf-8"
    );

    reloadRegistry(registryPath);
    expect(getDefaultGroupId("agent-a", registryPath)).toBe("allura-coding");
  });
});