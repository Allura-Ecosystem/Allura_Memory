import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { genesisMutationDigest, issueGenesisPolicyEvidence } from "@/control-plane/genesis-policy-evidence";
import { closePool } from "@/lib/postgres/connection";
import { generateProposal, type GenesisProposalContext } from "./proposal-generator";

const GROUP = "allura-genesis-live-boundary";
const OTHER_GROUP = "allura-genesis-live-other";
const SECRET = "genesis-live-boundary-control-plane-secret-32chars";
const APPROVAL = "6a64b1d2-8293-4c1e-9b6a-510b7b2d4f06";
const DESCRIPTION = `live signed Genesis persistence boundary ${randomUUID()}`;
const pattern = {
  pattern_type: "high_frequency_task" as const,
  pattern_description: DESCRIPTION,
  frequency: 12,
  suggested_skill: "signed-genesis-live-boundary",
  confidence: 0.9,
};
const evidenceInput = {
  actor: "agent-genesis-live-authority",
  groupId: GROUP,
  approvalRef: APPROVAL,
  target: "pg:pattern_proposals",
  mutationDigest: genesisMutationDigest("pg:pattern_proposals", { group_id: GROUP, pattern_description: DESCRIPTION, pattern_type: pattern.pattern_type, frequency: pattern.frequency, suggested_skill: pattern.suggested_skill, confidence: pattern.confidence, status: "proposed" }),
  projectManifest: {
    name: "Genesis live authority",
    sourcesOfTruth: [{ type: "local" as const, id: "genesis-live-source", name: "Genesis live source", required: true }],
    infrastructureTargets: [],
  },
  sourceOfTruthReads: [{ type: "local" as const, id: "genesis-live-source", timestamp: 1, summary: "verified live authority read" }],
};

function ownerPool(): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database: process.env.POSTGRES_DB ?? "memory",
    user: process.env.POSTGRES_USER ?? "allura",
    password: process.env.POSTGRES_PASSWORD ?? "",
  });
}

const describeLive = process.env.RUN_E2E_TESTS === "true" && process.env.POSTGRES_PASSWORD
  ? describe
  : describe.skip;

describeLive("Genesis generateProposal → syscall_mutate → live target persistence", () => {
  const owner = ownerPool();
  let previousSecret: string | undefined;

  beforeAll(async () => {
    previousSecret = process.env.RUVIX_CONTROL_PLANE_SECRET;
    process.env.RUVIX_CONTROL_PLANE_SECRET = SECRET;
    await owner.query(
      `INSERT INTO tenants(group_id,name,owner_agent_id)
       VALUES ($1,'Genesis live boundary','agent-genesis-live-authority')
       ON CONFLICT (group_id) DO UPDATE SET active=TRUE`,
      [GROUP],
    );

  });

  beforeEach(() => vi.useRealTimers());

  afterAll(async () => {
    vi.useRealTimers();
    await closePool();
    await owner.end();
    if (previousSecret === undefined) delete process.env.RUVIX_CONTROL_PLANE_SECRET;
    else process.env.RUVIX_CONTROL_PLANE_SECRET = previousSecret;
  });

  async function rows(): Promise<Array<Record<string, unknown>>> {
    return (await owner.query(
      `SELECT group_id,pattern_description,pattern_type,frequency,suggested_skill,confidence,status
       FROM pattern_proposals WHERE group_id=$1 AND pattern_description=$2 ORDER BY id`,
      [GROUP, DESCRIPTION],
    )).rows;
  }

  async function expectDeniedWithoutMutation(groupId: string, context?: GenesisProposalContext): Promise<string | undefined> {
    const before = await rows();
    const result = await generateProposal(groupId, pattern, context);
    expect(result.recorded).toBe(false);
    expect(await rows()).toEqual(before);
    return result.error;
  }

  it("persists exactly one proposal using signed actor, approval, manifest, and source reads despite hostile raw context", async () => {
    const policyEvidence = issueGenesisPolicyEvidence(evidenceInput);
    const hostile = {
      policyEvidence,
      actor: "hostile-raw-actor",
      approvalRef: "00000000-0000-0000-0000-000000000000",
      policyContext: {
        projectManifest: { name: "hostile", sourcesOfTruth: [], infrastructureTargets: [] },
        sourceOfTruthReads: [],
      },
    } as unknown as GenesisProposalContext;

    await expect(generateProposal(GROUP, pattern, hostile)).resolves.toEqual({ recorded: true });
    expect(await rows()).toEqual([{
      group_id: GROUP,
      pattern_description: DESCRIPTION,
      pattern_type: "high_frequency_task",
      frequency: 12,
      suggested_skill: "signed-genesis-live-boundary",
      confidence: 0.9,
      status: "proposed",
    }]);

    const replay = await generateProposal(GROUP, pattern, hostile);
    expect(replay.recorded).toBe(false);
    expect(replay.error).toMatch(/already been consumed|replay/i);
    expect(await rows()).toHaveLength(1);
  });

  it("rejects evidence bound to a different proposal mutation without writing", async () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);
    const changedPattern = { ...pattern, pattern_description: `${DESCRIPTION} mutation mismatch` };
    const before = await rows();
    const result = await generateProposal(GROUP, changedPattern, { policyEvidence: token });
    expect(result.recorded).toBe(false);
    expect(result.error).toMatch(/mutation digest|binding/i);
    expect(await rows()).toEqual(before);
  });

  it("tampered evidence causes no row mutation", async () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);
    const [payload, signature] = token.split(".");
    const bytes = Buffer.from(signature!, "base64url");
    bytes[Math.floor(bytes.length / 2)]! ^= 0x80;
    expect(await expectDeniedWithoutMutation(GROUP, { policyEvidence: `${payload}.${bytes.toString("base64url")}` }))
      .toMatch(/signature is invalid/);
  });

  it("expired evidence causes no row mutation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const token = issueGenesisPolicyEvidence(evidenceInput);
    vi.setSystemTime(new Date("2026-08-31T12:06:00.000Z"));
    expect(await expectDeniedWithoutMutation(GROUP, { policyEvidence: token })).toMatch(/has expired/);
  });

  it("missing evidence causes no row mutation", async () => {
    expect(await expectDeniedWithoutMutation(GROUP)).toMatch(/manifest|approval|actor/i);
  });

  it("cross-tenant evidence causes no row mutation", async () => {
    const token = issueGenesisPolicyEvidence(evidenceInput);
    expect(await expectDeniedWithoutMutation(OTHER_GROUP, { policyEvidence: token })).toMatch(/group_id does not match/);
  });
});
