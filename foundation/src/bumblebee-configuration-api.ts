import {type SQL} from 'bun';
import {type HumanConfig} from './authentication.ts';
import {createGateway,type Route} from './gateway.ts';
import {DatabaseStore} from './persistence.ts';
import {BumblebeeConfigurationError,configureBumblebeeSource,approveBumblebeeCatalog,invalidateBumblebeeCatalog,readBumblebeeSource,fingerprintBumblebeeRoots} from './bumblebee-configuration.ts';
import {issueBumblebeeRunner,revokeBumblebeeRunner} from './bumblebee-leases.ts';
import {readBumblebeeInventory} from './bumblebee-persistence.ts';
function selected(request:Request,withId=false):string{const p=new URL(request.url).searchParams;if([...p.keys()].some(k=>!['group_id','workspace_id',...(withId?['id']:[])].includes(k))||(withId&&p.getAll('id').length!==1)){throw new BumblebeeConfigurationError('invalid');}return p.get('id')??'';}
// Configuration uses signed current humans only. These routes NEVER authenticate
// runner/ingest secrets or accept a GatewaySession from their callers.
export function createBumblebeeConfigurationRoutes(sql:SQL,options:{allowLoopbackFixture?:boolean;redaction?:{key:Uint8Array;revision:string}}={}):Route[]{
 const secure=(request:Request)=>{const u=new URL(request.url);if(u.protocol!=='https:'&&!(options.allowLoopbackFixture===true&&u.protocol==='http:'&&u.hostname==='127.0.0.1')){throw new BumblebeeConfigurationError('forbidden');}};
 return [
 {path:'/api/bumblebee/roots/fingerprint',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{secure(c.request);selected(c.request);c.signal.throwIfAborted();if(!options.redaction){throw new BumblebeeConfigurationError('unknown');}return fingerprintBumblebeeRoots(sql,c.identity,c.scope,c.body,options.redaction);}},
 {path:'/api/bumblebee/inventory',method:'GET',identity:'human',action:'evidence:read',handle:c=>readBumblebeeInventory(sql,c.identity,c.scope,selected(c.request,true))},
 {path:'/api/bumblebee/runner/issue',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{secure(c.request);selected(c.request);c.signal.throwIfAborted();return issueBumblebeeRunner(sql,c.identity,c.scope,c.body);}},
 {path:'/api/bumblebee/runner/revoke',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{secure(c.request);selected(c.request);c.signal.throwIfAborted();return revokeBumblebeeRunner(sql,c.identity,c.scope,c.body);}},
 {path:'/api/bumblebee/source',method:'GET',identity:'human',action:'evidence:read',handle:c=>readBumblebeeSource(sql,c.identity,c.scope,selected(c.request,true))},
 {path:'/api/bumblebee/source/configure',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{selected(c.request);c.signal.throwIfAborted();return JSON.parse(await configureBumblebeeSource(sql,c.identity,c.scope,c.body));}},
 {path:'/api/bumblebee/catalog/approve',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{selected(c.request);c.signal.throwIfAborted();return JSON.parse(await approveBumblebeeCatalog(sql,c.identity,c.scope,c.body));}},
 {path:'/api/bumblebee/catalog/invalidate',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{selected(c.request);c.signal.throwIfAborted();return JSON.parse(await invalidateBumblebeeCatalog(sql,c.identity,c.scope,c.body));}},
];}
export function createBumblebeeConfigurationGateway(sql:SQL,human:HumanConfig,origin:string,options:{allowLoopbackFixture?:boolean}={}):(request:Request)=>Promise<Response>{const store=new DatabaseStore(sql);return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:createBumblebeeConfigurationRoutes(sql,options)});}
