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
  return { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 1, goal: 'Synthetic HTTP goal', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
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
  for (const value of [{ ...v, outcome: 'succeeded' }, { ...v, artifact: { ...v.artifact, passed: true } }, { ...v, definitionRevision: 2 }, { ...v, goal: '\0' }]) {
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

test('run HTTP start persists one immutable scoped admission receipt', async () => {
  const gateway = createCoreGateway(f.app, f.humanConfig, 'https://runs.invalid', new Uint8Array(32).fill(7), { identity: EMBEDDING, embed: async () => { throw new Error('Run admission must not embed'); } });
  const text = 'Synthetic run artifact\r\nCafe\u0301 🧠';
  const input = { operationKey: randomUUID(), definitionId: 'local-evidence-handoff', definitionRevision: 1, goal: 'Preserve synthetic evidence', reviewerPrincipalId: f.ids.reviewer, artifact: { text, expectedSha256: createHash('sha256').update(text).digest('hex'), sourceRevision: null } };
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
