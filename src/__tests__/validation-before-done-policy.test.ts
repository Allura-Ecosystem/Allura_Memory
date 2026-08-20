import { describe, expect, test } from "bun:test";
import type { ProofClaims } from "../control-plane/proof";
import {
  evaluatePolicies,
  POLICY_VALIDATION_BEFORE_DONE,
  type PolicyContext,
} from "../control-plane/policy";

const baseClaims: ProofClaims = {
  group_id: "allura-system",
  nonce: "validation-before-done-policy-test",
};

const baseContext: PolicyContext = {
  timestamp: Date.now(),
  operation: "commit",
  resource: "git:commit",
};

describe("POL-010: Validation Before Done / Release Artifact Gate", () => {
  test("blocks commit when release/package files changed without validation receipts", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      changedFiles: [
        "packages/desktop/electron-builder.yml",
        "packages/desktop/src/renderer/App.tsx",
      ],
    }, [POLICY_VALIDATION_BEFORE_DONE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-010");
  });

  test("blocks Done when artifact validation failed", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "handoff:done",
      changedFiles: ["package.json", "pnpm-lock.yaml"],
      validationReceipts: [
        {
          name: "lint",
          command: "pnpm lint",
          status: "passed",
          required: true,
        },
        {
          name: "mac packaging",
          command: "bunx electron-builder --config packages/desktop/electron-builder.yml --mac --arm64 --x64 --publish=never",
          status: "failed",
          required: true,
          summary: "missing module: dmg-license",
        },
      ],
    }, [POLICY_VALIDATION_BEFORE_DONE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].message).toContain("Lint alone");
  });

  test("allows commit when exact artifact validation passed", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      changedFiles: ["packages/desktop/electron-builder.yml", "pnpm-lock.yaml"],
      validationReceipts: [
        {
          name: "mac packaging",
          command: "bunx electron-builder --config packages/desktop/electron-builder.yml --mac --arm64 --x64 --publish=never",
          status: "passed",
          required: true,
          artifactPath: "packages/desktop/electron-builder.yml",
        },
      ],
    }, [POLICY_VALIDATION_BEFORE_DONE]);

    expect(result.passed).toBe(true);
  });

  test("does not require artifact validation for ordinary source commits", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      changedFiles: ["src/lib/memory/retrieval-layer.ts"],
      validationReceipts: [
        {
          name: "typecheck",
          command: "bunx tsc --noEmit",
          status: "passed",
        },
      ],
    }, [POLICY_VALIDATION_BEFORE_DONE]);

    expect(result.passed).toBe(true);
  });

  test("does not run on read/query operations", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseContext,
      operation: "query",
      resource: "packages/desktop/electron-builder.yml",
      changedFiles: ["packages/desktop/electron-builder.yml"],
    }, [POLICY_VALIDATION_BEFORE_DONE]);

    expect(result.passed).toBe(true);
  });
});
