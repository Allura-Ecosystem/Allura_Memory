import {type SQL} from 'bun';
import {type HumanConfig} from './authentication.ts';
import {createGateway,type Route} from './gateway.ts';
import {DatabaseStore} from './persistence.ts';
import {DecisionError} from './decisions.ts';
import {createRetrievalService,type ListOptions,type GraphOptions} from './retrieval.ts';
import {searchIndex,type IndexQuery} from './retrieval-index.ts';
import {type Embedder} from './embedding.ts';
export function createRetrievalGateway(sql:SQL,human:HumanConfig,origin:string,cursorKey:Uint8Array,embedder:Embedder):(request:Request)=>Promise<Response>{
  const store=new DatabaseStore(sql),service=createRetrievalService(sql,cursorKey);
  const routes:Route[]=[];
  for(const identity of ['human','machine'] as const){
    const prefix=identity==='human'?'/api/memory':'/api/agent/memory';
    routes.push(
      {path:prefix+'/get',method:'POST',identity,action:'memory:read',handle:async context=>{
        const body=context.body!;if(Object.keys(body).some(k=>!['id','history'].includes(k))||typeof body.id!=='string'||(body.history!==undefined&&typeof body.history!=='boolean')){throw new DecisionError('invalid');}
        return service.get(context.identity,context.scope,body.id,body.history as boolean|undefined);
      }},
      {path:prefix+'/list',method:'POST',identity,action:'memory:read',handle:async c=>service.list(c.identity,c.scope,c.body as ListOptions)},
      {path:prefix+'/graph',method:'POST',identity,action:'memory:read',additionalActions:body=>body?.includeEvidence===true?['evidence:read']:[],handle:async c=>service.graph(c.identity,c.scope,c.body as GraphOptions)},
      {path:prefix+'/search',method:'POST',identity,action:'memory:read',handle:async c=>searchIndex(sql,c.identity,c.scope,c.body as unknown as IndexQuery,embedder)},
    );
  }
  return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes});
}
