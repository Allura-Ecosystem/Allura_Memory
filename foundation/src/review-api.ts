import { type SQL } from 'bun';
import { type HumanConfig } from './authentication.ts';
import { DecisionError,decideProposal } from './decisions.ts';
import { getProposal,getProposalEvidence } from './proposals.ts';
import { DatabaseStore } from './persistence.ts';
import { createGateway } from './gateway.ts';
export function createReviewGateway(sql:SQL,human:HumanConfig,origin:string):(request:Request)=>Promise<Response>{
  const store=new DatabaseStore(sql);
  return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:[
    {path:'/api/review/decision',method:'POST',identity:'human',action:'review:approve',handle:async({identity,scope,body})=>JSON.parse(await decideProposal(sql,identity,scope,body!))},
    {path:'/api/review/proposal',method:'POST',identity:'human',action:'review:read',handle:async({identity,scope,body})=>{
      if(!body||Object.keys(body).some(k=>!['proposalId','version'].includes(k))||typeof body.proposalId!=='string'||(body.version!==undefined&&typeof body.version!=='number')){throw new DecisionError('invalid');}
      return getProposal(sql,identity,scope,body.proposalId,body.version as number|undefined);
    }},
    {path:'/api/review/evidence',method:'POST',identity:'human',action:'review:read',handle:async({identity,scope,body})=>{
      if(!body||Object.keys(body).some(k=>!['proposalId','version','eventId'].includes(k))||typeof body.proposalId!=='string'||typeof body.version!=='number'||typeof body.eventId!=='string'){throw new DecisionError('invalid');}
      return getProposalEvidence(sql,identity,scope,body.proposalId,body.version,body.eventId);
    }},
  ]});
}
