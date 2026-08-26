import { describe, expect, it } from "vitest";
import { createInventoryService } from "../../inventory/service";
import type { InventorySourceRecord, TenantScope } from "../../inventory/types";
import { createExposureMatcher } from "../matcher";
import type { ExposureAlert, ThreatAdvisory } from "../types";

function makeScope(override?: { group_id?: string; workspace_id?: string }): TenantScope {
  return {
    group_id: override?.group_id ?? "allura-test",
    workspace_id: override?.workspace_id ?? "workspace-a",
  };
}

function baseAdvisory(override?: Partial<ThreatAdvisory>): ThreatAdvisory {
  return {
    id: "advisory-1",
    source_id: "osv-1",
    source_url: "https://example.com/advisory-1",
    publisher: "test-publisher",
    published_at: "2026-08-25T00:00:00Z",
    fetched_at: "2026-08-25T01:00:00Z",
    source_revision: "rev-1",
    content_hash: "sha256-advisory-1",
    trust_state: "verified",
    freshness_state: "fresh",
    classification: "compromised-dependency",
    retention_disposition: "preserve",
    severity: "high",
    evidence_ids: ["evidence-1"],
    indicators: [],
    ...override,
  } as ThreatAdvisory;
}

function makeSource(
  id: string,
  fields: Partial<InventorySourceRecord> & { package: string; version: string; hash: string },
): InventorySourceRecord {
  const { package: pkg, version, hash, ...rest } = fields;
  return {
    id,
    artifact_type: "package_manifest",
    ecosystem: "npm",
    package: pkg,
    version,
    hash,
    publisher: "trusted-publisher",
    workflow_reference: ".github/workflows/ci.yml",
    source_ref: `source-${id}`,
    trust_state: "verified",
    freshness_state: "fresh",
    ...rest,
  };
}

describe("Story 26.3 — exposure matcher", () => {
  it("matches compromised dependency by package + version", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-1", { package: "evil-lib", version: "1.2.3", hash: "hash-a" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-compromised-dep",
      indicators: [
        { type: "package", value: "evil-lib" },
        { type: "version", value: "1.2.3" },
      ],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(1);
    expect(matches[0].match_type).toBe("package_version");
    expect(matches[0].confidence).toBe(1);
  });

  it("matches malicious install hook by hash", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-2", {
        package: "postinstall-script",
        version: "0.0.1",
        hash: "bad-install-hook-hash",
      }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-install-hook",
      indicators: [{ type: "hash", value: "bad-install-hook-hash" }],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(1);
    expect(matches[0].match_type).toBe("package_hash");
  });

  it("matches workflow/action drift by workflow_reference", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-3", {
        package: "ci-runner",
        version: "2.0.0",
        hash: "hash-c",
        workflow_reference: "actions/checkout@v3",
      }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-workflow-drift",
      indicators: [{ type: "action_ref", value: "actions/checkout@v3" }],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(1);
    expect(matches[0].match_type).toBe("workflow_reference");
  });

  it("matches credential-exposure indicator by hash", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-4", {
        package: "secret-bundler",
        version: "9.9.9",
        hash: "leaked-credential-hash",
      }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-credential-exposure",
      indicators: [{ type: "credential", value: "leaked-credential-hash" }],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(1);
    expect(matches[0].match_type).toBe("indicator");
  });

  it("matches AI tool/plugin compromise by publisher", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-5", {
        package: "model-loader",
        version: "0.5.0",
        hash: "hash-e",
        publisher: "rogue-ai-vendor",
      }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-ai-plugin",
      indicators: [{ type: "publisher", value: "rogue-ai-vendor" }],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(1);
    expect(matches[0].match_type).toBe("publisher");
  });

  it("deduplicates multiple advisories for the same exposure into one alert", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-6", { package: "dupe-lib", version: "4.0.0", hash: "hash-f" }),
    ]);

    const matcher = createExposureMatcher();
    const advisoryA = baseAdvisory({
      id: "adv-dupe-a",
      indicators: [
        { type: "package", value: "dupe-lib" },
        { type: "version", value: "4.0.0" },
      ],
      evidence_ids: ["evidence-a"],
    });
    const advisoryB = baseAdvisory({
      id: "adv-dupe-b",
      indicators: [
        { type: "package", value: "dupe-lib" },
        { type: "version", value: "4.0.0" },
      ],
      evidence_ids: ["evidence-b"],
    });

    const matches = [
      ...matcher.matchAdvisory(scope, inventory, advisoryA),
      ...matcher.matchAdvisory(scope, inventory, advisoryB),
    ];
    const alerts = matcher.createAlerts(scope, matches);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].advisory_refs).toEqual(["adv-dupe-a", "adv-dupe-b"]);
    expect(alerts[0].evidence_ids).toEqual(["evidence-a", "evidence-b"]);
  });

  it("produces the same dedup_key when re-matching the same advisory", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-7", { package: "repeat-lib", version: "5.0.0", hash: "hash-g" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-repeat",
      indicators: [
        { type: "package", value: "repeat-lib" },
        { type: "version", value: "5.0.0" },
      ],
    });

    const matches1 = matcher.matchAdvisory(scope, inventory, advisory);
    const matches2 = matcher.matchAdvisory(scope, inventory, advisory);
    const alerts1 = matcher.createAlerts(scope, matches1);
    const alerts2 = matcher.createAlerts(scope, matches2);

    expect(alerts1[0].dedup_key).toBe(alerts2[0].dedup_key);
  });

  it("does not leak across tenants", () => {
    const inventory = createInventoryService();
    const scopeA = makeScope({ workspace_id: "workspace-a" });
    const scopeB = makeScope({ workspace_id: "workspace-b" });

    inventory.ingestSources(scopeA, [
      makeSource("pkg-tenant", { package: "tenant-lib", version: "1.0.0", hash: "hash-h" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-tenant",
      indicators: [
        { type: "package", value: "tenant-lib" },
        { type: "version", value: "1.0.0" },
      ],
    });

    const matchesA = matcher.matchAdvisory(scopeA, inventory, advisory);
    const matchesB = matcher.matchAdvisory(scopeB, inventory, advisory);

    expect(matchesA).toHaveLength(1);
    expect(matchesB).toHaveLength(0);

    const alertsA = matcher.createAlerts(scopeA, matchesA);
    const alertsB = matcher.createAlerts(scopeB, matchesB);

    expect(alertsA[0].workspace_id).toBe("workspace-a");
    expect(alertsB).toHaveLength(0);
  });

  it.each([
    { trust_state: "provisional", freshness_state: "fresh" },
    { trust_state: "verified", freshness_state: "stale" },
    { trust_state: "verified", freshness_state: "degraded" },
    { trust_state: "rejected", freshness_state: "fresh" },
  ] as const)("fails closed for advisory trust=$trust_state freshness=$freshness_state", (state) => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-stale", { package: "stale-lib", version: "2.0.0", hash: "hash-i" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-stale",
      trust_state: state.trust_state,
      freshness_state: state.freshness_state,
      indicators: [
        { type: "package", value: "stale-lib" },
        { type: "version", value: "2.0.0" },
      ],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(0);

    const alerts = matcher.createAlerts(scope, matches);
    expect(alerts).toHaveLength(0);
  });

  it("does not mutate inventory records", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    const sources = [
      makeSource("pkg-readonly", { package: "readonly-lib", version: "3.0.0", hash: "hash-j" }),
    ];
    inventory.ingestSources(scope, sources);

    const before = JSON.stringify(inventory.queryInventory(scope, {}));
    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-readonly",
      indicators: [
        { type: "package", value: "readonly-lib" },
        { type: "version", value: "3.0.0" },
      ],
    });

    matcher.matchAdvisory(scope, inventory, advisory);
    const after = JSON.stringify(inventory.queryInventory(scope, {}));

    expect(after).toBe(before);
  });

  it("rejects invalid tenant scope", () => {
    const inventory = createInventoryService();
    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({ indicators: [{ type: "package", value: "x" }] });

    expect(() =>
      matcher.matchAdvisory(
        { group_id: "invalid-tenant", workspace_id: "workspace-a" },
        inventory,
        advisory,
      ),
    ).toThrow("invalid tenant scope");
  });

  it("fails closed for stale inventory record even with verified+fresh advisory", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-stale-inv", {
        package: "stale-inv-lib",
        version: "2.0.0",
        hash: "hash-stale-inv",
        freshness_state: "stale",
      }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-stale-inv",
      indicators: [
        { type: "package", value: "stale-inv-lib" },
        { type: "version", value: "2.0.0" },
      ],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(0);

    const alerts = matcher.createAlerts(scope, matches);
    expect(alerts).toHaveLength(0);
  });

  it("fails closed for rejected inventory record", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-rejected-inv", {
        package: "rejected-inv-lib",
        version: "3.0.0",
        hash: "hash-rejected-inv",
        trust_state: "rejected",
      }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-rejected-inv",
      indicators: [
        { type: "package", value: "rejected-inv-lib" },
        { type: "version", value: "3.0.0" },
      ],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(0);

    const alerts = matcher.createAlerts(scope, matches);
    expect(alerts).toHaveLength(0);
  });

  it("produces no match for a CVE-only advisory", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-cve-only", { package: "cve-lib", version: "1.0.0", hash: "hash-cve" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-cve-only",
      indicators: [{ type: "cve", value: "CVE-2026-0001" }],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    expect(matches).toHaveLength(0);

    const alerts = matcher.createAlerts(scope, matches);
    expect(alerts).toHaveLength(0);
  });

  it("filters alerts by severity and state via queryAlerts", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-filter", { package: "filter-lib", version: "6.0.0", hash: "hash-k" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-filter",
      severity: "critical",
      indicators: [
        { type: "package", value: "filter-lib" },
        { type: "version", value: "6.0.0" },
      ],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    const alerts = matcher.createAlerts(scope, matches);

    expect(alerts).toHaveLength(1);

    const filtered = matcher.queryAlerts(scope, alerts, { severity: "critical" });
    expect(filtered).toHaveLength(1);

    const noMatch = matcher.queryAlerts(scope, alerts, { severity: "low" });
    expect(noMatch).toHaveLength(0);

    const otherTenant = matcher.queryAlerts(
      makeScope({ workspace_id: "other" }),
      alerts,
      { severity: "critical" },
    );
    expect(otherTenant).toHaveLength(0);
  });

  it("preserves advisory source, fetch time, trust state, and evidence in alert", () => {
    const inventory = createInventoryService();
    const scope = makeScope();
    inventory.ingestSources(scope, [
      makeSource("pkg-evidence", { package: "evidence-lib", version: "7.0.0", hash: "hash-l" }),
    ]);

    const matcher = createExposureMatcher();
    const advisory = baseAdvisory({
      id: "adv-evidence",
      source_id: "ghsa-source",
      source_url: "https://github.com/advisories/GHSA-0000",
      publisher: "github-advisory",
      published_at: "2026-08-20T00:00:00Z",
      fetched_at: "2026-08-26T00:00:00Z",
      evidence_ids: ["evidence-pub", "evidence-hash"],
      indicators: [
        { type: "package", value: "evidence-lib" },
        { type: "version", value: "7.0.0" },
      ],
    });

    const matches = matcher.matchAdvisory(scope, inventory, advisory);
    const alerts = matcher.createAlerts(scope, matches);

    const alert: ExposureAlert = alerts[0];
    expect(alert.group_id).toBe("allura-test");
    expect(alert.workspace_id).toBe("workspace-a");
    expect(alert.advisory_refs).toContain("adv-evidence");
    expect(alert.evidence_ids).toEqual(["evidence-hash", "evidence-pub"]);
    expect(alert.state).toBe("open");
  });
});
