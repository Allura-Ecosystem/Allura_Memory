import { describe, expect, it } from "vitest";
import {
  evaluatePolicies,
  POLICY_BRAND_COPY_LOCK,
  POLICY_BRAND_PACKET_REQUIRED,
  POLICY_BRAND_RELEASE_APPROVAL,
  POLICY_BRAND_SOURCE_OF_TRUTH,
  POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK,
  POLICY_DURHAM_QA_REVIEW_GATE,
  POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE,
  type PolicyContext,
  type PolicyViolation,
} from "../policy";
import type { ProofClaims } from "../proof";

const baseClaims: ProofClaims = {
  group_id: "allura-system",
  nonce: "brand-policies-test",
};

function hasViolation(violations: PolicyViolation[], id: string): boolean {
  return violations.some((v) => v.policyId === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// POL-BRAND-001: Brand Source-of-Truth Gate
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// POL-BRAND-002: Brand Release Approval Gate
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// POL-023: Brand Department Packet Required
// ─────────────────────────────────────────────────────────────────────────────

const baseContext: PolicyContext = {
  timestamp: Date.now(),
  operation: "commit",
  resource: "git:commit",
};

describe("POL-023: Brand Department Packet Required", () => {
  it("blocks commit when no brand packet read receipt exists", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "commit",
    }, [POLICY_BRAND_PACKET_REQUIRED]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-023");
    expect(result.violations[0].message).toContain("Brand Department Packet Required");
  });

  it("blocks deploy when no brand packet read receipt exists", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "deploy",
    }, [POLICY_BRAND_PACKET_REQUIRED]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-023");
  });

  it("allows commit when brandPacketRead flag is true", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "commit",
      brandPacketRead: true,
    }, [POLICY_BRAND_PACKET_REQUIRED]);

    expect(result.passed).toBe(true);
  });

  it("allows commit when brand_packet_read receipt exists in validationReceipts", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "push",
      validationReceipts: [
        { name: "brand_packet_read", status: "passed" },
      ],
    }, [POLICY_BRAND_PACKET_REQUIRED]);

    expect(result.passed).toBe(true);
  });

  it("does not enforce on read/query operations", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "query",
    }, [POLICY_BRAND_PACKET_REQUIRED]);

    expect(result.passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POL-024: Brand Token and Typography Lock
// ─────────────────────────────────────────────────────────────────────────────

describe("POL-024: Brand Token and Typography Lock", () => {
  it("blocks changes to brand token files without Kotler/Munari approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/lib/brand/allura.ts",
    }, [POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-024");
    expect(result.violations[0].message).toContain("Brand Token and Typography Lock");
  });

  it("blocks changes to brand token files via changedFiles without approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "commit",
      resource: "git:commit",
      changedFiles: ["src/styles/brand-tokens.css"],
    }, [POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-024");
  });

  it("allows brand token changes with kotlerApproval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/lib/brand/allura.ts",
      kotlerApproval: true,
    }, [POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK]);

    expect(result.passed).toBe(true);
  });

  it("allows brand token changes with munariApproval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/lib/theme/brand.ts",
      munariApproval: true,
    }, [POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK]);

    expect(result.passed).toBe(true);
  });

  it("allows non-brand-token file changes without approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/components/Button.tsx",
    }, [POLICY_BRAND_TOKEN_TYPOGRAPHY_LOCK]);

    expect(result.passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POL-025: Brand Copy Lock
// ─────────────────────────────────────────────────────────────────────────────

describe("POL-025: Brand Copy Lock", () => {
  it("blocks changes to brand copy files without copywriter approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/copy/messaging.ts",
    }, [POLICY_BRAND_COPY_LOCK]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-025");
    expect(result.violations[0].message).toContain("Brand Copy Lock");
  });

  it("blocks changes to brand copy via changedFiles without approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "commit",
      resource: "git:commit",
      changedFiles: ["src/voice/taglines.json"],
    }, [POLICY_BRAND_COPY_LOCK]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-025");
  });

  it("allows brand copy changes with copywriterApproval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/copy/messaging.ts",
      copywriterApproval: true,
    }, [POLICY_BRAND_COPY_LOCK]);

    expect(result.passed).toBe(true);
  });

  it("allows brand copy changes with brandCopyApproval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/voice/taglines.json",
      brandCopyApproval: true,
    }, [POLICY_BRAND_COPY_LOCK]);

    expect(result.passed).toBe(true);
  });

  it("allows non-brand-copy file changes without approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/components/Header.tsx",
    }, [POLICY_BRAND_COPY_LOCK]);

    expect(result.passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POL-026: Visual Evidence Before Brand Done
// ─────────────────────────────────────────────────────────────────────────────

describe("POL-026: Visual Evidence Before Brand Done", () => {
  it("blocks Done on brand-affecting work without visual evidence", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-026");
    expect(result.violations[0].message).toContain("Visual Evidence Before Brand Done");
  });

  it("blocks handoff on brand token work without visual evidence", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "handoff",
      resource: "git:handoff",
      changedFiles: ["src/styles/brand-tokens.css"],
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-026");
  });

  it("allows Done when visualEvidence flag is true", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
      visualEvidence: true,
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(true);
  });

  it("allows Done when visual_evidence is a screenshot path string", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
      visual_evidence: "/screenshots/brand-update.png",
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(true);
  });

  it("allows Done when visual_evidence is a non-empty array", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
      visual_evidence: ["/screenshots/shot1.png", "https://example.com/recorded"],
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(true);
  });

  it("does not enforce on non-done/non-release operations", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/lib/brand/allura.ts",
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(true);
  });

  it("does not enforce on done for non-brand work", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/components/Button.tsx",
      changedFiles: ["src/components/Button.tsx"],
    }, [POLICY_VISUAL_EVIDENCE_BEFORE_BRAND_DONE]);

    expect(result.passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POL-027: Durham QA Review Gate
// ─────────────────────────────────────────────────────────────────────────────

describe("POL-027: Durham QA Review Gate", () => {
  it("blocks Done on brand-affecting work without Durham QA pass", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
    }, [POLICY_DURHAM_QA_REVIEW_GATE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-027");
    expect(result.violations[0].message).toContain("Durham QA Review Gate");
  });

  it("blocks release on brand copy work without Durham QA pass", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "release",
      resource: "git:release",
      changedFiles: ["src/copy/messaging.ts"],
    }, [POLICY_DURHAM_QA_REVIEW_GATE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-027");
  });

  it("allows Done when durhamQaPassed flag is true", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
      durhamQaPassed: true,
    }, [POLICY_DURHAM_QA_REVIEW_GATE]);

    expect(result.passed).toBe(true);
  });

  it("allows Done when durham_qa_passed flag is true", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/lib/brand/allura.ts",
      durham_qa_passed: true,
    }, [POLICY_DURHAM_QA_REVIEW_GATE]);

    expect(result.passed).toBe(true);
  });

  it("does not enforce on non-done/non-release operations", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "mutate",
      resource: "src/lib/brand/allura.ts",
    }, [POLICY_DURHAM_QA_REVIEW_GATE]);

    expect(result.passed).toBe(true);
  });

  it("does not enforce on done for non-brand work", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "done",
      resource: "src/components/Button.tsx",
      changedFiles: ["src/components/Button.tsx"],
    }, [POLICY_DURHAM_QA_REVIEW_GATE]);

    expect(result.passed).toBe(true);
  });
});