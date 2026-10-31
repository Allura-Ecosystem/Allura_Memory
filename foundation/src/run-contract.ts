import { createHash } from 'node:crypto';

export class RunError extends Error {
  constructor(readonly code: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'unknown') { super(`run_${code}`); }
}
export type StartRunV1 = Readonly<{
  operationKey: string; definitionId: 'local-evidence-handoff'; definitionRevision: 1 | 2;
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
  check(v.definitionId === 'local-evidence-handoff' && (v.definitionRevision === 1 || v.definitionRevision === 2));
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
// Pin actual coordination AND SQL measurement bytes; no caller-owned executor.
export async function runDefinition() {
  const hash = createHash('sha256');
  for (const file of ['run-contract.ts', 'runs.ts', 'run-execution.ts', '../migrations/026-run-prepare.sql']) {
    const bytes = await Bun.file(new URL(file, import.meta.url)).arrayBuffer();
    hash.update(`${file}\0${bytes.byteLength}\0`).update(new Uint8Array(bytes));
  }
  return {
    version: 'run-definition-v1', id: 'local-evidence-handoff', revision: 2,
    engineContract: 'run-engine-v1', handlerBundleDigest: hash.digest('hex'),
    policy: { version: 'run-policy-v1', allowedHandlers: ['local-artifact-check-v1', 'local-handoff-receipt-v1'], approvalStep: 'review', independentReviewer: true, gates: ['artifact_nonempty', 'artifact_digest_match'], maxAttemptsPerEffect: 3, leaseMs: 10000, stepDeadlineMs: 2000, maxArtifactBytes: 16384, maxJournalRows: 128, maxRunAgeMs: 86400000, approvalTtlMs: 86400000 },
    steps: [{ id: 'prepare', kind: 'local', handler: 'local-artifact-check-v1' }, { id: 'review', kind: 'approval', dependsOn: 'prepare' }, { id: 'handoff', kind: 'local', handler: 'local-handoff-receipt-v1', dependsOn: 'review' }],
  };
}
