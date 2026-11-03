import {type SQL} from 'bun';
import {type HumanConfig} from './authentication.ts';
import {createGateway,type Route} from './gateway.ts';
import {DatabaseStore} from './persistence.ts';
import {ProjectionError} from './projection-contract.ts';
import {authorizeProjection,projectionStatus,revokeProjection,type TransferRequest} from './projection.ts';
import {createProjectionTransport,deliverProjection,type ProjectionTransport} from './projection-delivery.ts';
function selected(request:Request,id:boolean):string{
 const url=new URL(request.url);if([...url.searchParams.keys()].some(k=>!['group_id','workspace_id',...(id?['id']:[])].includes(k))||(id&&url.searchParams.getAll('id').length!==1)){throw new ProjectionError('invalid');}return url.searchParams.get('id')??'';
}
function transferId(body:Record<string,unknown>|null):string{if(!body||Object.keys(body).length!==1||typeof body.id!=='string'){throw new ProjectionError('invalid');}return body.id;}
export function createProjectionRoutes(sql:SQL,transport:ProjectionTransport=createProjectionTransport()):Route[]{return [
 {path:'/api/projection/configuration',method:'GET',identity:'human',action:'audit:read',handle:async c=>{selected(c.request,false);return {configured:transport.configured(c.scope)};}},
 {path:'/api/projection/delivery',method:'GET',identity:'human',action:'audit:read',handle:c=>projectionStatus(sql,c.identity,c.scope,selected(c.request,true))},
 {path:'/api/projection/authorize',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{selected(c.request,false);c.signal.throwIfAborted();return JSON.parse(await authorizeProjection(sql,c.identity,c.scope,c.body as TransferRequest));}},
 {path:'/api/projection/process',method:'POST',identity:'human',action:'workspace:grants:manage',handle:c=>{selected(c.request,false);return deliverProjection(sql,c.identity,c.scope,transferId(c.body),transport,c.signal);}},
 {path:'/api/projection/revoke',method:'POST',identity:'human',action:'workspace:grants:manage',handle:async c=>{selected(c.request,false);c.signal.throwIfAborted();const id=transferId(c.body);await revokeProjection(sql,c.identity,c.scope,id);return projectionStatus(sql,c.identity,c.scope,id);}},
 ];}
export function createProjectionGateway(sql:SQL,human:HumanConfig,origin:string,transport:ProjectionTransport=createProjectionTransport()):(request:Request)=>Promise<Response>{const store=new DatabaseStore(sql);return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:createProjectionRoutes(sql,transport)});}
