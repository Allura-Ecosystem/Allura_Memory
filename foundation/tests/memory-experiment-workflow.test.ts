import {test,expect,beforeAll,afterAll} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {fixture} from './lifecycle-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal,getProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {submitCorrection} from '../src/corrections.ts';
import {createMemoryExperimentHost,openMemoryExperiment,readExperimentSubmission} from '../src/memory-experiment-workflow.ts';
let f:Awaited<ReturnType<typeof fixture>>,event:string;
beforeAll(async()=>{f=await fixture('allura-experiment-workflow');event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{idempotency_key:'source',content:'Synthetic RAM and Durham approved source.'})).event_id;});
afterAll(async()=>{if(f){await f.close();}});
async function initial(content='RAM exact compiler evidence.'){
 const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:content,assertionKind:'observation',evidenceIds:[event]});
 return JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:p.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Synthetic independent source approval',evidenceIds:[event]})) as {semantic_version_id:string;knowledge_id:string};
}
async function prepared(content='RAM reproducible compiler evidence.'){
 const base=await initial(),workflow=await openMemoryExperiment(f.app,f.identities.machine,f.scope,[base.semantic_version_id],60000);
 await workflow.engine.execute(f.identities.machine,f.scope,{kind:'put',branchId:workflow.branch.branchId,expectedRevision:0,operationKey:'edit',memoryId:base.semantic_version_id,content});
 const candidate=await workflow.engine.candidate(f.identities.machine,f.scope,{branchId:workflow.branch.branchId,expectedRevision:1,operationKey:'export',memoryIds:[base.semantic_version_id],rationale:'Bounded synthetic fixture change'});
 return {base,workflow,candidate};
}
async function counts(){const names=['events','capture_receipts','capture_replay','index_intents','proposal_state','proposal_versions','correction_receipts','semantic_versions','semantic_heads','semantic_supersedes','semantic_intents'];const result:Record<string,number>={};for(const name of names){result[name]=(await f.owner.unsafe(`SELECT count(*)::int AS n FROM allura.${name} WHERE group_id=$1`,[f.scope.groupId]))[0].n;}return result;}
test('experiment workflow binds every engine operation to exact owner and current provenance authority',async()=>{
 const {base,workflow,candidate}=await prepared();
 try{
  const before=await counts();
  await expect(workflow.engine.create(f.identities.curator,f.scope,{snapshotId:workflow.branch.snapshotId,expectedBaseDigest:workflow.branch.baseDigest,operationKey:'borrowed-reader',ttlMs:60000})).rejects.toThrow('forbidden');
  await expect(workflow.engine.view(f.identities.curator,f.scope,workflow.branch.branchId)).rejects.toThrow('forbidden');
  await f.owner`UPDATE allura.machine_credentials SET actions=ARRAY['memory:capture','memory:read','proposal:write'] WHERE principal_id=${f.ids.machine}`;
  try{
   await expect(workflow.engine.view(f.identities.machine,f.scope,workflow.branch.branchId)).rejects.toThrow('forbidden');
   await expect(workflow.submit(candidate,base.semantic_version_id,randomUUID())).rejects.toThrow('forbidden');
  }finally{await f.owner`UPDATE allura.machine_credentials SET actions=ARRAY['memory:capture','memory:read','proposal:write','review:read'] WHERE principal_id=${f.ids.machine}`;}
  expect(await counts()).toEqual(before);expect((await workflow.engine.view(f.identities.machine,f.scope,workflow.branch.branchId)).records).toHaveLength(1);
 }finally{workflow.engine.destroy();}
});
test('experiment host bounds admission cancellation and retained work without late submission',async()=>{
 const base=await initial(),host=createMemoryExperimentHost(f.app,{capacity:1,timeoutMs:500});
 let release!:()=>void,started!:()=>void;const entered=new Promise<void>(r=>{started=r;}),held=new Promise<void>(r=>{release=r;});let late:unknown;
 const running=host.run(f.identities.machine,f.scope,[base.semantic_version_id],async workflow=>{
  started();await held;try{await workflow.engine.view(f.identities.machine,f.scope,workflow.branch.branchId);}catch(error){late=error;}
 });
 await entered;const before=await counts();await expect(host.run(f.identities.machine,f.scope,[base.semantic_version_id],async()=>{})).rejects.toThrow('busy');
 await expect(running).rejects.toThrow('timeout');expect(host.snapshot().unsettledAfterDeadline).toBe(1);expect(host.snapshot().active).toBe(1);
 release();for(let i=0;i<20&&host.snapshot().active;i++){await Bun.sleep(5);}expect(host.snapshot().active).toBe(0);expect(late).toBeInstanceOf(Error);expect(await counts()).toEqual(before);
 const cancelled=new AbortController();cancelled.abort();await expect(host.run(f.identities.machine,f.scope,[base.semantic_version_id],async()=>{},cancelled.signal)).rejects.toThrow('cancelled');
 let saved:Awaited<ReturnType<typeof openMemoryExperiment>>|undefined;await host.run(f.identities.machine,f.scope,[base.semantic_version_id],async workflow=>{saved=workflow;});
 await expect(saved!.engine.view(f.identities.machine,f.scope,saved!.branch.branchId)).rejects.toThrow('disposed');expect(host.snapshot().active).toBe(0);
});
test('experiment cancelled transaction rolls back pending evidence and leaves no claimed receipt',async()=>{
 const base=await initial(),host=createMemoryExperimentHost(f.app),controller=new AbortController(),before=await counts(),key=randomUUID();
 const result=host.run(f.identities.machine,f.scope,[base.semantic_version_id],async w=>{
  await w.engine.execute(f.identities.machine,f.scope,{kind:'put',branchId:w.branch.branchId,expectedRevision:0,operationKey:'edit',memoryId:base.semantic_version_id,content:'Cancelled hypothesis remains disposable.'});
  const packet=await w.engine.candidate(f.identities.machine,f.scope,{branchId:w.branch.branchId,expectedRevision:1,operationKey:'export',memoryIds:[base.semantic_version_id],rationale:'Synthetic cancellation during atomic transaction'});
  const verify=w.engine.verifiedCandidate.bind(w.engine);let calls=0;
  w.engine.verifiedCandidate=async(...args)=>{const frozen=await verify(...args);if(++calls===2){controller.abort();}return frozen;};
  return w.submit(packet,base.semantic_version_id,key);
 },controller.signal);
 await expect(result).rejects.toThrow('cancelled');for(let i=0;i<100&&host.snapshot().active;i++){await Bun.sleep(10);}expect(host.snapshot().active).toBe(0);expect(await counts()).toEqual(before);await expect(readExperimentSubmission(f.app,f.identities.machine,f.scope,key)).rejects.toThrow('not_found');
});
test('experiment submission consumes issued frozen evidence and preserves independent exact proposal review',async()=>{
 const {base,workflow,candidate}=await prepared(),mutable=JSON.parse(JSON.stringify(candidate));
 try{
  const verify=workflow.engine.verifiedCandidate.bind(workflow.engine);
  workflow.engine.verifiedCandidate=async(...args)=>{const issued=await verify(...args);mutable.changes[0].after='Injected after verification';mutable.producerId=f.ids.reviewer;return issued;};
  const receipt=JSON.parse(await workflow.submit(mutable,base.semantic_version_id,randomUUID()));
  const proposal=await getProposal(f.app,f.identities.reviewer,f.scope,receipt.proposal_id);expect(proposal.summary).toBe('RAM reproducible compiler evidence.');expect(mutable.changes[0].after).not.toBe(proposal.summary);
  const before=await counts(),decision={proposalId:proposal.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Exact independent decision',evidenceIds:proposal.evidenceIds};
  for(const identity of [f.identities.machine,f.identities.org,f.identities.author,f.identities.curator,f.identities.viewer]){await expect(decideProposal(f.app,identity,f.scope,decision)).rejects.toThrow('forbidden');}
  await expect(decideProposal(f.app,f.identities.reviewer,f.scope,{...decision,reviewedProposalVersion:2})).rejects.toThrow('conflict');expect(await counts()).toEqual(before);
  const approved=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,decision));expect(approved.outcome).toBe('approved');expect(approved.producer_id).toBe(f.ids.machine);expect(approved.reviewer_id).toBe(f.ids.reviewer);
 }finally{workflow.engine.destroy();}
});
test('experiment governed submission atomically binds evidence pending correction and exact durable replay',async()=>{
 const {base,workflow,candidate}=await prepared(),key=randomUUID(),before=await counts();
 try{
  const receipt=await workflow.submit(candidate,base.semantic_version_id,key),r=JSON.parse(receipt);expect(r.status).toBe('pending_review');expect(r.actor_id).toBe(f.ids.machine);expect(await workflow.submit(candidate,base.semantic_version_id,key)).toBe(receipt);expect(await readExperimentSubmission(f.app,f.identities.machine,f.scope,key)).toBe(receipt);
  const after=await counts();for(const table of ['semantic_versions','semantic_heads','semantic_supersedes','semantic_intents']){expect(after[table]).toBe(before[table]);}
  const proposal=await getProposal(f.app,f.identities.reviewer,f.scope,r.proposal_id);expect(candidate.changes[0]!.after).toBe(proposal.summary);expect(proposal.state).toBe('pending');expect(proposal.evidenceIds).toHaveLength(3);
  const rows=await f.owner`SELECT payload FROM allura.events WHERE group_id=${f.scope.groupId} AND payload->'metadata'->>'source'='memory-experiment-v1' AND payload->'metadata'->>'source_id'=${candidate.candidateDigest}`;expect(rows).toHaveLength(1);const witness=JSON.parse(rows[0].payload.content);expect(witness.candidateDigest).toBe(candidate.candidateDigest);expect(witness.producerId).toBe(f.ids.machine);expect(witness.change.memoryId).toBe(base.semantic_version_id);
  const decision={proposalId:r.proposal_id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Independent exact experiment comparison',evidenceIds:proposal.evidenceIds};await expect(decideProposal(f.app,f.identities.machine,f.scope,decision)).rejects.toThrow('forbidden');await expect(decideProposal(f.app,f.identities.org,f.scope,decision)).rejects.toThrow('forbidden');
  const approved=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,decision));expect(approved.outcome).toBe('approved');expect(approved.knowledge_id).toBe(base.knowledge_id);expect((await f.owner`SELECT content FROM allura.semantic_versions WHERE id=${base.semantic_version_id}`)[0].content).toBe('RAM exact compiler evidence.');
  workflow.engine.destroy();expect(await readExperimentSubmission(f.app,f.identities.machine,f.scope,key)).toBe(receipt);
 }finally{workflow.engine.destroy();}
});
test('experiment governed handoff denies foreign tampered revoked and tombstone input without durable effects',async()=>{
 const {base,workflow,candidate}=await prepared();
 try{
  const before=await counts();await expect(workflow.submit({...candidate,producerId:f.ids.author},base.semantic_version_id,randomUUID())).rejects.toThrow('conflict');await expect(workflow.submit(candidate,randomUUID(),randomUUID())).rejects.toThrow('not_found');expect(await counts()).toEqual(before);
  await expect(openMemoryExperiment(f.app,f.identities.org,f.scope,[base.semantic_version_id],60000)).rejects.toThrow('forbidden');await expect(openMemoryExperiment(f.app,f.identities.machine,{...f.scope,workspaceId:f.foreignWorkspace},[base.semantic_version_id],60000)).rejects.toThrow('forbidden');await expect(openMemoryExperiment(f.app,f.identities.machine,f.scope,[randomUUID()],60000)).rejects.toThrow('not_found');
  await workflow.engine.execute(f.identities.machine,f.scope,{kind:'tombstone',branchId:workflow.branch.branchId,expectedRevision:2,operationKey:'hide',memoryId:base.semantic_version_id});const tomb=await workflow.engine.candidate(f.identities.machine,f.scope,{branchId:workflow.branch.branchId,expectedRevision:3,operationKey:'export-hidden',memoryIds:[base.semantic_version_id],rationale:'Never canonical deletion'});await expect(workflow.submit(tomb,base.semantic_version_id,randomUUID())).rejects.toThrow('invalid');expect(await counts()).toEqual(before);
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.machine}`;
  try{await expect(workflow.submit(candidate,base.semantic_version_id,randomUUID())).rejects.toThrow('forbidden');}finally{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.machine}`;}
  expect(await counts()).toEqual(before);
 }finally{workflow.engine.destroy();}
});
test('experiment governed receipt faults roll back capture proposal and audit together',async()=>{
 const {base,workflow,candidate}=await prepared('Durham preserves exact typography provenance.'),key=randomUUID(),before=await counts();
 try{
  await f.owner.unsafe("CREATE FUNCTION allura.experiment_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic experiment receipt failure'; END $$; CREATE CONSTRAINT TRIGGER experiment_fail AFTER INSERT ON allura.correction_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION allura.experiment_fail()");
  try{await expect(workflow.submit(candidate,base.semantic_version_id,key)).rejects.toThrow('unknown');}finally{await f.owner.unsafe('DROP TRIGGER experiment_fail ON allura.correction_receipts; DROP FUNCTION allura.experiment_fail()');}
  expect(await counts()).toEqual(before);await expect(readExperimentSubmission(f.app,f.identities.machine,f.scope,key)).rejects.toThrow('not_found');const receipt=JSON.parse(await workflow.submit(candidate,base.semantic_version_id,key));expect(receipt.status).toBe('pending_review');
 }finally{workflow.engine.destroy();}
});
test('experiment governed workflow preserves changed key stale head expiry and serialized submission boundaries',async()=>{
 const {base,workflow,candidate}=await prepared(),key=randomUUID();
 try{
  const pending=workflow.submit(candidate,base.semantic_version_id,key);
  await expect(workflow.submit(candidate,base.semantic_version_id,key)).rejects.toThrow('busy');
  const receipt=await pending,before=await counts();
  await workflow.engine.execute(f.identities.machine,f.scope,{kind:'put',branchId:workflow.branch.branchId,expectedRevision:2,operationKey:'changed',memoryId:base.semantic_version_id,content:'Changed candidate cannot reuse durable operation.'});
  const changed=await workflow.engine.candidate(f.identities.machine,f.scope,{branchId:workflow.branch.branchId,expectedRevision:3,operationKey:'changed-export',memoryIds:[base.semantic_version_id],rationale:'Changed hypothesis'});
  await expect(workflow.submit(changed,base.semantic_version_id,key)).rejects.toThrow('conflict');expect(await counts()).toEqual(before);expect(await readExperimentSubmission(f.app,f.identities.machine,f.scope,key)).toBe(receipt);
  const correction=JSON.parse(await submitCorrection(f.app,f.identities.curator,f.scope,{baseMemoryId:base.semantic_version_id,expectedBaseVersion:'1',content:'Human-reviewed competing correction',rationale:'Independent newer source',evidenceIds:[event],operationKey:randomUUID()}));
  await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:correction.proposal_id,reviewedProposalVersion:1,decision:'approve',rationale:'Exact competing correction',evidenceIds:[event],operationKey:randomUUID()});
  const advanced=await counts();await expect(workflow.submit(changed,base.semantic_version_id,randomUUID())).rejects.toThrow('conflict');expect(await counts()).toEqual(advanced);await expect(openMemoryExperiment(f.app,f.identities.machine,f.scope,[base.semantic_version_id],60000)).rejects.toThrow('conflict');
 }finally{workflow.engine.destroy();}
 const shortBase=await initial(),short=await openMemoryExperiment(f.app,f.identities.machine,f.scope,[shortBase.semantic_version_id],1000);
 try{
  await short.engine.execute(f.identities.machine,f.scope,{kind:'put',branchId:short.branch.branchId,expectedRevision:0,operationKey:'short-edit',memoryId:shortBase.semantic_version_id,content:'Expires without promotion.'});
  const packet=await short.engine.candidate(f.identities.machine,f.scope,{branchId:short.branch.branchId,expectedRevision:1,operationKey:'short-export',memoryIds:[shortBase.semantic_version_id],rationale:'Expiry fixture'});
  const before=await counts();await Bun.sleep(1100);await expect(short.submit(packet,shortBase.semantic_version_id,randomUUID())).rejects.toThrow('expired');expect(await counts()).toEqual(before);
 }finally{short.engine.destroy();}
});
