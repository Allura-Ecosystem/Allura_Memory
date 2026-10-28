import {test,expect} from 'bun:test';
import {operatorBrowser} from './dashboard-browser-fixture.ts';
import {deliveryFixture} from './projection-http-fixture.ts';
import {createProjectionTransport} from '../src/projection-delivery.ts';
import {projectionStatus} from '../src/projection.ts';
test('browser projection authorizes exact transfer reads real sync and preserves unknown revoked observations',async()=>{
 let first!:Awaited<ReturnType<typeof deliveryFixture>>,second!:Awaited<ReturnType<typeof deliveryFixture>>;
 const b=await operatorBrowser(async f=>{first=await deliveryFixture(f);second=await deliveryFixture(f,'ack-only',false);return createProjectionTransport([...first.entries,...second.entries],true);});
 try{const checks=await b.run({...b.data,id:first.id,input:second.input,evidence:process.env.ALLURA_UI_EVIDENCE??b.dir},{
  untouched:async()=>{expect(first.stats().writes).toBe(0);return true;},
  synced:async()=>{expect(first.stats().writes).toBe(1);expect((await projectionStatus(b.f.app,b.f.identities.author,b.f.scope,first.id)).status).toBe('synced');return true;},
  unknown:async()=>{expect(second.stats().writes).toBe(1);return true;},
  deny:async()=>{await b.f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${b.f.scope.groupId} AND principal_id=${b.f.ids.author}::uuid`;return true;},
 },async({page,context,expect,data,action,fs,path})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.origin+'/dashboard/audit');await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Open workspace',exact:true}).click();
  const health=await page.request.get(data.origin+'/api/health?group_id='+data.scope.groupId+'&workspace_id='+data.scope.workspaceId);expect(health.status()).toBe(200);expect((await health.json()).projection).toBe('configured_not_probed');
  const panel=page.getByLabel('Projection delivery',{exact:true}),observation=page.getByLabel('Delivery observation',{exact:true});await expect(panel).toContainText('A target-scoped delivery adapter is configured.');await page.getByLabel('Transfer UUID',{exact:true}).fill(data.id);await page.getByRole('button',{name:'Read delivery observation',exact:true}).click();await expect(observation).toContainText('queued');
  await page.getByRole('button',{name:'Review delivery attempt',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await action('untouched')).toBe(true);
  await page.getByRole('button',{name:'Review delivery attempt',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(observation).toContainText('synced');expect(await action('synced')).toBe(true);await expect(page.getByRole('button',{name:'Review delivery attempt',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Review transfer revocation',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(observation).toContainText('Revoked');await expect(observation).toContainText('synced');
  await page.route('**/api/projection/delivery?*',async route=>{const response=await route.fetch(),body=await response.json();await route.fulfill({response,json:{...body,transferId:data.input.destinationId}});});await page.getByRole('button',{name:'Read delivery observation',exact:true}).click();await expect(panel).toContainText('Outcome unknown or unavailable');await expect(observation).toHaveCount(0);await page.unroute('**/api/projection/delivery?*');
  await page.getByText('Authorize an exact source-to-destination transfer',{exact:true}).click();await page.getByLabel('Semantic version UUID',{exact:true}).fill(data.input.semanticVersionId);await page.getByLabel('Destination UUID',{exact:true}).fill(data.input.destinationId);await page.getByLabel('Decision-linked evidence UUIDs, comma separated',{exact:true}).fill(data.input.evidenceIds.join(','));await page.getByLabel('Transfer rationale',{exact:true}).fill(data.input.rationale);await page.getByRole('button',{name:'Review projection authorization',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(panel).toContainText('Delivery is queued, not synced.');await page.getByRole('button',{name:'Read delivery observation',exact:true}).click();await expect(observation).toContainText('queued');
  await page.getByRole('button',{name:'Review delivery attempt',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(observation).toContainText('unknown');await expect(observation).toContainText('Not verified');expect(await action('unknown')).toBe(true);
  await fs.mkdir(data.evidence,{recursive:true});await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(data.evidence,'projection-delivery.png'),fullPage:true});
  expect(await action('deny')).toBe(true);await page.getByRole('button',{name:'Read delivery observation',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Access denied');await expect(observation).toHaveCount(0);
 });expect(checks).toBeGreaterThanOrEqual(20);
 }finally{await first?.close();await second?.close();await b.close();}
},90000);
