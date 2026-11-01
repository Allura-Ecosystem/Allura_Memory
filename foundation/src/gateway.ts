import { authenticateHuman, authenticateMachine, requireSameOrigin, type HumanConfig, type Identity, type MachineCredential } from './authentication.ts';
import { resolveAuthority, AuthorityError, type Action, type Authority, type AuthorityStore, type Scope } from './authority.ts';
import { AccessError } from './access.ts';
import { RunError } from './run-contract.ts';
import { SelectedClientError } from './selected-client.ts';
import { MemoryShareError } from './memory-shares.ts';
import { DecisionError } from './decisions.ts';
import { ProposalError } from './proposals.ts';
import { CaptureError } from './capture.ts';
import { DeviceError } from './devices.ts';
import { ProjectionError } from './projection-contract.ts';
import { BumblebeeConfigurationError } from './bumblebee-configuration.ts';
import { AppModuleError } from './app-modules.ts';
import { WorkPlaneError } from './work-plane-contract.ts';

type Limits = { bodyBytes: number; responseBytes: number; targetChars: number; concurrency: number; timeoutMs: number };
const ceilings: Limits = { bodyBytes: 65536, responseBytes: 131072, targetChars: 2048, concurrency: 16, timeoutMs: 5000 };
type Context = Readonly<{ identity: Identity; authority: Authority; scope: Scope; body: Record<string, unknown> | null; signal: AbortSignal; request:Request; params: Readonly<Record<string,string>> }>;
// Only trusted in-process routes can create this envelope, not parsed user JSON.
export class GatewayReply {constructor(readonly status:number,readonly body:unknown){if(![200,202,400,405,406,415].includes(status)){throw new Error('invalid response status');}}}
export class SerializedJsonReply { constructor(readonly body:string) {} }
export type Route = Readonly<{ dynamic?:boolean; parseBody?:(text:string)=>Record<string,unknown>; admission?:(context:Context)=>Promise<void>; disclosure?:(context:Context)=>Promise<void>; timeoutStatus?:503; path: string; method: 'GET' | 'POST'; identity: 'human' | 'machine'; action: Action; additionalActions?: (body:Record<string,unknown>|null,context:Context)=>readonly Action[]|Promise<readonly Action[]>; handle: (context: Context) => Promise<unknown> }>;
type Options = { mode?: 'human'|'machine-only'; human?: HumanConfig; origin: string; store: AuthorityStore; machineLookup: (digest: string) => Promise<MachineCredential | null>; routes: readonly Route[]; limits?: Partial<Limits> };
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
async function readObject(request: Request, limit: number, signal: AbortSignal, parser?:(text:string)=>Record<string,unknown>): Promise<Record<string, unknown>> {
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
    try { const text=new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); value=parser?parser(text):JSON.parse(text); } catch { throw new GatewayError(400, 'invalid'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new GatewayError(400, 'invalid'); }
    return value as Record<string, unknown>;
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export function createGateway(options: Options): (request: Request) => Promise<Response> {
  if ((options.mode !== undefined && options.mode !== 'human' && options.mode !== 'machine-only') || (options.mode === 'machine-only' ? options.human !== undefined : options.human === undefined)) { throw new Error('invalid runtime mode'); }
  const limits = { ...ceilings, ...options.limits };
  for (const key of Object.keys(ceilings) as (keyof Limits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key]) { throw new Error('invalid ingress budget'); }
  }
  const routes = new Map<string, Route>();
  for (const route of options.routes) {
    const key = `${route.method} ${route.path}`;
    if (routes.has(key) || !route.path.startsWith('/') || route.path === '/health/live') { throw new Error('invalid route manifest'); }
    const parts=route.path.split('/');
    if(route.dynamic&&route.method==='GET'&&parts.length===3&&parts.every((p,i)=>p.startsWith(':')||p===['','health','live'][i])){throw new Error('invalid route manifest');}
    if(route.dynamic && (!parts.some(p=>/^:[A-Za-z][A-Za-z0-9_]*$/.test(p)) || parts.some(p=>p.startsWith(':')&&!/^:[A-Za-z][A-Za-z0-9_]*$/.test(p)) || new Set(parts.filter(p=>p.startsWith(':'))).size!==parts.filter(p=>p.startsWith(':')).length)){throw new Error('invalid route manifest');}
    for(const other of routes.values()){
      const previous=other.path.split('/');
      if(other.method===route.method && parts.length===previous.length && parts.every((p,i)=>p===previous[i] || (route.dynamic&&p.startsWith(':')) || (other.dynamic&&previous[i]!.startsWith(':')))){throw new Error('invalid route manifest');}
    }
    routes.set(key, Object.freeze({ ...route }));
  }
  let active = 0;
  return async request => {
    if (request.url.length > limits.targetChars) { return response(414, { outcome: 'invalid' }); }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health/live') { return response(200, { status: 'up' }); }
    const segments=url.pathname.split('/');
    const route = routes.get(`${request.method} ${url.pathname}`) ?? [...routes.values()].find(r=>r.dynamic&&r.method===request.method&&r.path.split('/').length===segments.length&&r.path.split('/').every((p,i)=>p.startsWith(':')||p===segments[i]));
    if (!route || (options.mode === 'machine-only' && route.identity === 'human')) { return response(404, { outcome: 'not_found' }); }
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
        if (request.headers.has('Authorization')) { throw new AuthorityError('unauthenticated'); }
        const assertion = request.headers.get('Cf-Access-Jwt-Assertion') ?? undefined;
        const cookie = cookieToken(request);
        identity = authenticateHuman({ ...(assertion === undefined ? {} : { assertion }), ...(cookie === undefined ? {} : { cookie }) }, options.human!);
        if (request.method !== 'GET') { requireSameOrigin(options.origin, request.headers.get('Origin'), request.headers.get('Sec-Fetch-Site')); }
      } else {
        const authorization = request.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ') || request.headers.has('Cf-Access-Jwt-Assertion') || cookieToken(request)) { throw new AuthorityError('unauthenticated'); }
        identity = await authenticateMachine(authorization.slice(7), options.machineLookup);
      }
      if (url.searchParams.getAll('group_id').length !== 1 || url.searchParams.getAll('workspace_id').length !== 1) { throw new AuthorityError('invalid'); }
      const scope = Object.freeze({ groupId: url.searchParams.get('group_id')!, workspaceId: url.searchParams.get('workspace_id')! });
      const authority = await resolveAuthority(identity, scope, route.action, options.store);
      const params:Record<string,string>=Object.create(null);
      if(route.dynamic){try{route.path.split('/').forEach((p,i)=>{if(p.startsWith(':')){params[p.slice(1)]=decodeURIComponent(segments[i]!);}});}catch{throw new GatewayError(400,'invalid');}}
      const admitted=Object.freeze({identity,authority,scope,body:null,signal:abort.signal,request,params:Object.freeze(params)});
      await route.admission?.(admitted);
      const recheck=async()=>{const current=await resolveAuthority(identity,scope,route.action,options.store);if(route.admission&&current.principalId!==authority.principalId){throw new AuthorityError('forbidden');}};
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      const body = route.method === 'POST' ? await readObject(request, limits.bodyBytes, abort.signal, route.parseBody) : null;
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      await recheck();
      const context=Object.freeze({...admitted,body});
      const additional=await route.additionalActions?.(body,context)??[];
      for(const action of additional){await resolveAuthority(identity,scope,action,options.store);}
      const result = await route.handle(context);
      try { await recheck();await route.disclosure?.(context);for(const action of additional){await resolveAuthority(identity,scope,action,options.store);} }
      catch (error) { if (route.method === 'POST' && !route.disclosure) { throw new GatewayError(503, 'unknown'); } throw error; }
      if (abort.signal.aborted) { throw new GatewayError(504, 'unknown'); }
      const status=result instanceof GatewayReply?result.status:200;
      const encoded = result instanceof SerializedJsonReply?result.body:JSON.stringify(result instanceof GatewayReply?result.body:result);
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
      if (error instanceof RunError || error instanceof SelectedClientError || error instanceof MemoryShareError || error instanceof DecisionError || error instanceof ProposalError || error instanceof CaptureError || error instanceof DeviceError || error instanceof ProjectionError || error instanceof BumblebeeConfigurationError || error instanceof AppModuleError) { return response(error.code === 'conflict' ? 409 : error.code === 'invalid' ? 400 : error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 503, {outcome:error.code}); }
      if (error instanceof WorkPlaneError) { return response(({invalid:400,forbidden:403,not_found:404,conflict:409,failed:500,unknown:503,capacity:503} as const)[error.code],{outcome:error.code}); }
      if (error instanceof GatewayError) { return response(error.status===504?(route.timeoutStatus??504):error.status, { outcome: error.outcome }); }
      // Arbitrary service exceptions may occur after a commit: never infer rollback.
      return response(503, { outcome: 'unknown' });
    } finally { clearTimeout(timer); }
  };
}
