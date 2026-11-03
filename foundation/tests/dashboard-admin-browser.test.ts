import {test,expect} from 'bun:test';
import {operatorBrowser} from './dashboard-browser-fixture.ts';
import {deviceCommand} from '../src/devices.ts';
import {deviceChallenge} from '../src/device-contract.ts';
import {randomBytes,randomUUID} from 'node:crypto';
import {capture} from '../src/capture.ts';
test('browser access requests need independent current admin and never imply a content grant',async()=>{
 const b=await operatorBrowser(),{f}=b;
 try{
  await f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.viewer}::uuid`;
  const checks=await b.run(b.data,{
   pending:async()=>{const [request]=await f.owner`SELECT id,state FROM allura.access_requests WHERE group_id=${f.scope.groupId}`;expect(request.state).toBe('pending');expect((await f.owner`SELECT active FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.viewer}::uuid`)[0].active).toBe(false);return request.id;},
   approved:async()=>{expect((await f.owner`SELECT role,active FROM allura.workspace_grants WHERE group_id=${f.scope.groupId} AND principal_id=${f.ids.viewer}::uuid`)[0]).toMatchObject({role:'curator',active:true});return true;}
  },async({page,context,expect,data,action})=>{
   const signIn=async(name:keyof typeof data.tokens)=>{await context.clearCookies();await context.addCookies([{name:'CF_Authorization',value:data.tokens[name],url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);};
   const scope=async()=>{await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);};
   const execute=async()=>{await page.getByRole('button',{name:'Review access action',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();};
   await signIn('viewer');await page.goto(data.origin+'/dashboard/settings');await scope();await page.getByRole('button',{name:'Open workspace',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Access denied');
   await page.getByLabel('Access action',{exact:true}).selectOption('request');await page.getByLabel('Requested role',{exact:true}).selectOption('curator');await page.getByLabel('Access reason',{exact:true}).fill('Need scoped review responsibilities');await execute();await expect(page.getByLabel('Access outcome',{exact:true})).toContainText('pending');const request=String(await action('pending'));
   await page.getByLabel('Access action',{exact:true}).selectOption('decide_request');await page.getByLabel('Request or invitation UUID',{exact:true}).fill(request);await execute();await expect(page.getByLabel('Access outcome',{exact:true})).toContainText('denied');expect(await action('pending')).toBe(request);
   await signIn('author');await page.reload();await scope();await page.getByLabel('Access action',{exact:true}).selectOption('decide_request');await page.getByLabel('Request or invitation UUID',{exact:true}).fill(request);await page.getByLabel('Requested role',{exact:true}).selectOption('curator');await execute();await expect(page.getByLabel('Access outcome',{exact:true})).toContainText('approved');expect(await action('approved')).toBe(true);
   await signIn('viewer');await page.reload();await scope();await page.getByRole('button',{name:'Open workspace',exact:true}).click();await expect(page.getByText('Current role: curator',{exact:true})).toBeVisible();
  });expect(checks).toBeGreaterThanOrEqual(7);
 }finally{await b.close();}
},90000);
test('browser approves exact device enrollment revokes current credential and runs one bounded index job',async()=>{
 const b=await operatorBrowser(),{f}=b;
 try{
  const verifier=randomBytes(32).toString('base64url'),token=randomBytes(32).toString('base64url'),pending=await deviceCommand(f.app,f.identities.curator,f.scope,{kind:'begin',label:'Browser-approved fixture',challenge:deviceChallenge(verifier),actions:['memory:read'],operationKey:randomUUID()});let deviceId='';
  const checks=await b.run({...b.data,enrollmentId:String(pending.enrollmentId),token},{
   complete:async()=>{const complete=await deviceCommand(f.app,f.identities.curator,f.scope,{kind:'complete',enrollmentId:pending.enrollmentId,verifier,token});deviceId=String(complete.deviceId);return true;},
   revoked:async()=>{expect((await f.owner`SELECT revoked FROM allura.device_owners WHERE group_id=${f.scope.groupId} AND device_id=${deviceId}::uuid`)[0].revoked).toBe(true);return true;},
   capture:async()=>{await capture(f.app,f.identities.machine,f.scope,{content:'Bounded browser indexing evidence',idempotency_key:randomUUID()});return true;},
   indexed:async()=>{expect(Number((await f.owner`SELECT count(*) AS n FROM allura.source_vectors WHERE group_id=${f.scope.groupId}`)[0].n)).toBe(1);return true;}
  },async({page,context,expect,data,action})=>{
   const signIn=async(name:keyof typeof data.tokens)=>{await context.clearCookies();await context.addCookies([{name:'CF_Authorization',value:data.tokens[name],url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);};
   const connect=async()=>{await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Open workspace',exact:true}).click();};
   await signIn('author');await page.goto(data.origin+'/dashboard/devices');await connect();await page.getByLabel('Enrollment UUID',{exact:true}).fill(data.enrollmentId);await page.getByRole('button',{name:'Read enrollment',exact:true}).click();await expect(page.getByLabel('Enrollment details',{exact:true})).toContainText('pending');await page.getByRole('button',{name:'Review enrollment approval',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByText('Server receipt',{exact:true})).toBeVisible();
   expect(await action('complete')).toBe(true);await signIn('curator');await page.reload();await connect();await page.getByRole('button',{name:'Review revocation',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByText('Server receipt',{exact:true})).toBeVisible();expect(await action('revoked')).toBe(true);expect(await page.locator('body').innerText()).not.toContain(data.token);
   expect(await action('capture')).toBe(true);await signIn('author');await page.goto(data.origin+'/dashboard/embeddings');await connect();await page.getByRole('button',{name:'Review indexing action',exact:true}).click();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/index/drain');await page.getByRole('button',{name:'Confirm decision',exact:true}).click();expect((await (await response).json()).jobs).toHaveLength(1);await expect(page.getByText('Server receipt',{exact:true})).toBeVisible();expect(await action('indexed')).toBe(true);
  });expect(checks).toBeGreaterThanOrEqual(10);
 }finally{await b.close();}
},90000);