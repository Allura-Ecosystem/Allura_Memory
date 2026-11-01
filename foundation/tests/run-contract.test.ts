import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { parseStartRun, parseRunCommand, parseRunDecision, runDefinition } from '../src/run-contract.ts';
const base = () => ({ operationKey: 'start:fixture.1', definitionId: 'local-evidence-handoff' as const, definitionRevision: 7 as const, goal: ' Exact goal ', reviewerPrincipalId: '11111111-1111-4111-8111-111111111111', artifact: { text: 'Synthetic\r\nCafe\u0301 🧠', expectedSha256: 'a'.repeat(64), sourceRevision: null as string | null } });

test('run revision seven admission preserves historical parser revisions', () => {
  for (const definitionRevision of [1,2,3,4,5,6,7]) { expect<number>(parseStartRun({ ...base(), definitionRevision }).definitionRevision).toBe(definitionRevision); }
});

test('run contract rejects authority policy and executable input overrides', () => {
  const v = base();
  expect(parseStartRun({ ...v, definitionRevision: 1 }).definitionRevision).toBe(1);
  expect(parseStartRun({ ...v, definitionRevision: 4 }).definitionRevision).toBe(4);
  expect(parseStartRun({ ...v, definitionRevision: 5 }).definitionRevision).toBe(5);
  expect(parseStartRun({ ...v, definitionRevision: 3 }).definitionRevision).toBe(3);
  const command = { runId: v.reviewerPrincipalId, operationKey: 'advance:one', expectedRevision: 1 };
  expect(parseRunCommand(command)).toEqual(command);
  expect(parseStartRun({ ...v, definitionRevision: 2 }).definitionRevision).toBe(2);
  const decision = { ...command, approvalRequestId: v.reviewerPrincipalId, reviewedEvidenceDigest: 'a'.repeat(64), decision: 'approve' as const, rationale: ' Exact UTF8 🧠\r\n' };
  expect(parseRunDecision(decision)).toEqual(decision); expect(Object.isFrozen(parseRunDecision(decision))).toBe(true);
  for (const key of Object.keys(decision)) { const missing: Record<string,unknown> = { ...decision }; delete missing[key]; expect(() => parseRunDecision(missing)).toThrow('run_invalid'); }
  for (const value of [null, [], {}, { ...decision, actor: 'forged' }, { ...decision, decision: 'succeeded' }, { ...decision, rationale: '\ud800' }, { ...decision, rationale: '\0' }, { ...decision, rationale: ' ' }, { ...decision, rationale: '🧠'.repeat(251) }, { ...decision, approvalRequestId: 'bad' }, { ...decision, reviewedEvidenceDigest: 'A'.repeat(64) }]) { expect(() => parseRunDecision(value)).toThrow('run_invalid'); }
  expect(parseRunDecision({ ...decision, rationale: '🧠'.repeat(250), decision: 'reject' }).rationale).toBe('🧠'.repeat(250));
  expect(Object.isFrozen(parseRunCommand(command))).toBe(true);
  for (const value of [null, [], {}, { ...command, outcome: 'succeeded' }, { ...command, fence: 1 }, { ...command, expectedRevision: NaN }, { ...command, expectedRevision: Infinity }, { ...command, expectedRevision: 1.1 }, { ...command, expectedRevision: 0 }, { ...command, expectedRevision: 2147483648 }, { ...command, expectedRevision: '1' }, { ...command, runId: 'bad' }, { ...command, operationKey: 'x\n' }]) { expect(() => parseRunCommand(value)).toThrow('run_invalid'); }
  for (const value of [null, [], 1, true, 'run', {}, { ...v, actorPrincipalId: v.reviewerPrincipalId }, { ...v, groupId: 'allura-other' }, { ...v, workspaceId: v.reviewerPrincipalId }, { ...v, policy: {} }, { ...v, handler: 'shell' }, { ...v, outcome: 'succeeded' }, { ...v, passed: true }, { ...v, definitionId: 'other' }, { ...v, definitionRevision: '1' }, { ...v, definitionRevision: 8 }, { ...v, definitionRevision: null }, { ...v, artifact: null }, { ...v, artifact: [] }, { ...v, artifact: { ...v.artifact, passed: true } }, { ...v, artifact: { ...v.artifact, sourceRevision: undefined } }, { ...v, reviewerPrincipalId: 'other' }, { ...v, reviewerPrincipalId: null }]) {
    expect(() => parseStartRun(value)).toThrow('run_invalid');
  }
  for (const key of Object.keys(v)) { const missing: Record<string, unknown> = { ...v }; delete missing[key]; expect(() => parseStartRun(missing)).toThrow('run_invalid'); }
});

test('run start input preserves exact bounded UTF8 bytes and immutable copies', () => {
  const v = base(), parsed = parseStartRun(v);
  expect(parsed).toEqual(v); expect(parsed).not.toBe(v); expect(parsed.artifact).not.toBe(v.artifact);
  expect(Object.isFrozen(parsed)).toBe(true); expect(Object.isFrozen(parsed.artifact)).toBe(true);
  v.goal = 'changed'; v.artifact.text = 'changed';
  expect(parsed.goal).toBe(' Exact goal '); expect(parsed.artifact.text).toBe('Synthetic\r\nCafe\u0301 🧠');
  expect(parseStartRun({ ...base(), artifact: { ...base().artifact, text: ' ' } }).artifact.text).toBe(' ');
  for (const goal of ['', ' ', '🧠'.repeat(251), '\ud800', 'bad\0goal']) { expect(() => parseStartRun({ ...base(), goal })).toThrow('run_invalid'); }
  for (const text of ['', '🧠'.repeat(4097), '\udfff', 'bad\0text']) { expect(() => parseStartRun({ ...base(), artifact: { ...base().artifact, text } })).toThrow('run_invalid'); }
  expect(parseStartRun({ ...base(), goal: '🧠'.repeat(250) }).goal).toBe('🧠'.repeat(250));
  expect(parseStartRun({ ...base(), artifact: { ...base().artifact, text: '🧠'.repeat(4096) } }).artifact.text).toBe('🧠'.repeat(4096));
  for (const operationKey of ['', 'x'.repeat(129), 'x\n', 'a/b', 1]) { expect(() => parseStartRun({ ...base(), operationKey })).toThrow('run_invalid'); }
  for (const expectedSha256 of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(64) + '\n', null]) { expect(() => parseStartRun({ ...base(), artifact: { ...base().artifact, expectedSha256 } })).toThrow('run_invalid'); }
  for (const sourceRevision of ['', 'A'.repeat(40), 'a'.repeat(39), true]) { expect(() => parseStartRun({ ...base(), artifact: { ...base().artifact, sourceRevision } })).toThrow('run_invalid'); }
  expect(parseStartRun({ ...base(), artifact: { ...base().artifact, sourceRevision: 'a'.repeat(40) } }).artifact.sourceRevision).toBe('a'.repeat(40));
});

test('run start definition pins owned source and fixed data only policy', async () => {
  const definition = await runDefinition(), hash = createHash('sha256');
  for (const name of ['run-contract.ts', 'runs.ts', 'runs-api.ts', 'gateway.ts', 'run-execution.ts', '../migrations/025-durable-runs.sql', '../migrations/026-run-prepare.sql', '../migrations/027-run-decision.sql', '../migrations/028-run-resume.sql', '../migrations/029-run-cancel.sql', '../migrations/030-run-inspection.sql', '../migrations/031-run-prepare-expiry.sql']) { const bytes = new Uint8Array(await Bun.file(new URL('../src/' + name, import.meta.url)).arrayBuffer()); hash.update(`${name}\0${bytes.length}\0`).update(bytes); }
  expect(definition.handlerBundleDigest).toBe(hash.digest('hex'));
  expect(definition.id).toBe('local-evidence-handoff'); expect(definition.revision).toBe(7);
  expect(definition.steps.map(s => s.id)).toEqual(['prepare', 'review', 'handoff']);
  expect(definition.policy.allowedHandlers).toEqual(['local-artifact-check-v1', 'local-handoff-receipt-v1']);
  expect(definition.policy.independentReviewer).toBe(true);
  expect(definition.policy.maxArtifactBytes).toBe(16384);
  expect(definition.policy.maxAttemptsPerEffect).toBe(3);
  expect(definition.policy.maxJournalRows).toBe(128);
  expect(await runDefinition()).toEqual(definition);
});
