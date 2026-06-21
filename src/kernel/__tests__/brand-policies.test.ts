import { describe, expect, it } from "vitest";

import {
  evaluatePolicies,
  POLICY_BRAND_RELEASE_APPROVAL,
  POLICY_BRAND_SOURCE_OF_TRUTH,
  type PolicyViolation,
} from "../policy";

const baseClaims = {
  group_id: "allura-system",
  actor_id: "agent-gilliam",
  nonce: "test-nonce",
  audit_context: { reason: "brand policy test" },
};

function hasViolation(violations: PolicyViolation[], id: string): boolean {
  return violations.some((v) => v.policyId === id);
}

describe("POL-BRAND-001: Brand Source-of-Truth Gate", () => {
  const context = {
    timestamp: Date.now(),
    operation: "update",
    resource: "public/brand/logo.css",
  };

  it("passes when a recent Notion brand guide read exists", () => {
    const result = evaluatePolicies(
      baseClaims,
      {
        ...context,
        brandSourceReads: [
          { company: "Allura", notionId: "3481d9be-65b3-8110-9a74-f02c224d9e23", timestamp: Date.now() },
        ],
      },
      [POLICY_BRAND_SOURCE_OF_TRUTH]
    );
    expect(result.passed).toBe(true);
  });

  it("blocks brand-affecting work without a recent brand guide read", () => {
    const result = evaluatePolicies(baseClaims, context, [POLICY_BRAND_SOURCE_OF_TRUTH]);
    expect(result.passed).toBe(false);
    expect(hasViolation(result.violations, "POL-BRAND-001")).toBe(true);
  });

  it("skips non-brand operations", () => {
    const result = evaluatePolicies(
      baseClaims,
      {
        ...context,
        operation: "query",
        resource: "internal/config.json",
      },
      [POLICY_BRAND_SOURCE_OF_TRUTH]
    );
    expect(result.passed).toBe(true);
  });

  it("rejects stale reads older than 30 days", () => {
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000;
    const result = evaluatePolicies(
      baseClaims,
      {
        ...context,
        brandSourceReads: [
          { company: "Allura", notionId: "3481d9be-65b3-8110-9a74-f02c224d9e23", timestamp: fortyDaysAgo },
        ],
      },
      [POLICY_BRAND_SOURCE_OF_TRUTH]
    );
    expect(hasViolation(result.violations, "POL-BRAND-001")).toBe(true);
  });
});

describe("POL-BRAND-002: Brand Release Approval Gate", () => {
  const releaseContext = {
    timestamp: Date.now(),
    operation: "done",
    resource: "src/app/brand/page.tsx",
    isBrandSurface: true,
  };

  it("passes with Captain + Steve/IRIS CEO approvals", () => {
    const result = evaluatePolicies(
      baseClaims,
      {
        ...releaseContext,
        brandApprovals: [
          { role: "captain", approved: true, timestamp: Date.now() },
          { role: "iris-ceo", approved: true, timestamp: Date.now() },
        ],
      },
      [POLICY_BRAND_RELEASE_APPROVAL]
    );
    expect(result.passed).toBe(true);
  });

  it("blocks release with only Captain approval", () => {
    const result = evaluatePolicies(
      baseClaims,
      {
        ...releaseContext,
        brandApprovals: [{ role: "captain", approved: true, timestamp: Date.now() }],
      },
      [POLICY_BRAND_RELEASE_APPROVAL]
    );
    expect(hasViolation(result.violations, "POL-BRAND-002")).toBe(true);
  });

  it("blocks release with no approvals", () => {
    const result = evaluatePolicies(baseClaims, releaseContext, [POLICY_BRAND_RELEASE_APPROVAL]);
    expect(hasViolation(result.violations, "POL-BRAND-002")).toBe(true);
  });

  it("skips non-release operations", () => {
    const result = evaluatePolicies(
      baseClaims,
      {
        ...releaseContext,
        operation: "read",
      },
      [POLICY_BRAND_RELEASE_APPROVAL]
    );
    expect(result.passed).toBe(true);
  });
});
