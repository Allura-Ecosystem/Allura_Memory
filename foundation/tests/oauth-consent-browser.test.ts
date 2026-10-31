import {test,expect} from 'bun:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {consentBrowser} from './oauth-consent-browser-fixture.ts';

test('OAuth browser lost display or decision responses clear private state and never retry or navigate',async()=>{
 const b=await consentBrowser();try{const flows=[(await b.begin()).authorization,(await b.begin()).authorization];const checks=await b.run({...b.data,flows},{loseGET:async()=>{b.lose('GET');return true;},losePOST:async()=>{b.lose('POST');return true;}},async({page,context,expect,data,action})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const [i,method] of ['GET','POST'].entries()){await page.goto(data.flows[i]!);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await action('lose'+method);await page.getByRole('button',{name:'Review connection request',exact:true}).click();if(method==='POST'){await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm decision');button.click();button.click();})()");}await expect(page.getByRole('alert')).toContainText('No success or rollback is inferred');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Verify workspace',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:/Retry/})).toHaveCount(0);expect(new URL(page.url()).pathname).toBe('/dashboard/oauth/consent');}
 });expect(checks).toBe(10);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['GET',200],['POST',200]]);const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.client_delegations WHERE group_id=${b.f.scope.groupId}`;expect(count.n).toBe(0);
 }finally{await b.close();}
},60000);

test('OAuth browser display bindings reject tamper swapped session cross site replay and expiry without issuance',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{expire:async()=>{await b.f.owner`UPDATE allura.oauth_transactions SET expires_at=clock_timestamp()-interval '1 second' WHERE group_id=${b.f.scope.groupId}`;return true;}},async({page,context,expect,data,action})=>{
  const signIn=async(token:string)=>{await context.clearCookies();await context.addCookies([{name:'CF_Authorization',value:token,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);};await signIn(data.tokens.author);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/oauth/consent');await page.getByRole('button',{name:'Review connection request',exact:true}).click();const response=await pending,shown=await response.json() as Record<string,unknown>,url=response.url();
  const post=(body:Record<string,unknown>,origin=data.origin)=>context.request.post(url,{headers:{Origin:origin,'Sec-Fetch-Site':origin===data.origin?'same-origin':'cross-site'},data:body});const approved={...shown,decision:'approve'};
  expect((await context.request.get(url)).status()).toBe(403);
  for(const edit of [{nonce:'x'.repeat(43)},{clientId:'foreign'},{actions:['memory:delete']},{workspaceId:data.foreignWorkspace},{name:'tampered'},{transaction:'x'.repeat(43)}]){expect([400,403]).toContain((await post({...approved,...edit})).status());}
  expect((await post(approved,'https://foreign.invalid')).status()).toBe(403);await signIn(data.tokens.reviewer);expect((await post(approved)).status()).toBe(403);await signIn(data.tokens.author);
  expect(await page.locator('main').innerText()).not.toContain(String(shown.nonce));expect(await page.locator('main').innerText()).not.toContain(String(shown.transaction));
  await action('expire');await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);
 });expect(checks).toBe(13);expect(b.callbacks).toHaveLength(0);const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.oauth_transactions WHERE group_id=${b.f.scope.groupId} AND code_digest IS NOT NULL`;expect(count.n).toBe(0);
 }finally{await b.close();}
},60000);

test('OAuth browser disabled APIs deny private consent and machine only mode has no dashboard',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();await b.disable();const checks=await b.run({...b.data,authorization:flow.authorization},{machine:async()=>{await b.disable('machine-only');return true;}},async({page,context,expect,data,action})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);const url=page.url();await expect(page.getByRole('heading',{name:'Connect an app'})).toBeVisible();await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await action('machine');expect((await page.goto(url))?.status()).toBe(404);await expect(page.getByRole('heading',{name:'Connect an app'})).toHaveCount(0);
 });expect(checks).toBe(5);expect(b.callbacks).toHaveLength(0);}finally{await b.close();}
},60000);

test('OAuth browser denies absent invalid mixed member foreign and revoked identities before private display',async()=>{
 const b=await consentBrowser();try{const flows=[];for(let i=0;i<7;i++){flows.push((await b.begin()).authorization);}
 const checks=await b.run({...b.data,flows},{revoke:async()=>{await b.f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${b.f.scope.groupId} AND principal_id=${b.f.ids.author}::uuid`;return true;}},async({page,context,expect,data,action})=>{
  const cases=[{token:''},{token:'invalid-signed-cookie'},{token:data.tokens.viewer},{token:data.tokens.org},{token:data.tokens.author,mixed:true},{token:data.tokens.author,foreign:true},{token:data.tokens.author,revoked:true}];
  for(const [i,item] of cases.entries()){await context.clearCookies();await page.setExtraHTTPHeaders({});if(item.token){await context.addCookies([{name:'CF_Authorization',value:item.token,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);}if(item.revoked){await action('revoke');}await page.goto(data.flows[i]!);await page.setExtraHTTPHeaders(item.mixed?{'Cf-Access-Jwt-Assertion':data.tokens.reviewer}:{});await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(item.foreign?data.foreignWorkspace:data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Access denied');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Verify workspace',exact:true})).toBeDisabled();}
 });expect(checks).toBe(28);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/consent')).toHaveLength(0);
 }finally{await b.close();}
},60000);

test('OAuth browser current revocation clears a displayed request without callback or credential',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{revoke:async()=>{await b.f.owner`UPDATE allura.workspace_grants SET active=false WHERE group_id=${b.f.scope.groupId} AND principal_id=${b.f.ids.author}::uuid`;return true;}},async({page,context,expect,data,action})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();await action('revoke');await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Access denied');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Approve connection',exact:true})).toHaveCount(0);
 });expect(checks).toBe(4);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['POST',403]]);const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.client_delegations WHERE group_id=${b.f.scope.groupId}`;expect(count.n).toBe(0);
 }finally{await b.close();}
},60000);


test('OAuth browser exact request wraps at desktop and phone with readable named controls',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});const layout=await page.evaluate<{width:number;scroll:number;font:string;wrap:string;controls:{height:number;width:number}[]}>(`({width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('code')).fontFamily,background:getComputedStyle(document.body).backgroundColor,controls:[...document.querySelectorAll('button,input')].map(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),wrap:getComputedStyle(document.querySelector('dd')).overflowWrap})`);expect(layout.scroll).toBeLessThanOrEqual(layout.width);expect(layout.font).toContain('IBM Plex Mono');expect(layout.wrap).toBe('anywhere');for(const control of layout.controls){expect(control.height).toBeGreaterThanOrEqual(44);expect(control.width).toBeGreaterThan(0);}await expect(page.getByRole('region',{name:'Connection request'})).toContainText(data.redirect);}
  expect(await page.locator('main script').count()).toBe(0);expect(await page.evaluate('({local:localStorage.length,session:sessionStorage.length})')).toEqual({local:0,session:0});
 });expect(checks).toBeGreaterThan(30);}finally{await b.close();}
},60000);

test('OAuth browser real back navigation discards private consent without resubmission',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  await page.goto(data.origin+'/dashboard');await page.goBack();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Verify workspace',exact:true})).toBeDisabled();
 });expect(checks).toBe(4);expect(b.witness.filter(r=>r.path==='/api/oauth/consent').map(r=>r.method)).toEqual(['GET']);expect(b.callbacks).toHaveLength(0);
 }finally{await b.close();}
},60000);

test('OAuth browser history restoration clears private request and cannot resurrect a decision',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));");
  await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('button',{name:'Verify workspace',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('button',{name:'Verify workspace',exact:true})).toBeDisabled();
 });expect(checks).toBe(6);expect(b.witness.filter(r=>r.path==='/api/oauth/consent').map(r=>r.method)).toEqual(['GET']);expect(b.callbacks).toHaveLength(0);}finally{await b.close();}
},60000);

test('OAuth browser follows SDK discovery approves exact consent and reconnects for five tools and receipt readback',async()=>{
 const b=await consentBrowser();try{
  const flow=await b.begin();
  const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
   await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
   await page.goto(data.authorization);
   expect(new URL(page.url()).pathname).toBe('/dashboard/oauth/consent');
   await expect(page.getByRole('heading',{name:'Connect an app',exact:true})).toBeVisible();
   await expect(page.getByText(data.client.name,{exact:true})).toHaveCount(0);
   await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);
   await page.getByRole('button',{name:'Verify workspace',exact:true}).click();
   await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeEnabled();
   await page.getByRole('button',{name:'Review connection request',exact:true}).click();
   const request=page.getByRole('region',{name:'Connection request',exact:true});await expect(request).toContainText(data.client.name);await expect(request).toContainText(data.client.clientId);await expect(request).toContainText(data.redirect);await expect(request).toContainText(data.scope.groupId);await expect(request).toContainText(data.scope.workspaceId);
   for(const action of data.client.actions){await expect(request).toContainText(action);}
   await expect(page.getByLabel('Tenant namespace')).toBeDisabled();await expect(page.getByLabel('Workspace UUID')).toBeDisabled();
   expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
   await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();
   await page.waitForURL(url=>url.pathname==='/callback');expect(new URL(page.url()).pathname).toBe('/callback');
  });expect(checks).toBeGreaterThan(10);
  expect(b.callbacks).toHaveLength(1);const callback=new URL(b.callbacks[0]!.url);expect(b.callbacks[0]!.referrer).toBeNull();expect(callback.searchParams.get('state')).toBe(flow.state);expect(callback.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(callback.searchParams.has('error')).toBe(false);
  await flow.transport.finishAuth(callback.searchParams.get('code')!);expect((await flow.authProvider.tokens())?.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const client=new Client({name:'synthetic-browser-client',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(b.config.resource),{authProvider:flow.authProvider,fetch:flow.mappedFetch}));expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['memory_add','memory_delete','memory_get','memory_list','memory_search']);const capture=await client.callTool({name:'memory_add',arguments:{content:'Synthetic browser consent evidence',idempotency_key:'browser-consent-capture',threshold:1}});expect(capture.isError).not.toBe(true);const receipt=(capture.structuredContent as {data:{receipt_id:string}}).data;const read=await client.callTool({name:'memory_get',arguments:{kind:'receipt',id:receipt.receipt_id}});expect((read.structuredContent as {data:unknown}).data).toEqual(receipt);}finally{await client.close();}
  expect(b.witness.filter(r=>r.path==='/api/oauth/consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['POST',200]]);
 }finally{await b.close();}
},60000);

test('OAuth browser dialog dismissal preserves consent while explicit cancellation issues no credential',async()=>{
 const b=await consentBrowser();try{const flow=await b.begin();
  const checks=await b.run({...b.data,authorization:flow.authorization},{unchanged:async()=>{expect(b.witness.filter(r=>r.path==='/api/oauth/consent'&&r.method==='POST')).toHaveLength(0);return true;}},async({page,context,expect,data,action})=>{
   await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);
   await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Verify workspace',exact:true}).click();await page.getByRole('button',{name:'Review connection request',exact:true}).click();
   const approve=page.getByRole('button',{name:'Approve connection',exact:true});await approve.focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(approve).toBeFocused();expect(await action('unchanged')).toBe(true);
   await page.getByRole('button',{name:'Cancel connection',exact:true}).click();await page.waitForURL(url=>url.pathname==='/callback');expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied');expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  });expect(checks).toBeGreaterThan(4);expect(b.callbacks).toHaveLength(1);const callback=new URL(b.callbacks[0]!.url);expect(callback.searchParams.get('state')).toBe(flow.state);expect(b.callbacks[0]!.referrer).toBeNull();expect(await flow.authProvider.tokens()).toBeUndefined();
  const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.client_delegations WHERE group_id=${b.f.scope.groupId}`;expect(count.n).toBe(0);
 }finally{await b.close();}
},60000);
