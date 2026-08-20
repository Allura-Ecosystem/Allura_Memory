import { describe, test, expect } from "bun:test";
import {
  evaluatePolicies,
  POLICY_SOURCE_OF_TRUTH_GATE,
  POLICY_INFRASTRUCTURE_TARGET_LOCK,
  POLICY_PROJECT_MANIFEST_REQUIRED,
  type PolicyContext,
  type ProjectManifest,
  type SourceOfTruthRead,
  type ProofClaims,
} from "../control-plane/policy";

// Minimal ProofClaims for testing
const baseClaims: ProofClaims = {
  group_id: "allura-system",
  nonce: "test-nonce",
};

const baseContext: PolicyContext = {
  timestamp: Date.now(),
  operation: "mutate",
  resource: "postgres:events",
};

const ddManifest: ProjectManifest = {
  name: "Difference Driven Website",
  sourcesOfTruth: [
    { type: "notion", id: "abc123", name: "DD Brand Specs", required: true },
  ],
  infrastructureTargets: [
    { type: "neon", id: "neon-proj-1", name: "Neon Serverless", category: "database" },
    { type: "docker-postgres", id: "dd-postgres-local", name: "Docker Dev", category: "database" },
  ],
};

describe("POL-007: Source-of-Truth Pre-Flight Gate", () => {
  test("blocks write operation when no source-of-truth read recorded", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      projectManifest: ddManifest,
      // No sourceOfTruthReads — should fail
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_SOURCE_OF_TRUTH_GATE]);
    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-007");
  });

  test("allows write operation after source-of-truth read", () => {
    const reads: SourceOfTruthRead[] = [
      { type: "notion", id: "abc123", timestamp: Date.now(), summary: "Read brand specs" },
    ];

    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      projectManifest: ddManifest,
      sourceOfTruthReads: reads,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_SOURCE_OF_TRUTH_GATE]);
    expect(result.passed).toBe(true);
  });

  test("allows read operations without source-of-truth verification", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "query",
      projectManifest: ddManifest,
      // No sourceOfTruthReads — but query is fine
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_SOURCE_OF_TRUTH_GATE]);
    expect(result.passed).toBe(true);
  });

  test("skips enforcement when no manifest declared", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      // No projectManifest — POL-009 handles this
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_SOURCE_OF_TRUTH_GATE]);
    expect(result.passed).toBe(true);
  });

  test("skips enforcement when no required sources declared", () => {
    const manifest: ProjectManifest = {
      ...ddManifest,
      sourcesOfTruth: [{ type: "notion", id: "abc123", name: "Optional", required: false }],
    };

    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      projectManifest: manifest,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_SOURCE_OF_TRUTH_GATE]);
    expect(result.passed).toBe(true);
  });
});

describe("POL-008: Infrastructure Target Lock", () => {
  test("blocks operation targeting undeclared infrastructure", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "postgres://localhost:5432/payload", // Docker, not Neon
      projectManifest: ddManifest,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_INFRASTRUCTURE_TARGET_LOCK]);
    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-008");
  });

  test("allows operation targeting declared infrastructure", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "postgres://neon-proj-1.neon.tech:5432/payload",
      projectManifest: ddManifest,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_INFRASTRUCTURE_TARGET_LOCK]);
    expect(result.passed).toBe(true);
  });

  test("allows local dev when docker-postgres is declared", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "docker-postgres://dd-postgres-local:5432/payload",
      projectManifest: ddManifest,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_INFRASTRUCTURE_TARGET_LOCK]);
    expect(result.passed).toBe(true);
  });

  test("skips enforcement for non-infrastructure resources", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "file:src/components/Button.tsx",
      projectManifest: ddManifest,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_INFRASTRUCTURE_TARGET_LOCK]);
    expect(result.passed).toBe(true);
  });
});

describe("POL-009: Project Manifest Required", () => {
  test("blocks write operation when no manifest exists", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      // No projectManifest
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_PROJECT_MANIFEST_REQUIRED]);
    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-009");
  });

  test("allows write operation when manifest exists", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      projectManifest: ddManifest,
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_PROJECT_MANIFEST_REQUIRED]);
    expect(result.passed).toBe(true);
  });

  test("allows read operations without manifest", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "query",
      // No projectManifest — reads are always ok
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_PROJECT_MANIFEST_REQUIRED]);
    expect(result.passed).toBe(true);
  });

  test("allows creating the manifest itself without a manifest", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "file:PROJECT.yaml",
      // No projectManifest — but creating the manifest is ok
    };

    const result = evaluatePolicies(baseClaims, ctx, [POLICY_PROJECT_MANIFEST_REQUIRED]);
    expect(result.passed).toBe(true);
  });
});

describe("P0 Policies Together", () => {
  const p0Policies = [
    POLICY_SOURCE_OF_TRUTH_GATE,
    POLICY_INFRASTRUCTURE_TARGET_LOCK,
    POLICY_PROJECT_MANIFEST_REQUIRED,
  ];

  test("blocks write when manifest missing (POL-009 fires first)", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      // No manifest, no reads
    };

    const result = evaluatePolicies(baseClaims, ctx, p0Policies);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });

  test("blocks write when manifest exists but no source read (POL-007 fires)", () => {
    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "postgres://neon-proj-1.neon.tech:5432/payload",
      projectManifest: ddManifest,
      // No sourceOfTruthReads
    };

    const result = evaluatePolicies(baseClaims, ctx, p0Policies);
    expect(result.passed).toBe(false);
    // POL-009 passes (manifest exists), POL-007 fails (no read)
    expect(result.violations.some(v => v.policyId === "POL-007")).toBe(true);
  });

  test("passes all P0 policies when everything is correct", () => {
    const reads: SourceOfTruthRead[] = [
      { type: "notion", id: "abc123", timestamp: Date.now(), summary: "Read brand specs" },
    ];

    const ctx: PolicyContext = {
      ...baseContext,
      operation: "mutate",
      resource: "postgres://neon-proj-1.neon.tech:5432/payload",
      projectManifest: ddManifest,
      sourceOfTruthReads: reads,
    };

    const result = evaluatePolicies(baseClaims, ctx, p0Policies);
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });
});