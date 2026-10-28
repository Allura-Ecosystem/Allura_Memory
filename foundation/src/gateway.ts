import { authenticateHuman, authenticateMachine, requireSameOrigin, type HumanConfig, type Identity, type MachineCredential } from './authentication.ts';
import { resolveAuthority, AuthorityError, type Action, type Authority, type AuthorityStore, type Scope } from './authority.ts';
import { AccessError } from './access.ts';
import { DecisionError } from './decisions.ts';
import { ProposalError } from './proposals.ts';
import { CaptureError } from './capture.ts';
import { DeviceError } from './devices.ts';
import { ProjectionError } from './projection-contract.ts';
import { BumblebeeConfigurationError } from './bumblebee-configuration.ts';

type Limits = { bodyBytes: number; responseBytes: number; targetChars: number; concurrency: number; timeoutMs: number };
const ceilings: Limits = { bodyBytes: 65536, responseBytes: 131072, targetChars: 2048, concurrency: 16, timeoutMs: 5000 };
type Context = Readonly<{ identity: Identity; authority: Authority; scope: Scope; body: Record<string, unknown> | null; signal: AbortSignal; request:Request }>;
// Only trusted in-process routes can create this envelope, not parsed user JSON.
export class GatewayReply {constructor(readonly status:number,readonly body:unknown){if(![200,202,400,405,406,415].includes(status)){throw new Error('invalid response status');}}}
export type Route = Readonly<{ path: string; method: 'GET' | 'POST'; identity: 'human' | 'machine'; action: Action; additionalActions?: (body:Record<string,unknown>|null,context:Context)=>readonly Action[]|Promise<readonly Action[]>; handle: (context: Context) => Promise<unknown> }>;
type Options = { human: HumanConfig; origin: string; store: AuthorityStore; machineLookup: (digest: string) => Promise<MachineCredential | null>; routes: readonly Route[]; limits?: Partial<Limits> };
class GatewayError extends Error { constructor(readonly status: number, readonly outcome: string) { super(outcome); } }
const response = (status: number, body: unknown): Response => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function cookieToken(request: Request): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) { return undefined; }
  if (raw.length > 16384) { throw new AuthorityError('unauthenticated'); }
  const values = raw.split(';').map(v => v.trim()).filter(v => v.startsWith('CF_Authorization='));
  if (values.length > 1) { throw new AuthorityError('unauthenticated'); }
  return values[0]?.slice('CF_Authorization='.length);
}
async function readObject(request: Request, limit: number, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') { throw new GatewayError(400, 'invalid'); }
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { throw new GatewayError(413, 'invalid'); }
  if (!request.body) { throw new GatewayError(400, 'invalid'); }
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) { throw new GatewayError(504, 'unknown'); }
      const { done, value } = await reader.read();
      if (done) { break; }
      size += value.length;
      if (size > limit) { cancel(); throw new GatewayError(413, 'invalid'); }
      chunks.push(value);
    }
    if (signal.aborted) { throw new GatewayError(504, 'unknown'); }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GatewayError(400, 'invalid'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new GatewayError(400, 'invalid'); }
    return value as Record<string, unknown>;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export function createGateway(options: Options): (request: Request) => Promise<Response> {
  const limits = { ...ceilings, ...options.limits };
  for (const key of Object.keys(ceilings) as (keyof Limits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key]) { throw new Error('invalid ingress budget'); }
  }
  const routes = new Map<string, Route>();
  for (const route of options.routes) {
    const key = `${route.method} ${route.path}`;
    if (routes.has(key) || !route.path.startsWith('/') || route.path === '/health/live') { throw new Error('invalid route manifest'); }
    routes.set(key, Object.freeze({ ...route }));
  }
  let active = 0;
  return async request => {
    if (request.url.length > limits.targetChars) { return response(414, { outcome: 'invalid' }); }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health/live') { return response(200, { status: 'up' }); }
    const route = routes.get(`${request.method} ${url.pathname}`);
    if (!route) { return response(404, { outcome: 'not_found' }); }
    if (active >= limits.concurrency) { return response(429, { outcome: 'unavailable' }); }
    active++;
    const abort = new AbortController();
    const clientAbort = () => abort.abort();
    request.signal.addEventListener('abort', clientAbort, { once: true });
    if (request.signal.aborted) { abort.abort(); }
    const work = (async () => {
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      let identity: Identity;
      if (route.identity === 'human') {
        const assertion = request.headers.get('Cf-Access-Jwt-Assertion') ?? undefined;
        const cookie = cookieToken(request);
        identity = authenticateHuman({ ...(assertion === undefined ? {} : { assertion }), ...(cookie === undefined ? {} : { cookie }) }, options.human);
        if (request.method !== 'GET') { requireSameOrigin(options.origin, request.headers.get('Origin'), request.headers.get('Sec-Fetch-Site')); }
      } else {
        const authorization = request.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ') || request.headers.has('Cf-Access-Jwt-Assertion') || cookieToken(request)) { throw new AuthorityError('unauthenticated'); }
        identity = await authenticateMachine(authorization.slice(7), options.machineLookup);
      }
      if (url.searchParams.getAll('group_id').length !== 1 || url.searchParams.getAll('workspace_id').length !== 1) { throw new AuthorityError('invalid'); }
      const scope = Object.freeze({ groupId: url.searchParams.get('group_id')!, workspaceId: url.searchParams.get('workspace_id')! });
      const authority = await resolveAuthority(identity, scope, route.action, options.store);
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      const body = route.method === 'POST' ? await readObject(request, limits.bodyBytes, abort.signal) : null;
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      await resolveAuthority(identity, scope, route.action, options.store);
      const context=Object.freeze({identity,authority,scope,body,signal:abort.signal,request});
      const additional=await route.additionalActions?.(body,context)??[];
      for(const action of additional){await resolveAuthority(identity,scope,action,options.store);}
      const result = await route.handle(context);
      try { await resolveAuthority(identity, scope, route.action, options.store);for(const action of additional){await resolveAuthority(identity,scope,action,options.store);} }
      catch (error) { if (route.method === 'POST') { throw new GatewayError(503, 'unknown'); } throw error; }
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      const status=result instanceof GatewayReply?result.status:200;
      const encoded = JSON.stringify(result instanceof GatewayReply?result.body:result);
      if (encoded === undefined || Buffer.byteLength(encoded) > limits.responseBytes) { throw new GatewayError(503, 'unknown'); }
      return new Response(status===202?null:encoded, { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    })();
    // Do not free admission on timeout until actual service work settles.
    const tracked = work.finally(() => { active--; request.signal.removeEventListener('abort', clientAbort); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new GatewayError(504, 'unknown')); }, limits.timeoutMs);
    });
    try { return await Promise.race([tracked, deadline]); }
    catch (error) {
      if (error instanceof AuthorityError) { return response(error.code === 'unauthenticated' ? 401 : error.code === 'invalid' ? 400 : 403, { outcome: error.code }); }
      if (error instanceof AccessError) { return response(error.code === 'conflict' ? 409 : error.code === 'invalid' ? 400 : error.code === 'forbidden' ? 403 : 503, { outcome: error.code === 'unavailable' ? 'unknown' : error.code }); }
      if (error instanceof DecisionError || error instanceof ProposalError || error instanceof CaptureError || error instanceof DeviceError || error instanceof ProjectionError || error instanceof BumblebeeConfigurationError) { return response(error.code === 'conflict' ? 409 : error.code === 'invalid' ? 400 : error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 503, {outcome:error.code}); }
      if (error instanceof GatewayError) { return response(error.status, { outcome: error.outcome }); }
      // Arbitrary service exceptions may occur after a commit: never infer rollback.
      return response(503, { outcome: 'unknown' });
    } finally { clearTimeout(timer); }
  };
}
