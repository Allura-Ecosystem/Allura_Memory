/**
 * Unit tests for the read-only supply-chain inventory.
 *
 * Story 26.2: no DB writes, no filesystem access, no child_process/exec/spawn.
 */

import { describe, expect, it } from "vitest";
import {
  createInventoryService,
  isValidTenantScope,
} from "../service";
import type { InventorySourceRecord, TenantScope } from "../types";

const tenantScope: TenantScope = {
  group_id: "allura-system",
  workspace_id: "ws-inventory-001",
};

const sampleSources: Array<InventorySourceRecord> = [
  {
    id: "sbom-1",
    artifact_type: "sbom",
    ecosystem: "npm",
    package: "react",
    version: "18.3.1",
    hash: "sha256:aaaa",
    publisher: "meta",
    workflow_reference: "ci/sbom.yml",
    source_ref: "declared/sbom-list.json",
    trust_state: "verified",
    freshness_state: "fresh",
  },
  {
    id: "lock-1",
    artifact_type: "lockfile",
    ecosystem: "npm",
    package: "bun.lockb",
    version: "2026-08-26",
    hash: "sha256:bbbb",
    publisher: "oven",
    workflow_reference: "ci/lockfile-check.yml",
    source_ref: "declared/lockfiles.json",
    trust_state: "verified",
    freshness_state: "stale",
  },
  {
    id: "manifest-1",
    artifact_type: "package_manifest",
    ecosystem: "python",
    package: "pydantic",
    version: "2.8.2",
    hash: "sha256:cccc",
    publisher: "pydantic",
    workflow_reference: "ci/manifest-audit.yml",
    source_ref: "declared/manifests.json",
    trust_state: "provisional",
    freshness_state: "degraded",
  },
  {
    id: "workflow-1",
    artifact_type: "ci_workflow",
    ecosystem: "github-actions",
    package: "build.yml",
    version: "1.0.0",
    hash: "sha256:dddd",
    publisher: "allura",
    workflow_reference: ".github/workflows/build.yml",
    source_ref: "declared/workflows.json",
    trust_state: "verified",
    freshness_state: "fresh",
  },
  {
    id: "container-1",
    artifact_type: "container_metadata",
    ecosystem: "docker",
    package: "allura-memory",
    version: "sha256:eeee",
    hash: "sha256:eeee",
    publisher: "allura",
    workflow_reference: "ci/container-build.yml",
    source_ref: "declared/containers.json",
    trust_state: "verified",
    freshness_state: "unknown",
  },
  {
    id: "extension-1",
    artifact_type: "extension",
    ecosystem: "vscode",
    package: "allura-extension",
    version: "0.4.0",
    hash: "sha256:ffff",
    publisher: "allura",
    workflow_reference: "ci/extension-publish.yml",
    source_ref: "declared/extensions.json",
    trust_state: "provisional",
    freshness_state: "fresh",
  },
  {
    id: "mcp-1",
    artifact_type: "mcp_manifest",
    ecosystem: "mcp",
    package: "allura-brain-mcp",
    version: "1.2.0",
    hash: "sha256:1111",
    publisher: "allura",
    workflow_reference: "ci/mcp-validate.yml",
    source_ref: "declared/mcp-manifests.json",
    trust_state: "verified",
    freshness_state: "fresh",
  },
  {
    id: "skill-1",
    artifact_type: "skill",
    ecosystem: "opencode",
    package: "allura-memory-skill",
    version: "2.1.0",
    hash: "sha256:2222",
    publisher: "allura",
    workflow_reference: "ci/skill-validate.yml",
    source_ref: "declared/skills.json",
    trust_state: "verified",
    freshness_state: "stale",
  },
  {
    id: "plugin-1",
    artifact_type: "plugin",
    ecosystem: "opencode",
    package: "allura-plugin",
    version: "0.9.0",
    hash: "sha256:3333",
    publisher: "allura",
    workflow_reference: "ci/plugin-validate.yml",
    source_ref: "declared/plugins.json",
    trust_state: "provisional",
    freshness_state: "fresh",
  },
  {
    id: "model-1",
    artifact_type: "model_artifact",
    ecosystem: "ollama",
    package: "nomic-embed-text",
    version: "v1.5",
    hash: "sha256:4444",
    publisher: "nomic-ai",
    workflow_reference: "ci/model-registry.yml",
    source_ref: "declared/models.json",
    trust_state: "verified",
    freshness_state: "fresh",
  },
];

describe("Inventory service", () => {
  it("covers all ten artifact types", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const all = service.queryInventory(tenantScope, {});
    expect(all.total).toBe(10);

    const types = new Set(all.records.map((r: { artifact_type: string }) => r.artifact_type));
    expect(types).toContain("sbom");
    expect(types).toContain("lockfile");
    expect(types).toContain("package_manifest");
    expect(types).toContain("ci_workflow");
    expect(types).toContain("container_metadata");
    expect(types).toContain("extension");
    expect(types).toContain("mcp_manifest");
    expect(types).toContain("skill");
    expect(types).toContain("plugin");
    expect(types).toContain("model_artifact");
  });

  it("is read-only: no sources means empty result, not scan", () => {
    const service = createInventoryService();
    const result = service.queryInventory(tenantScope, {});
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.degraded).toBe(false);
  });

  it("normalizes records with server-derived tenant scope", () => {
    const service = createInventoryService();
    const [record] = service.ingestSources(tenantScope, [sampleSources[0]]);
    expect(record.group_id).toBe("allura-system");
    expect(record.workspace_id).toBe("ws-inventory-001");
    expect(record.ecosystem).toBe("npm");
    expect(record.package).toBe("react");
    expect(record.version).toBe("18.3.1");
    expect(record.hash).toBe("sha256:aaaa");
    expect(record.publisher).toBe("meta");
    expect(record.workflow_reference).toBe("ci/sbom.yml");
  });

  it("stale, degraded, and unknown freshness states are surfaced explicitly", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const result = service.queryInventory(tenantScope, {});
    const freshnessCounts = result.records.reduce(
      (acc: Record<string, number>, record: { freshness_state: string }) => {
        acc[record.freshness_state] = (acc[record.freshness_state] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(freshnessCounts.stale).toBe(2);
    expect(freshnessCounts.degraded).toBe(1);
    expect(freshnessCounts.unknown).toBe(1);
  });

  it("queries by artifact_type", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const result = service.queryInventory(tenantScope, {
      artifact_type: "skill",
    });
    expect(result.total).toBe(1);
    expect(result.records[0].package).toBe("allura-memory-skill");
  });

  it("queries by ecosystem case-insensitively", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const result = service.queryInventory(tenantScope, {
      ecosystem: "NPM",
    });
    expect(result.total).toBe(2);
  });

  it("queries by package name case-insensitively", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const result = service.queryInventory(tenantScope, {
      package: "ALLURA-PLUGIN",
    });
    expect(result.total).toBe(1);
    expect(result.records[0].artifact_type).toBe("plugin");
  });

  it("combines artifact_type and ecosystem filters", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const result = service.queryInventory(tenantScope, {
      artifact_type: "lockfile",
      ecosystem: "npm",
    });
    expect(result.total).toBe(1);
    expect(result.records[0].package).toBe("bun.lockb");
  });

  it("does not leak records across tenants", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, sampleSources);

    const otherTenant: TenantScope = {
      group_id: "allura-system",
      workspace_id: "ws-other",
    };
    const result = service.queryInventory(otherTenant, {});
    expect(result.total).toBe(0);
  });

  it("rejects invalid group_id scope", () => {
    const service = createInventoryService();
    expect(() =>
      service.ingestSources(
        { group_id: "roninclaw-bad", workspace_id: "ws" } as TenantScope,
        [sampleSources[0]],
      ),
    ).toThrow("invalid tenant scope");
  });

  it("rejects records with missing required fields", () => {
    const service = createInventoryService();
    const badSource = { ...sampleSources[0], package: "" };
    expect(() => service.ingestSources(tenantScope, [badSource])).toThrow();
  });

  it("isValidTenantScope accepts valid scope and rejects invalid scope", () => {
    expect(isValidTenantScope(tenantScope)).toBe(true);
    expect(isValidTenantScope({ group_id: "bad", workspace_id: "ws" })).toBe(
      false,
    );
    expect(isValidTenantScope({ group_id: "allura-system" })).toBe(false);
    expect(isValidTenantScope(null)).toBe(false);
  });

  it("ingestSources updates existing records by id within the same tenant", () => {
    const service = createInventoryService();
    service.ingestSources(tenantScope, [sampleSources[0]]);
    const updated: InventorySourceRecord = {
      ...sampleSources[0],
      version: "19.0.0",
      freshness_state: "stale",
    };

    const [record] = service.ingestSources(tenantScope, [updated]);
    expect(record.version).toBe("19.0.0");
    expect(record.freshness_state).toBe("stale");

    const result = service.queryInventory(tenantScope, { package: "react" });
    expect(result.total).toBe(1);
    expect(result.records[0].version).toBe("19.0.0");
  });
});
