import {type SQL} from 'bun';
import {type HumanConfig} from './authentication.ts';
import {createGateway,type Route} from './gateway.ts';
import {DatabaseStore} from './persistence.ts';
import {AppModuleError,configureApp,readApps,appRelease} from './app-modules.ts';
import {readBumblebeeInventory} from './bumblebee-persistence.ts';
import {createDashboardRoutes} from './dashboard-api.ts';
function selected(request:Request){if([...new URL(request.url).searchParams.keys()].some(k=>k!=='group_id'&&k!=='workspace_id')){throw new AppModuleError('invalid');}}
export function createAppModulesRoutes(sql:SQL):Route[]{
 const review=createDashboardRoutes(sql).find(r=>r.path==='/api/dashboard/proposals')!;
 return [
  {path:'/api/apps',method:'GET',identity:'human',action:'memory:read',handle:c=>{selected(c.request);return readApps(sql,c.identity,c.scope);}},
  {path:'/api/apps/configure',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{selected(c.request);c.signal.throwIfAborted();return JSON.parse(await configureApp(sql,c.identity,c.scope,c.body));}},
  {path:'/api/apps/view',method:'POST',identity:'human',action:'memory:read',handle:async c=>{
   selected(c.request);if(!c.body||Object.keys(c.body).length!==1||!Object.hasOwn(c.body,'appId')){throw new AppModuleError('invalid');}const id=appRelease(c.body.appId,'1.0.0').id,app=(await readApps(sql,c.identity,c.scope)).find(a=>a.id===id)!;c.signal.throwIfAborted();
   // Unavailable module is not a denial of the entire authenticated shell.
   if(app.state!=='available'){return {state:'unavailable',data:null};}
   const data=id==='memory-review'?await review.handle({...c,body:{limit:20}}):app.configuration?.sourceId?await readBumblebeeInventory(sql,c.identity,c.scope,app.configuration.sourceId as string):{source:null,current:null,notice:'No source selected; no scan or health is inferred.'};
   c.signal.throwIfAborted();const after=(await readApps(sql,c.identity,c.scope)).find(a=>a.id===id);if(after?.state!=='available'||after.revision!==app.revision){return {state:'unavailable',data:null};}return {state:'available',app,data};
  }},
 ];
}
export function createAppModulesGateway(sql:SQL,human:HumanConfig,origin:string){const store=new DatabaseStore(sql);return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:createAppModulesRoutes(sql)});}
