import { describe, expect, test } from "bun:test";
import type { ProofClaims } from "../control-plane/proof";
import {
  evaluatePolicies,
  POLICY_EMAIL_ACTION_APPROVAL_GATE,
  POLICY_EMAIL_ATTACHMENT_SANDBOX_REQUIREMENT,
  POLICY_EMAIL_INSTRUCTION_BLOCKER,
  POLICY_EMAIL_MEMORY_PROMOTION_REQUIRES_HITL,
  POLICY_HIGH_RISK_EMAIL_QUARANTINE,
  type PolicyContext,
} from "../control-plane/policy";

const baseClaims: ProofClaims = {
  group_id: "allura-system",
  nonce: "email-policy-test-nonce",
};

const baseEmailContext: PolicyContext = {
  timestamp: Date.now(),
  operation: "email:scan",
  resource: "email:gmail:message",
  source: "gmail",
  trust_zone: "external_untrusted",
};

describe("POL-EMAIL-001: External Email Instruction Blocker", () => {
  test("blocks prompt/tool instructions from email when treated as instructions", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:execute_instruction",
      emailContainsInstruction: true,
    }, [POLICY_EMAIL_INSTRUCTION_BLOCKER]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-EMAIL-001");
  });

  test("allows instruction-like email content when explicitly handled as evidence only", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      emailContainsInstruction: true,
      emailHandlingMode: "evidence_only",
    }, [POLICY_EMAIL_INSTRUCTION_BLOCKER]);

    expect(result.passed).toBe(true);
  });
});

describe("POL-EMAIL-002: Email Action Approval Gate", () => {
  test("blocks email-derived send action without Captain approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:send_reply",
      resource: "email:gmail:reply",
    }, [POLICY_EMAIL_ACTION_APPROVAL_GATE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-EMAIL-002");
  });

  test("allows email-derived send action with Captain approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:send_reply",
      resource: "email:gmail:reply",
      captainApproval: true,
    }, [POLICY_EMAIL_ACTION_APPROVAL_GATE]);

    expect(result.passed).toBe(true);
  });
});

describe("POL-EMAIL-003: High-Risk Email Quarantine", () => {
  test("blocks high-risk email link visit", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:visit_link",
      emailVerdict: "high",
    }, [POLICY_HIGH_RISK_EMAIL_QUARANTINE]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-EMAIL-003");
  });

  test("allows high-risk email quarantine operation", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:quarantine",
      emailVerdict: "high",
    }, [POLICY_HIGH_RISK_EMAIL_QUARANTINE]);

    expect(result.passed).toBe(true);
  });
});

describe("POL-EMAIL-004: Email Memory Promotion Requires HITL", () => {
  test("blocks email-derived canonical promotion without curator approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "memory:promote",
      resource: "neo4j:canonical:memory",
    }, [POLICY_EMAIL_MEMORY_PROMOTION_REQUIRES_HITL]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-EMAIL-004");
  });

  test("allows email-derived canonical promotion with HITL approval", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "memory:promote",
      resource: "neo4j:canonical:memory",
      hitlApproved: true,
    }, [POLICY_EMAIL_MEMORY_PROMOTION_REQUIRES_HITL]);

    expect(result.passed).toBe(true);
  });
});

describe("POL-EMAIL-005: Attachment Sandbox Requirement", () => {
  test("blocks attachment inspection outside quarantine/sandbox", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:inspect_attachment",
      resource: "email:attachment:invoice.zip",
      emailHasAttachment: true,
    }, [POLICY_EMAIL_ATTACHMENT_SANDBOX_REQUIREMENT]);

    expect(result.passed).toBe(false);
    expect(result.violations[0].policyId).toBe("POL-EMAIL-005");
  });

  test("allows attachment inspection when quarantined and sandboxed", () => {
    const result = evaluatePolicies(baseClaims, {
      ...baseEmailContext,
      operation: "email:inspect_attachment",
      resource: "email:attachment:invoice.zip",
      emailHasAttachment: true,
      quarantined: true,
      sandboxed: true,
    }, [POLICY_EMAIL_ATTACHMENT_SANDBOX_REQUIREMENT]);

    expect(result.passed).toBe(true);
  });
});
