import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/control-plane/target-resolver", () => ({
  resolveTarget: vi.fn().mockResolvedValue({ success: true, affected_rows: 1 }),
}));

import { issueGenesisPolicyEvidence } from "@/control-plane/genesis-policy-evidence";
import { resolveTarget } from "@/control-plane/target-resolver";
import { generateProposal, type GenesisProposalContext } from "./proposal-generator";

const SECRET = "genesis-boundary-test-control-plane-secret-32chars";
const APPROVAL = "6a64b1d2-8293-4c1e-9b6a-510b7b2d4f06";
const pattern = {
  pattern_type: "high_frequency_task" as const,
  pattern_description: "signed Genesis boundary proof",
  frequency: 12,
  suggested_skill: "signed-genesis-boundary",
  confidence: 0.9,
};
const evidenceInput = {
  actor: "agent-genesis-boundary",
  groupId: "allura-genesis-boundary",
  approvalRef: APPROVAL,
  projectManifest: {
    name: "Genesis production boundary",
    sourcesOfTruth: [{ type: "local", id: "genesis-authority", name: "Genesis authority", required: true }],
    infrastructureTargets: [],
  },
  sourceOfTruthReads: [{ type: "local", id: "genesis-authority", timestamp: 1, summary: "verified authority read" }],
};
let priorSecret: string | undefined;

beforeEach(() => {
  priorSecret = process.env.RUVIX_CONTROL_PLANE_SECRET;
  process.env.RUVIX_CONTROL_PLANE_SECRET = SECRET;
  vi.mocked(resolveTarget).mockClear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (priorSecret === undefined) delete process.env.RUVIX_CONTROL_PLANE_SECRET;
  else process.env.RUVIX_CONTROL_PLANE_SECRET = priorSecret;
});

describe("Genesis signed evidence through generateProposal → syscall_mutate", () => {
  it("lets verified claims govern the real proposal boundary and ignores raw caller overrides", async () => {
    const policyEvidence = issueGenesisPolicyEvidence(evidenceInput);
    const hostileContext = {
      policyEvidence,
      actor: "raw-caller-actor",
      approvalRef: "00000000-0000-0000-0000-000000000000",
      policyContext: {
        projectManifest: { name: "hostile", sourcesOfTruth: [], infrastructureTargets: [] },
        sourceOfTruthReads: [],
      },
    } as unknown as GenesisProposalContext;

    await expect(generateProposal(evidenceInput.groupId, pattern, hostileContext))
      .resolves.toEqual({ recorded: true });
    expect(resolveTarget).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveTarget).mock.calls[0]![0]).toMatchObject({
      intent: "mutate",
      target: "pg:pattern_proposals",
      data: expect.objectContaining({ group_id: evidenceInput.groupId }),
    });
  });

  it("denies tampered signed evidence before mutation", async () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);
    const [payload, signature] = token.split(".");
    const tampered = `${payload}.${signature!.slice(0, -1)}${signature!.endsWith("a") ? "b" : "a"}`;

    const result = await generateProposal(evidenceInput.groupId, pattern, { policyEvidence: tampered });
    expect(result.recorded).toBe(false);
    expect(result.error).toMatch(/signature is invalid/);
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it("denies cross-tenant signed evidence before mutation", async () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);

    const result = await generateProposal("allura-genesis-other", pattern, { policyEvidence: token });
    expect(result.recorded).toBe(false);
    expect(result.error).toMatch(/group_id does not match/);
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it("denies expired signed evidence before mutation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const token = issueGenesisPolicyEvidence(evidenceInput);
    vi.setSystemTime(new Date("2026-08-31T12:06:00.000Z"));

    const result = await generateProposal(evidenceInput.groupId, pattern, { policyEvidence: token });
    expect(result.recorded).toBe(false);
    expect(result.error).toMatch(/has expired/);
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it("denies missing evidence at policy/approval gates before mutation", async () => {
    const result = await generateProposal(evidenceInput.groupId, pattern);
    expect(result.recorded).toBe(false);
    expect(resolveTarget).not.toHaveBeenCalled();
  });
});
