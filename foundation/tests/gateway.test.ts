import { test, expect } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createGateway } from '../src/gateway.ts';
import type { AuthorityRecord, AuthorityStore } from '../src/authority.ts';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { issuer: 'https://fixture.cloudflareaccess.com', audience: 'fixture', keys: new Map([['key', publicKey]]) };
const now = Math.floor(Date.now() / 1000);
const data = [{ alg: 'RS256', kid: 'key' }, { iss: config.issuer, aud: 'fixture', sub: 'human', email: 'human@example.invalid', type: 'app', iat: now, exp: now + 600 }].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
const jwt = `${data}.${sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;
const origin = 'https://app.example.invalid';
const scope = { groupId: 'allura-test', workspaceId: '11111111-1111-4111-8111-111111111111' };
const row: AuthorityRecord = { ...scope, principalId: '22222222-2222-4222-8222-222222222222', kind: 'human', role: 'workspace_admin', principalActive: true, tenantActive: true, membershipActive: true, workspaceLocked: false, grantActive: true, reviewApprove: false };
const query = `?group_id=${scope.groupId}&workspace_id=${scope.workspaceId}`;
const store: AuthorityStore = { resolve: async () => row };
const headers = { 'Cf-Access-Jwt-Assertion': jwt, Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' };

test('gateway authenticates before body and never trusts forged headers', async () => {
  let calls = 0;
  const gateway = createGateway({ human: config, origin, store, machineLookup: async () => null, routes: [{ path: '/mutate', method: 'POST', identity: 'human', action: 'memory:capture', handle: async () => { calls++; return {}; } }] });
  const request = new Request(`${origin}/mutate${query}`, { method: 'POST', body: '{"private":"body"}', headers: { 'x-allura-user-id': row.principalId, 'x-allura-role': 'admin' } });
  expect((await gateway(request)).status).toBe(401);
  expect(request.bodyUsed).toBe(false); expect(calls).toBe(0);
  expect((await gateway(new Request(`${origin}/health/live`))).status).toBe(200);
  expect((await gateway(new Request(`${origin}/missing`))).status).toBe(404);
});

test('gateway bounds streamed body rejects malformed JSON and cross-site', async () => {
  let calls = 0;
  const gateway = createGateway({ human: config, origin, store, machineLookup: async () => null, limits: { bodyBytes: 32 }, routes: [{ path: '/mutate', method: 'POST', identity: 'human', action: 'memory:capture', handle: async () => { calls++; return { ok: true }; } }] });
  for (const body of ['x'.repeat(33), '{', 'null', '[]']) {
    const response = await gateway(new Request(`${origin}/mutate${query}`, { method: 'POST', headers, body }));
    expect([400,413]).toContain(response.status);
  }
  const denied = await gateway(new Request(`${origin}/mutate${query}`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.invalid' }, body: '{}' }));
  expect(denied.status).toBe(403); expect(calls).toBe(0);
  expect((await gateway(new Request(`${origin}/mutate${query}`, { method: 'POST', headers, body: '{}' }))).status).toBe(200);
  expect(calls).toBe(1);
});

test('gateway rechecks revocation before disclosure and redacts service errors', async () => {
  let current = row;
  const live = { resolve: async () => current };
  const gateway = createGateway({ human: config, origin, store: live, machineLookup: async () => null, routes: [{ path: '/read', method: 'GET', identity: 'human', action: 'memory:read', handle: async () => { current = { ...row, grantActive: false }; return { secret: 'should not escape' }; } }, { path: '/error', method: 'GET', identity: 'human', action: 'memory:read', handle: async () => { throw new Error('private database detail'); } }] });
  const denied = await gateway(new Request(`${origin}/read${query}`, { headers }));
  expect(denied.status).toBe(403); expect(await denied.text()).not.toContain('secret');
  current = row;
  const error = await gateway(new Request(`${origin}/error${query}`, { headers }));
  expect(error.status).toBe(503); expect(await error.text()).not.toContain('private');
  current=row;
  const extra=createGateway({human:config,origin,store:live,machineLookup:async()=>null,routes:[{path:'/graph',method:'POST',identity:'human',action:'memory:read',additionalActions:()=>['evidence:read'],handle:async()=>{current={...row,role:'viewer'};return {rawEvidence:'must not escape'};}}]});
  const restricted=await extra(new Request(`${origin}/graph${query}`,{method:'POST',headers,body:'{}'}));expect(restricted.status).toBe(503);expect(await restricted.text()).not.toContain('rawEvidence');
});

test('post-commit revocation returns unknown rather than a false no-write denial', async () => {
  let current = row;
  const gateway = createGateway({human:config,origin,store:{resolve:async()=>current},machineLookup:async()=>null,routes:[{path:'/write',method:'POST',identity:'human',action:'memory:capture',handle:async()=>{current={...row,grantActive:false};return {outcome:'succeeded'};}}]});
  const result = await gateway(new Request(`${origin}/write${query}`,{method:'POST',headers,body:'{}'}));
  expect(result.status).toBe(503); expect(await result.json()).toEqual({outcome:'unknown'});
});

test('gateway retains admission while timed-out work is unresolved', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const gateway = createGateway({ human: config, origin, store, machineLookup: async () => null, limits: { concurrency: 1, timeoutMs: 20 }, routes: [{ path: '/slow', method: 'GET', identity: 'human', action: 'memory:read', handle: async () => { await pending; return {}; } }] });
  const timed = await gateway(new Request(`${origin}/slow${query}`, { headers }));
  expect(timed.status).toBe(504); expect(await timed.json()).toMatchObject({ outcome: 'unknown' });
  expect((await gateway(new Request(`${origin}/slow${query}`, { headers }))).status).toBe(429);
  finish(); await Bun.sleep(5);
  expect((await gateway(new Request(`${origin}/slow${query}`, { headers }))).status).toBe(200);
});

test('gateway machine route cannot consume browser identity', async () => {
  let called = false;
  const gateway = createGateway({ human: config, origin, store, machineLookup: async () => null, routes: [{ path: '/machine', method: 'POST', identity: 'machine', action: 'memory:capture', handle: async () => { called = true; return {}; } }] });
  expect((await gateway(new Request(`${origin}/machine${query}`, { method: 'POST', headers, body: '{}' }))).status).toBe(401);
  expect(called).toBe(false);
  expect(() => createGateway({ human: config, origin, store, machineLookup: async () => null, limits: { concurrency: 0 }, routes: [] })).toThrow();
});

test('chunked and stalled streams are cancelled within finite budgets', async () => {
  let calls = 0;
  let cancelled = false;
  const gateway = createGateway({ human: config, origin, store, machineLookup: async () => null, limits: { bodyBytes: 16, timeoutMs: 20, responseBytes: 32 }, routes: [
    { path: '/stream', method: 'POST', identity: 'human', action: 'memory:capture', handle: async () => { calls++; return {}; } },
    { path: '/large', method: 'GET', identity: 'human', action: 'memory:read', handle: async () => ({ text: 'x'.repeat(100) }) },
  ] });
  const chunks = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(10)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const large = await gateway(new Request(`${origin}/stream${query}`, { method: 'POST', headers, body: chunks }));
  expect(large.status).toBe(413); expect(cancelled).toBe(true); expect(calls).toBe(0);
  cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }, { highWaterMark: 0 });
  expect((await gateway(new Request(`${origin}/stream${query}`, { method: 'POST', headers, body: stalled }))).status).toBe(504);
  expect(cancelled).toBe(true); expect(calls).toBe(0);
  const oversized = await gateway(new Request(`${origin}/large${query}`, { headers }));
  expect(oversized.status).toBe(503); expect(await oversized.json()).toEqual({ outcome: 'unknown' });
});

test('real loopback HTTP preserves authenticated scope and coarse liveness', async () => {
  const gateway = createGateway({ human: config, origin, store, machineLookup: async () => null, routes: [{ path: '/read', method: 'GET', identity: 'human', action: 'memory:read', handle: async context => ({ principal: context.authority.principalId }) }] });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: gateway });
  try {
    const response = await fetch(new URL(`/read${query}`,server.url), { headers });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ principal: row.principalId });
    expect((await fetch(new URL(`/read${query}`,server.url))).status).toBe(401);
    const foreign = await fetch(new URL('/read?group_id=allura-foreign&workspace_id='+scope.workspaceId,server.url), { headers });
    expect(foreign.status).toBe(403);
    expect(await (await fetch(new URL('/health/live',server.url))).json()).toEqual({ status: 'up' });
  } finally { await server.stop(true); }
});
