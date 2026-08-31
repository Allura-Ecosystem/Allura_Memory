import { beforeEach, describe, expect, it, vi } from "vitest";

const syscallMutate = vi.fn();

vi.mock("@/control-plane/syscalls", () => ({ syscall_mutate: (...args: unknown[]) => syscallMutate(...args) }));

import { generateProposal } from "./proposal-generator";

const pattern = {
  pattern_type: "high_frequency_task" as const,
  pattern_description: "proposal context test",
  frequency: 12,
  suggested_skill: "proposal-context-test",
  confidence: 0.7,
};

beforeEach(() => {
  syscallMutate.mockReset();
  syscallMutate.mockResolvedValue({ success: true });
});

describe("Genesis proposal governance context", () => {
  it("passes only opaque trusted evidence into syscall_mutate", async () => {
    await expect(generateProposal("allura-test", pattern, {
      policyEvidence: "server-issued-evidence",
    })).resolves.toEqual({ recorded: true });

    const [, context] = syscallMutate.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(context).toMatchObject({
      actor: "genesis-engine",
      group_id: "allura-test",
      genesis_policy_evidence: "server-issued-evidence",
    });
    expect(context).not.toHaveProperty("approval_ref");
    expect(context).not.toHaveProperty("policy_context");
  });

  it("returns the normal fail-closed syscall result when evidence is omitted", async () => {
    syscallMutate.mockResolvedValueOnce({ success: false, error: "POL-004: actor is not approved" });

    await expect(generateProposal("allura-test", pattern))
      .resolves.toEqual({ recorded: false, error: "POL-004: actor is not approved" });

    const [, context] = syscallMutate.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(context).toMatchObject({ actor: "genesis-engine", group_id: "allura-test", permission_tier: "plugin" });
    expect(context.genesis_policy_evidence).toBeUndefined();
    expect(context).not.toHaveProperty("policy_context");
  });
});
