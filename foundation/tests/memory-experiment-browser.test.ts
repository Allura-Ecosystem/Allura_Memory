import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {operatorBrowser} from './dashboard-browser-fixture.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';
import {createMemoryExperimentHost,openMemoryExperiment} from '../src/memory-experiment-workflow.ts';
test('browser independently reviews bounded RAM Durham experiment evidence without implicit promotion',async()=>{
 const b=await operatorBrowser(),{f}=b;const workflows:Awaited<ReturnType<typeof openMemoryExperiment>>[]=[];
 try{
  const records:{crew:string;original:string;proposed:string;proposalId:string;baseId:string;knowledgeId:string;digest:string}[]=[],host=createMemoryExperimentHost(f.app);
  for(const crew of ['RAM','Durham']){
   const original=crew==='RAM'?'RAM compiler logs remain exact.':'Durham typography uses the retained approved assets.';
   const proposed=crew==='RAM'?'RAM reproducible compiler logs remain exact.':'Durham typography preserves retained asset provenance.';
   const event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{content:original,idempotency_key:randomUUID()})).event_id;
   const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:original,evidenceIds:[event],assertionKind:'observation'});
   const initial=JSON.parse(await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:p.id,reviewedProposalVersion:1,operationKey:randomUUID(),decision:'approve',rationale:'Initial independent synthetic source approval',evidenceIds:[event]}));
   await host.run(f.identities.machine,f.scope,[initial.semantic_version_id],async w=>{workflows.push(w);
   const checkpoint=await w.engine.execute(f.identities.machine,f.scope,{kind:'checkpoint',branchId:w.branch.branchId,expectedRevision:0,operationKey:'checkpoint'});expect(checkpoint.kind).toBe('checkpoint');
   await w.engine.execute(f.identities.machine,f.scope,{kind:'put',branchId:w.branch.branchId,expectedRevision:1,operationKey:'edit',memoryId:initial.semantic_version_id,content:proposed});
   const view=await w.engine.view(f.identities.machine,f.scope,w.branch.branchId);expect(view.records[0]?.experimentOnly).toBe(true);expect(view.diff[0]?.before).toBe(original);
   const candidate=await w.engine.candidate(f.identities.machine,f.scope,{branchId:w.branch.branchId,expectedRevision:2,operationKey:'select',memoryIds:[initial.semantic_version_id],rationale:`${crew} bounded synthetic comparison; independent human review required.`});
   const receipt=JSON.parse(await w.submit(candidate,initial.semantic_version_id,randomUUID()));expect(receipt.status).toBe('pending_review');w.engine.destroy();
   records.push({crew,original,proposed,proposalId:receipt.proposal_id,baseId:initial.semantic_version_id,knowledgeId:initial.knowledge_id,digest:candidate.candidateDigest});
   });expect(host.snapshot().active).toBe(0);
  }
  const ram=records[0]!,durham=records[1]!;
  const state=async(id:string,value:string,semanticCount:number)=>{
   expect((await f.owner`SELECT state FROM allura.proposal_state WHERE group_id=${f.scope.groupId} AND id=${id}::uuid`)[0].state).toBe(value);
   expect((await f.owner`SELECT count(*)::int AS n FROM allura.semantic_versions WHERE group_id=${f.scope.groupId}`)[0].n).toBe(semanticCount);return true;
  };
  const checks=await b.run({...b.data,ram,durham,screenshots:process.env.ALLURA_UI_EVIDENCE??join(b.dir,'evidence')},{
   needs:()=>state(ram.proposalId,'needs_evidence',2),rejected:()=>state(ram.proposalId,'rejected',2),pending:()=>state(durham.proposalId,'pending',2),
   revoke:async()=>{await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}`;return true;},
   restore:async()=>{await f.owner`UPDATE allura.workspace_grants SET active=true WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.reviewer}`;return true;},
   approved:async()=>{await state(durham.proposalId,'approved',3);expect((await f.owner`SELECT content FROM allura.semantic_versions WHERE id=${durham.baseId}`)[0].content).toBe(durham.original);expect(await f.owner`SELECT * FROM allura.semantic_supersedes WHERE group_id=${f.scope.groupId} AND older_id=${durham.baseId}`).toHaveLength(1);return true;}
  },async({page,context,expect,data,action,fs,path})=>{
   await context.addCookies([{name:'CF_Authorization',value:data.tokens.reviewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.origin+'/dashboard/curator');await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Open workspace',exact:true}).click();
   await page.getByRole('button',{name:data.ram.proposed,exact:true}).click();await expect(page.getByText(data.ram.original,{exact:true}).first()).toBeVisible();await expect(page.getByText(data.ram.digest,{exact:false}).first()).toBeVisible();
   await page.getByLabel('Decision',{exact:true}).selectOption('request_evidence');await page.getByLabel('Decision reason',{exact:true}).fill('Need independent confirmation beyond this experiment.');await page.getByRole('button',{name:'Review decision',exact:true}).click();const dialog=page.getByRole('alertdialog');await page.keyboard.press('Tab');await expect(dialog.locator(':focus')).toHaveCount(1);await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByLabel('Decision outcome',{exact:true})).toContainText('needs_evidence');expect(await action('needs')).toBe(true);
   await page.getByRole('button',{name:'Refresh current view',exact:true}).click();await page.getByRole('button',{name:data.ram.proposed,exact:true}).click();await page.getByLabel('Decision',{exact:true}).selectOption('reject');await page.getByLabel('Decision reason',{exact:true}).fill('This synthetic hypothesis is not supported.');await page.getByRole('button',{name:'Review decision',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByLabel('Decision outcome',{exact:true})).toContainText('rejected');expect(await action('rejected')).toBe(true);
   await page.getByRole('button',{name:'Refresh current view',exact:true}).click();await page.getByRole('button',{name:data.durham.proposed,exact:true}).click();await expect(page.getByText(data.durham.digest,{exact:false}).first()).toBeVisible();await page.getByLabel('Decision',{exact:true}).selectOption('approve');await page.getByLabel('Decision reason',{exact:true}).fill('Compared exact base and captured experiment provenance.');await action('revoke');await page.getByRole('button',{name:'Review decision',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Access denied');expect(await action('pending')).toBe(true);
   await action('restore');await page.getByRole('button',{name:'Open workspace',exact:true}).click();await page.getByRole('button',{name:data.durham.proposed,exact:true}).click();await page.getByLabel('Decision reason',{exact:true}).fill('Reauthenticated and reread exact independent provenance.');await page.getByRole('button',{name:'Review decision',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByLabel('Decision outcome',{exact:true})).toContainText('approved');expect(await action('approved')).toBe(true);
   await fs.mkdir(data.screenshots,{recursive:true});await page.screenshot({path:path.join(data.screenshots,'experiment-curator-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(data.screenshots,'experiment-curator-phone.png'),fullPage:true});expect(await page.evaluate('document.documentElement.scrollWidth<=innerWidth')).toBe(true);
  });expect(checks).toBeGreaterThanOrEqual(13);
 }finally{for(const w of workflows){w.engine.destroy();}await b.close();}
},90000);
