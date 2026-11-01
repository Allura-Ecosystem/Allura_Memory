import { createHash } from 'node:crypto';

export class RunError extends Error {
  constructor(readonly code: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'unknown') { super(`run_${code}`); }
}
export type StartRunV1 = Readonly<{
  operationKey: string; definitionId: 'local-evidence-handoff'; definitionRevision: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  goal: string; reviewerPrincipalId: string;
  artifact: Readonly<{ text: string; expectedSha256: string; sourceRevision: string | null }>;
}>;
function check(value: unknown): asserts value { if (!value) { throw new RunError('invalid'); } }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && Buffer.byteLength(value) >= 1 && Buffer.byteLength(value) <= max && !value.includes('\0') && Buffer.from(value).toString('utf8') === value;
}
export function parseStartRun(value: unknown): StartRunV1 {
  const v = object(value, ['operationKey', 'definitionId', 'definitionRevision', 'goal', 'reviewerPrincipalId', 'artifact']);
  const a = object(v.artifact, ['text', 'expectedSha256', 'sourceRevision']);
  check(typeof v.operationKey === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v.operationKey));
  check(v.definitionId === 'local-evidence-handoff' && (v.definitionRevision === 1 || v.definitionRevision === 2 || v.definitionRevision === 3 || v.definitionRevision === 4 || v.definitionRevision === 5 || v.definitionRevision === 6 || v.definitionRevision === 7 || v.definitionRevision === 8 || v.definitionRevision === 9));
  check(text(v.goal, 1000) && !!v.goal.trim() && text(a.text, 16384));
  check(typeof v.reviewerPrincipalId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.reviewerPrincipalId));
  check(typeof a.expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(a.expectedSha256));
  check(a.sourceRevision === null || (typeof a.sourceRevision === 'string' && /^[a-f0-9]{40}$/.test(a.sourceRevision)));
  return Object.freeze({ operationKey: v.operationKey, definitionId: v.definitionId, definitionRevision: v.definitionRevision, goal: v.goal, reviewerPrincipalId: v.reviewerPrincipalId, artifact: Object.freeze({ text: a.text, expectedSha256: a.expectedSha256, sourceRevision: a.sourceRevision }) });
}
export type RunCommandV1 = Readonly<{ runId: string; expectedRevision: number; operationKey: string }>;
export function parseRunCommand(value: unknown): RunCommandV1 {
  const v = object(value, ['runId', 'expectedRevision', 'operationKey']);
  check(typeof v.runId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.runId));
  check(typeof v.expectedRevision === 'number' && Number.isInteger(v.expectedRevision) && v.expectedRevision > 0 && v.expectedRevision <= 2147483647);
  check(typeof v.operationKey === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v.operationKey));
  return Object.freeze({ runId: v.runId, expectedRevision: v.expectedRevision, operationKey: v.operationKey });
}
export type RunDecisionV1 = Readonly<RunCommandV1 & { approvalRequestId: string; reviewedEvidenceDigest: string; decision: 'approve' | 'reject'; rationale: string }>;
export function parseRunDecision(value: unknown): RunDecisionV1 {
  const v = object(value, ['runId', 'expectedRevision', 'operationKey', 'approvalRequestId', 'reviewedEvidenceDigest', 'decision', 'rationale']);
  const command = parseRunCommand({ runId: v.runId, expectedRevision: v.expectedRevision, operationKey: v.operationKey });
  check(typeof v.approvalRequestId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v.approvalRequestId));
  check(typeof v.reviewedEvidenceDigest === 'string' && /^[a-f0-9]{64}$/.test(v.reviewedEvidenceDigest));
  check(v.decision === 'approve' || v.decision === 'reject');
  check(text(v.rationale, 1000) && !!v.rationale.trim());
  return Object.freeze({ ...command, approvalRequestId: v.approvalRequestId, reviewedEvidenceDigest: v.reviewedEvidenceDigest, decision: v.decision, rationale: v.rationale });
}
type RunStepId = 'prepare' | 'review' | 'handoff';
type RunPhase = 'ready' | 'running' | 'paused_approval' | 'blocked' | 'terminal';
type DefinitionRef = { id: string; revision: number; digest: string };
export type RunMeasurement = { artifactSha256: string; artifactBytes: number; expectedSha256: string; measuredGates: { id: 'artifact_nonempty' | 'artifact_digest_match'; passed: boolean }[] };
export type RunInspection = {
  record: { version: string; groupId: string; workspaceId: string; runId: string; definition: DefinitionRef; policyDigest: string; inputDigest: string; ownerPrincipalId: string; reviewerPrincipalId: string; goal: string; createdAt: string; expiresAt: string; journalRef: { runId: string } };
  definition: Awaited<ReturnType<typeof runDefinition>>; policy: Awaited<ReturnType<typeof runDefinition>>['policy']; handlerBundleDigest: string;
  runtime: { version: string; runId: string; revision: number; phase: RunPhase; outcome: 'succeeded' | 'failed' | 'partial' | null; reason: string; nextStepId: RunStepId | null; checkpointSeq: number; cancelRequested: boolean; updatedAt: string };
  steps: { stepId: RunStepId; state: 'pending' | 'leased' | 'waiting_approval' | 'completed' | 'failed' | 'blocked'; attempts: number; fence: number; dueAt: string | null; leaseUntil: string | null; effectReceiptId: string | null }[];
  operations: { id: string; runId: string; actorPrincipalId: string; command: string; operationKey: string; requestDigest: string; acceptedRevision: number; journalSeq: number; acceptedAt: string }[];
  effects: { version: string; id: string; runId: string; stepId: string; effectSlot: string; definitionDigest: string; inputDigest: string; actorPrincipalId: string; attempt: number; fence: number; preparedReceiptId: string | null; approvalRequestId: string | null; approvalDecisionId: string | null; artifactSha256: string; artifactBytes: number; measuredGates: RunMeasurement['measuredGates']; journalSeq: number; committedAt: string }[];
  approval: { id: string; runId: string; stepId: string; definition: DefinitionRef; inputDigest: string; preparedReceiptId: string; evidenceDigest: string; requestedAtRevision: number; reviewerPrincipalId: string; createdAt: string; expiresAt: string } | null;
  decision: { id: string; requestId: string; runId: string; reviewerPrincipalId: string; reviewedEvidenceDigest: string; decision: 'approve' | 'reject'; rationale: string; journalSeq: number; createdAt: string } | null;
  journal: { runId: string; seq: number; eventId: string; actorPrincipalId: string; stepId: string | null; kind: string; reason: string; receiptId: string; effectReceiptId: string | null; approvalRequestId: string | null; approvalDecisionId: string | null; attempt: number | null; fence: number | null; measurement: RunMeasurement | null; createdAt: string }[];
  hasMore: boolean; afterSeq: number; observedAt: string; doctor: string[]; completionVerified: boolean; installedDefinitionAvailable: boolean;
};
export type RunInspectionSelector = Readonly<{ runId: string; afterSeq: number; limit: number }>;
export function parseRunInspection(query: URLSearchParams): RunInspectionSelector {
  const allowed = ['group_id', 'workspace_id', 'run_id', 'after_seq', 'limit'];
  check([...query.keys()].every(key => allowed.includes(key) && query.getAll(key).length === 1));
  check(['group_id', 'workspace_id', 'run_id'].every(key => query.getAll(key).length === 1));
  const runId = query.get('run_id')!;
  check(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(runId));
  const after = query.get('after_seq') ?? '0', size = query.get('limit') ?? '20';
  check(/^[0-9]+$/.test(after) && /^[0-9]+$/.test(size));
  const afterSeq = Number(after), limit = Number(size);
  check(Number.isSafeInteger(afterSeq) && afterSeq >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 100);
  return Object.freeze({ runId, afterSeq, limit });
}

// Pin actual coordination, API, executor AND SQL bytes; no caller registry.
export async function runDefinition() {
  const hash = createHash('sha256');
  for (const file of ['run-contract.ts', 'runs.ts', 'runs-api.ts', 'gateway.ts', 'run-execution.ts', '../migrations/025-durable-runs.sql', '../migrations/026-run-prepare.sql', '../migrations/027-run-decision.sql', '../migrations/028-run-resume.sql', '../migrations/029-run-cancel.sql', '../migrations/030-run-inspection.sql', '../migrations/031-run-prepare-expiry.sql', '../migrations/033-work-plane-http-run8.sql', '../migrations/035-work-plane-create.sql']) {
    const bytes = await Bun.file(new URL(file, import.meta.url)).arrayBuffer();
    hash.update(`${file}\0${bytes.byteLength}\0`).update(new Uint8Array(bytes));
  }
  return {
    version: 'run-definition-v1', id: 'local-evidence-handoff', revision: 9,
    engineContract: 'run-engine-v1', handlerBundleDigest: hash.digest('hex'),
    policy: { version: 'run-policy-v1', allowedHandlers: ['local-artifact-check-v1', 'local-handoff-receipt-v1'], approvalStep: 'review', independentReviewer: true, gates: ['artifact_nonempty', 'artifact_digest_match'], maxAttemptsPerEffect: 3, leaseMs: 10000, stepDeadlineMs: 2000, maxArtifactBytes: 16384, maxJournalRows: 128, maxRunAgeMs: 86400000, approvalTtlMs: 86400000 },
    steps: [{ id: 'prepare', kind: 'local', handler: 'local-artifact-check-v1' }, { id: 'review', kind: 'approval', dependsOn: 'prepare' }, { id: 'handoff', kind: 'local', handler: 'local-handoff-receipt-v1', dependsOn: 'review' }],
  };
}
