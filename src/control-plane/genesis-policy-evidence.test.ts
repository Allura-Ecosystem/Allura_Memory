import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  genesisMutationDigest,
  issueGenesisPolicyEvidence,
  resolveGenesisPolicyEvidence,
} from "./genesis-policy-evidence";

const secret = "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars";

const evidenceInput = {
  actor: "agent-genesis-unit",
  groupId: "allura-test",
  approvalRef: "6a64b1d2-8293-4c1e-9b6a-510b7b2d4f06",
  target: "pg:pattern_proposals",
  mutationDigest: genesisMutationDigest("pg:pattern_proposals", { group_id: "allura-test", pattern_description: "unit", pattern_type: "high_frequency_task", frequency: 12, suggested_skill: "unit", confidence: 0.9, status: "proposed" }),
  projectManifest: {
    name: "Genesis unit manifest",
    sourcesOfTruth: [{ type: "local", id: "genesis-unit-source", name: "Genesis unit source", required: true }],
    infrastructureTargets: [],
  },
  sourceOfTruthReads: [{ type: "local", id: "genesis-unit-source", timestamp: 1, summary: "unit source read" }],
};

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.RUVIX_CONTROL_PLANE_SECRET;
  process.env.RUVIX_CONTROL_PLANE_SECRET = secret;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.RUVIX_CONTROL_PLANE_SECRET;
  else process.env.RUVIX_CONTROL_PLANE_SECRET = previousSecret;
});

describe("Genesis policy evidence", () => {
  it("resolves a server-issued evidence token into policy inputs", () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);

    expect(resolveGenesisPolicyEvidence(token, evidenceInput.groupId)).toMatchObject({
      actor: evidenceInput.actor,
      approvalRef: evidenceInput.approvalRef,
      policyContext: {
        projectManifest: evidenceInput.projectManifest,
        sourceOfTruthReads: evidenceInput.sourceOfTruthReads,
      },
    });
  });

  it("rejects a caller-modified evidence token", () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(() => resolveGenesisPolicyEvidence(tampered, evidenceInput.groupId))
      .toThrow("Genesis policy evidence signature is invalid");
  });

  it("rejects evidence for a different tenant", () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);

    expect(() => resolveGenesisPolicyEvidence(token, "allura-other"))
      .toThrow("Genesis policy evidence group_id does not match syscall context");
  });
});
