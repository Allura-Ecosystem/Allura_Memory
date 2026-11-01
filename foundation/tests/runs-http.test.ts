import { test, expect, beforeAll, afterAll } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { fixture } from './lifecycle-fixture.ts';
import { createCoreGateway } from '../src/core-api.ts';
import { EMBEDDING } from '../src/embedding.ts';

let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  f = await fixture(`allura-runs-http-${randomUUID()}`);
  await f.owner`UPDATE allura.workspace_grants SET role='workspace_admin' WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND principal_id=${f.ids.reviewer}::uuid`;
});
afterAll(async () => { await f?.close(); });
function requestInput() {
  const text = 'Synthetic HTTP artifact';
  return { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 3, goal: 'Synthetic HTTP goal', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
}
const provider = { identity: EMBEDDING, embed: async (): Promise<number[]> => { throw new Error('Run admission must not embed'); } };
function gatewayFor(origin: string) { return createCoreGateway(f.app, f.humanConfig, origin, new Uint8Array(32).fill(7), provider); }
function requestFor(origin: string, body: unknown, headers: Record<string, string> = {}, query = `group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`) {
  return new Request(`${origin}/api/runs/start?${query}`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': f.jwt('author'), Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('run HTTP authenticates before body and preserves mixed identity CSRF denial', async () => {
  const origin = 'https://runs.invalid', gateway = gatewayFor(origin), v = requestInput();
  const before = (await f.owner`SELECT count(*)::int AS n FROM allura.run_records WHERE group_id=${f.scope.groupId}`)[0].n;
  for (const [headers, status] of [
    [{ 'Cf-Access-Jwt-Assertion': '' }, 401], [{ 'Cf-Access-Jwt-Assertion': 'forged' }, 401],
    [{ Authorization: 'Bearer synthetic-invalid' }, 401], [{ Cookie: `CF_Authorization=${f.jwt('author')}`, Authorization: 'Bearer synthetic-invalid' }, 401],
    [{ Origin: 'https://foreign.invalid' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ 'Cf-Access-Jwt-Assertion': f.jwt('viewer') }, 403], [{ 'Cf-Access-Jwt-Assertion': f.jwt('org') }, 403],
  ] as [Record<string, string>, number][]) {
    const request = requestFor(origin, { ...v, artifact: { text: 'PRIVATE secret fixture'.repeat(10000) } }, headers);
    const reply = await gateway(request);
    expect(reply.status).toBe(status); expect(request.bodyUsed).toBe(false);
    expect(await reply.text()).not.toContain('PRIVATE');
  }
  const machineOnly = createCoreGateway(f.app, undefined, origin, new Uint8Array(32).fill(7), provider, undefined, undefined, 'machine-only');
  expect((await machineOnly(requestFor(origin, v))).status).toBe(404);
  const abort = new AbortController(); abort.abort();
  const request = new Request(requestFor(origin, v), { signal: abort.signal });
  expect((await gateway(request)).status).toBe(504); expect(request.bodyUsed).toBe(false);
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.run_records WHERE group_id=${f.scope.groupId}`)[0].n).toBe(before);
});

test('run HTTP strict selectors and input reject overrides without disclosure', async () => {
  const origin = 'https://runs.invalid', gateway = gatewayFor(origin), v = requestInput();
  const before = (await f.owner`SELECT count(*)::int AS n FROM allura.run_records WHERE group_id=${f.scope.groupId}`)[0].n;
  for (const query of [`group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}&actor=forged`, `group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}&group_id=${f.scope.groupId}`, `group_id=${f.scope.groupId}`, `group_id=${f.scope.groupId}&workspace_id=wrong`]) {
    expect((await gateway(requestFor(origin, v, {}, query))).status).toBe(400);
  }
  for (const value of [{ ...v, outcome: 'succeeded' }, { ...v, artifact: { ...v.artifact, passed: true } }, { ...v, definitionRevision: 4 }, { ...v, goal: '\0' }]) {
    const reply = await gateway(requestFor(origin, value)); expect(reply.status).toBe(400); expect(await reply.json()).toEqual({ outcome: 'invalid' });
  }
  const missing = await gateway(requestFor(origin, { ...v, reviewerPrincipalId: randomUUID() }));
  const self = await gateway(requestFor(origin, { ...v, reviewerPrincipalId: f.ids.author }));
  expect(missing.status).toBe(403); expect(self.status).toBe(403); expect(await missing.text()).toBe(await self.text());
  expect((await f.owner`SELECT count(*)::int AS n FROM allura.run_records WHERE group_id=${f.scope.groupId}`)[0].n).toBe(before);
});

test('run lost committed HTTP start response reconciles the original admission', async () => {
  const v = requestInput();
  const gateway = gatewayFor('https://runs.invalid');
  const first = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: async request => { const reply = await gateway(request); expect(reply.status).toBe(200); first.stop(true); return reply; } });
  try { await expect(fetch(requestFor(first.url.origin, v, { Origin: 'https://runs.invalid' }))).rejects.toThrow(); }
  finally { first.stop(true); }
  const stored = await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${v.operationKey}`;
  expect(stored).toHaveLength(1);
  const retryGateway = gatewayFor('https://runs.invalid');
  const retry = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => retryGateway(request) });
  try { const reply = await fetch(requestFor(retry.url.origin, v, { Origin: 'https://runs.invalid' })); expect(reply.status).toBe(200); expect(await reply.json()).toEqual(JSON.parse(stored[0].receipt_text)); }
  finally { retry.stop(true); }
  expect(await f.owner`SELECT id FROM allura.run_operation_receipts WHERE group_id=${f.scope.groupId} AND operation_key=${v.operationKey}`).toHaveLength(1);
});

test('run lost committed preparation response reconciles without another effect', async () => {
  const origin = 'https://runs.invalid', gateway = gatewayFor(origin), input = requestInput();
  const admitted = await (await gateway(requestFor(origin, input))).json() as { runId: string };
  const command = { runId: admitted.runId, expectedRevision: 1, operationKey: randomUUID() };
  const request = (origin: string) => { const req = requestFor(origin, command, { Origin: 'https://runs.invalid' }); return new Request(req.url.replace('/start?', '/advance?'), req); };
  const first = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: async req => { const reply = await gateway(req); expect(reply.status).toBe(200); first.stop(true); return reply; } });
  try { await expect(fetch(request(first.url.origin))).rejects.toThrow(); } finally { first.stop(true); }
  const [original] = await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE run_id=${command.runId}::uuid AND command='advance'`;
  const effects = await f.owner`SELECT receipt_text FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`;
  expect(effects).toHaveLength(1);
  const retry = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: req => gateway(req) });
  try { const response = await fetch(request(retry.url.origin)); expect(response.status).toBe(200); expect(await response.json()).toEqual(JSON.parse(original.receipt_text)); } finally { retry.stop(true); }
  expect(await f.owner`SELECT receipt_text FROM allura.run_effect_receipts WHERE run_id=${command.runId}::uuid`).toEqual(effects);
  expect((await f.owner`SELECT attempts FROM allura.run_steps WHERE run_id=${command.runId}::uuid AND step_id='prepare'`)[0].attempts).toBe(1);
  for (const path of ['resume','handoff','cancel']) { const req = request(origin); expect((await gateway(new Request(req.url.replace('/advance?', `/${path}?`), req))).status).toBe(404); }
});

test('run prepare persists measured artifact evidence and pauses for independent approval', async () => {
  const origin = 'https://runs.invalid', gateway = gatewayFor(origin), input = requestInput();
  input.artifact.text = 'Claimed tests passed — unverified\r\nCafe\u0301 🧠';
  input.artifact.expectedSha256 = createHash('sha256').update(Buffer.from(input.artifact.text, 'utf8')).digest('hex');
  const start = await gateway(requestFor(origin, input));
  expect(start.status).toBe(200);
  const admitted = await start.json() as { runId: string; acceptedRevision: number };
  const command = { runId: admitted.runId, expectedRevision: admitted.acceptedRevision, operationKey: randomUUID() };
  const advanceRequest = requestFor(origin, command);
  const response = await gateway(new Request(advanceRequest.url.replace('/api/runs/start?', '/api/runs/advance?'), advanceRequest));
  // This assertion must fail on the missing production route, not absent SQL.
  expect(response.status).toBe(200);
  const receipt = await response.json() as { command: string; runId: string; phaseAtAcceptance: string };
  expect(receipt.command).toBe('advance'); expect(receipt.runId).toBe(admitted.runId);
  expect(receipt.phaseAtAcceptance).toBe('running');
  const [state] = await f.owner`SELECT phase,outcome,reason,next_step_id,checkpoint_seq FROM allura.run_state WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${admitted.runId}::uuid`;
  expect(state.phase).toBe('paused_approval'); expect(state.outcome).toBeNull();
  expect(state.reason).toBe('approval_required'); expect(state.next_step_id).toBe('review');
  const effects = await f.owner`SELECT receipt_text FROM allura.run_effect_receipts WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${admitted.runId}::uuid`;
  expect(effects).toHaveLength(1);
  const effect = JSON.parse(effects[0].receipt_text);
  expect(effect.stepId).toBe('prepare'); expect(effect.artifactSha256).toBe(input.artifact.expectedSha256);
  expect(effect.artifactBytes).toBe(Buffer.byteLength(input.artifact.text, 'utf8'));
  expect(effect.measuredGates).toEqual([{ id: 'artifact_nonempty', passed: true }, { id: 'artifact_digest_match', passed: true }]);
  expect(effect.approvalDecisionId).toBeNull(); expect(effect.preparedReceiptId).toBeNull();
  const approvals = await f.owner`SELECT id FROM allura.run_approval_requests WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${admitted.runId}::uuid`;
  expect(approvals).toHaveLength(1);
  const journal = await f.owner`SELECT kind,seq FROM allura.run_journal WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${admitted.runId}::uuid ORDER BY seq`;
  expect(journal.map((row: { kind: string }) => row.kind)).toEqual(['started', 'claimed', 'effect_committed', 'approval_requested']);
  expect(state.checkpoint_seq).toBe(journal.at(-1)!.seq);
  const [handoff] = await f.owner`SELECT state,attempts FROM allura.run_steps WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${admitted.runId}::uuid AND step_id='handoff'`;
  expect(handoff.state).toBe('pending'); expect(handoff.attempts).toBe(0);
});

test('run exact approval replay never authorizes changed expired or rejected evidence', async () => {
  const origin = 'https://runs.invalid', gateway = gatewayFor(origin);
  const start = await gateway(requestFor(origin, requestInput())); expect(start.status).toBe(200);
  const admitted = await start.json() as { runId: string };
  const advance = requestFor(origin, { runId: admitted.runId, expectedRevision: 1, operationKey: randomUUID() });
  expect((await gateway(new Request(advance.url.replace('/start?', '/advance?'), advance))).status).toBe(200);
  const [approval] = await f.owner`SELECT request_text FROM allura.run_approval_requests WHERE run_id=${admitted.runId}::uuid`;
  const a = JSON.parse(approval.request_text);
  const command = { runId: admitted.runId, expectedRevision: a.requestedAtRevision, operationKey: randomUUID(), approvalRequestId: a.id, reviewedEvidenceDigest: a.evidenceDigest, decision: 'reject', rationale: 'Exact synthetic review' };
  const send = (value: unknown) => { const req = requestFor(origin, value, { 'Cf-Access-Jwt-Assertion': f.jwt('reviewer') }); return gateway(new Request(req.url.replace('/start?', '/decide?'), req)); };
  const response = await send(command);
  // First RED must be the real missing route, before querying decision storage.
  expect(response.status).toBe(200);
  const receipt = await response.json();
  expect(await (await send(command)).json()).toEqual(receipt);
  for (const changed of [{ ...command, decision: 'approve' }, { ...command, rationale: command.rationale + ' ' }, { ...command, reviewedEvidenceDigest: 'a'.repeat(64) }, { ...command, operationKey: randomUUID(), decision: 'approve' }]) { expect((await send(changed)).status).toBe(409); }
  expect((await f.owner`SELECT phase,outcome,reason,next_step_id FROM allura.run_state WHERE run_id=${admitted.runId}::uuid`)[0]).toEqual({ phase: 'terminal', outcome: 'partial', reason: 'approval_rejected', next_step_id: null });
  expect(await f.owner`SELECT id FROM allura.run_approval_decisions WHERE run_id=${admitted.runId}::uuid`).toHaveLength(1);
  expect(await f.owner`SELECT id FROM allura.run_effect_receipts WHERE run_id=${admitted.runId}::uuid`).toHaveLength(1);
});

test('run HTTP start persists one immutable scoped admission receipt', async () => {
  const gateway = createCoreGateway(f.app, f.humanConfig, 'https://runs.invalid', new Uint8Array(32).fill(7), { identity: EMBEDDING, embed: async () => { throw new Error('Run admission must not embed'); } });
  const text = 'Synthetic run artifact\r\nCafe\u0301 🧠';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 3, goal: 'Preserve synthetic evidence', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
  const response = await gateway(new Request(`https://runs.invalid/api/runs/start?group_id=${f.scope.groupId}&workspace_id=${f.scope.workspaceId}`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': f.jwt('author'), Origin: 'https://runs.invalid', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
  expect(response.status).toBe(200);
  const receipt = await response.json() as { version: string; command: string; actorPrincipalId: string; operationKey: string; phaseAtAcceptance: string; acceptedRevision: number; journalSeq: number; runId: string };
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(receipt.version).toBe('run-operation-v1');
  expect(receipt.command).toBe('start');
  expect(receipt.actorPrincipalId).toBe(f.ids.author);
  expect(receipt.operationKey).toBe(input.operationKey);
  expect(receipt.phaseAtAcceptance).toBe('ready');
  expect(receipt.acceptedRevision).toBe(1);
  expect(receipt.journalSeq).toBe(1);
  const rows = await f.owner`SELECT receipt_text FROM allura.run_operation_receipts WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${receipt.runId}::uuid`;
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].receipt_text)).toEqual(receipt);
  const records = await f.owner`SELECT owner_id,reviewer_id,goal,input FROM allura.run_records WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND id=${receipt.runId}::uuid`;
  expect(records).toHaveLength(1);
  expect(records[0].owner_id).toBe(f.ids.author);
  expect(records[0].reviewer_id).toBe(f.ids.reviewer);
  expect(records[0].goal).toBe(input.goal);
  expect(records[0].input.artifact).toEqual(input.artifact);
  const [state] = await f.owner`SELECT phase,outcome,reason,next_step_id,revision,checkpoint_seq,cancel_requested FROM allura.run_state WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${receipt.runId}::uuid`;
  expect(state).toEqual({ phase: 'ready', outcome: null, reason: 'none', next_step_id: 'prepare', revision: 1, checkpoint_seq: 1, cancel_requested: false });
  const steps = await f.owner`SELECT step_id,state,attempts,fence FROM allura.run_steps WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${receipt.runId}::uuid ORDER BY step_id`;
  expect([...steps]).toEqual(['handoff', 'prepare', 'review'].map(step_id => ({ step_id, state: 'pending', attempts: 0, fence: 0 })));
  const journal = await f.owner`SELECT kind,seq FROM allura.run_journal WHERE group_id=${f.scope.groupId} AND workspace_id=${f.scope.workspaceId}::uuid AND run_id=${receipt.runId}::uuid`;
  expect(journal).toHaveLength(1);
  expect(journal[0].kind).toBe('started');
  expect(journal[0].seq).toBe(1);
  await expect(f.owner`UPDATE allura.run_operation_receipts SET receipt_text='{}' WHERE run_id=${receipt.runId}::uuid`.execute()).rejects.toThrow('append-only');
});
