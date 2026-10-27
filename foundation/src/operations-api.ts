import {type SQL} from 'bun';
import {type HumanConfig} from './authentication.ts';
import {createGateway,type Route} from './gateway.ts';
import {DatabaseStore} from './persistence.ts';
import {type Embedder} from './embedding.ts';
import {listOperations,scopedHealth} from './operations.ts';
export function createOperationsGateway(sql:SQL,human:HumanConfig,origin:string,provider:Embedder):(request:Request)=>Promise<Response>{
 const store=new DatabaseStore(sql);return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:createOperationsRoutes(sql,provider)});
}
export function createOperationsRoutes(sql:SQL,provider:Embedder):Route[]{
 const routes:Route[]=[];
 for(const identity of ['human','machine'] as const){const prefix=identity==='human'?'/api':'/api/agent';routes.push(
  {path:prefix+'/health',method:'GET',identity,action:'health:read',handle:context=>scopedHealth(sql,context.identity,context.scope,provider,context.signal)},
  {path:prefix+'/operations',method:'POST',identity,action:'audit:read',handle:context=>listOperations(sql,context.identity,context.scope,context.body!)},
 );}
 return routes;
}
