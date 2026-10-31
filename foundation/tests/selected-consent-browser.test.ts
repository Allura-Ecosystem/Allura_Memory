import {test,expect} from 'bun:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {selectedConsentBrowser} from './selected-consent-browser-fixture.ts';

test('selected browser SDK discovery approves grantless exact consent and reads only the approved version',async()=>{
 const b=await selectedConsentBrowser();try{
  const flow=await b.begin();
  const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
   await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
   await page.goto(data.authorization);
   expect(new URL(page.url()).pathname).toBe('/dashboard/oauth/selected-consent');
   await expect(page.getByRole('heading',{name:'Connect an app',exact:true})).toBeVisible();
   await expect(page.getByText(data.client.name,{exact:true})).toHaveCount(0);
   await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);
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
  const client=new Client({name:'synthetic-browser-client',version:'1'});try{await client.connect(new StreamableHTTPClientTransport(new URL(b.config.resource),{authProvider:flow.authProvider,fetch:flow.mappedFetch}));expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['memory_add','memory_delete','memory_get','memory_list','memory_search']);await client.ping();const read=await client.callTool({name:'memory_get',arguments:{kind:'selected',id:b.memory.id}});const data={memory:b.memory};expect(read.isError).not.toBe(true);expect(read.content).toEqual([{type:'text',text:JSON.stringify(data)}]);expect(read.structuredContent).toEqual({contract:'allura-consumer-v1',data});}finally{await client.close();}
  expect(b.witness.some(r=>r.path==='/api/dashboard/context')).toBe(false);
  expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['POST',200]]);
 }finally{await b.close();}
},60000);


test('selected browser denies absent invalid expired mixed bearer no share and foreign scope before display',async()=>{
 const b=await selectedConsentBrowser();try{
  const flows=[];for(let i=0;i<9;i++){flows.push((await b.begin()).authorization);}
  const checks=await b.run({...b.data,flows},{},async({page,context,expect,data})=>{
   const cases=[{token:''},{token:'invalid'},{token:data.tokens.curator},{token:data.tokens.viewer,foreign:true},{token:data.tokens.viewer,mixed:true},{token:data.tokens.viewer,bearer:true},{token:'',bearer:true},{token:data.tokens.viewer,malformed:true},{token:data.tokens.expired}];
   for(const [i,item] of cases.entries()){
    await context.clearCookies();await page.setExtraHTTPHeaders({});if(item.token){await context.addCookies([{name:'CF_Authorization',value:item.token,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);}
    await page.goto(data.flows[i]!);await page.setExtraHTTPHeaders(item.mixed?{'Cf-Access-Jwt-Assertion':data.tokens.reviewer}:item.bearer?{Authorization:'Bearer synthetic-invalid'}:{});
    await page.getByLabel('Tenant namespace').fill(item.malformed?'bad':data.scope.groupId);await page.getByLabel('Workspace UUID').fill(item.foreign?data.foreignWorkspace:data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeDisabled();
   }
  });expect(checks).toBe(27);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>r.status)).toEqual([401,401,403,403,401,401,401,401]);
  const [counts]=await b.f.owner`SELECT (SELECT count(*)::int FROM allura.selected_credentials WHERE group_id=${b.f.scope.groupId}) AS credentials,(SELECT count(*)::int FROM allura.workspace_grants WHERE group_id=${b.f.scope.groupId} AND principal_id IN (${b.f.ids.viewer},${b.f.ids.curator})) AS grants,(SELECT count(*)::int FROM allura.memory_shares WHERE group_id=${b.f.scope.groupId}) AS shares`;
  expect(counts).toEqual({credentials:0,grants:0,shares:1});
 }finally{await b.close();}
},60000);

test('selected browser display bindings reject tamper swapped session cross site replay and expiry without issuance',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{newSession:async()=>{await Bun.sleep(1100);return b.f.jwt('viewer');},expire:async()=>{await b.f.owner`UPDATE allura.oauth_transactions SET expires_at=clock_timestamp()-interval '1 second' WHERE group_id=${b.f.scope.groupId}`;return true;}},async({page,context,expect,data,action})=>{
  const signIn=async(token:string)=>{await context.clearCookies();await context.addCookies([{name:'CF_Authorization',value:token,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);};await signIn(data.tokens.viewer);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/oauth/selected-consent');await page.getByRole('button',{name:'Review connection request',exact:true}).click();const response=await pending,shown=await response.json() as Record<string,unknown>,url=response.url();
  const post=(body:Record<string,unknown>,origin=data.origin)=>context.request.post(url,{headers:{Origin:origin,'Sec-Fetch-Site':origin===data.origin?'same-origin':'cross-site'},data:body});const approved={...shown,decision:'approve'};
  expect((await context.request.get(url)).status()).toBe(403);
  for(const edit of [{mode:'owner'},{connectionId:data.foreignWorkspace},{redirectUri:'https://foreign.invalid/callback'},{groupId:'allura-foreign'},{nonce:'x'.repeat(43)},{clientId:'foreign'},{actions:['memory:delete']},{workspaceId:data.foreignWorkspace},{name:'tampered'},{transaction:'x'.repeat(43)}]){expect([400,403]).toContain((await post({...approved,...edit})).status());}
  expect((await post(approved,'https://foreign.invalid')).status()).toBe(403);await signIn(data.tokens.reviewer);expect((await post(approved)).status()).toBe(403);await signIn(String(await action('newSession')));expect((await post(approved)).status()).toBe(403);await signIn(data.tokens.viewer);
  expect(await page.locator('main').innerText()).not.toContain(String(shown.nonce));expect(await page.locator('main').innerText()).not.toContain(String(shown.transaction));
  await action('expire');await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);
 });expect(checks).toBe(18);expect(b.callbacks).toHaveLength(0);const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.oauth_transactions WHERE group_id=${b.f.scope.groupId} AND code_digest IS NOT NULL`;expect(count.n).toBe(0);
 }finally{await b.close();}
},60000);

test('selected browser rechecks share issuer recipient and workspace loss for approval and cancellation',async()=>{
 const b=await selectedConsentBrowser();try{
  const mutations=[
   ['share',()=>b.f.owner`UPDATE allura.memory_shares SET active=false WHERE group_id=${b.f.scope.groupId}`,()=>b.f.owner`UPDATE allura.memory_shares SET active=true WHERE group_id=${b.f.scope.groupId}`],
   ['issuer',()=>b.f.owner`UPDATE allura.workspace_grants SET active=false WHERE principal_id=${b.f.ids.author}`,()=>b.f.owner`UPDATE allura.workspace_grants SET active=true WHERE principal_id=${b.f.ids.author}`],
   ['issuer-binding',()=>b.f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${b.f.ids.author}`,()=>b.f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${b.f.ids.author}`],
   ['recipient-binding',()=>b.f.owner`UPDATE allura.identity_bindings SET active=false WHERE principal_id=${b.f.ids.viewer}`,()=>b.f.owner`UPDATE allura.identity_bindings SET active=true WHERE principal_id=${b.f.ids.viewer}`],
   ['recipient-membership',()=>b.f.owner`UPDATE allura.memberships SET active=false WHERE principal_id=${b.f.ids.viewer}`,()=>b.f.owner`UPDATE allura.memberships SET active=true WHERE principal_id=${b.f.ids.viewer}`],
   ['workspace',()=>b.f.owner`UPDATE allura.workspaces SET locked=true WHERE group_id=${b.f.scope.groupId}`,()=>b.f.owner`UPDATE allura.workspaces SET locked=false WHERE group_id=${b.f.scope.groupId}`]
  ] as const;
  const flows=[];for(const [name] of mutations){for(const decision of ['approve','cancel']){flows.push({name,decision,authorization:(await b.begin()).authorization});}}
  const actions:Record<string,()=>Promise<unknown>>={};for(const [name,lose,restore] of mutations){actions[name]=async()=>{await lose();return true;};actions[name+'-restore']=async()=>{await restore();return true;};}
  const checks=await b.run({...b.data,flows},actions,async({page,context,expect,data,action})=>{
   await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
   for(const flow of data.flows){await page.goto(flow.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();await action(flow.name);
    if(flow.decision==='approve'){await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();}else{await page.getByRole('button',{name:'Cancel connection',exact:true}).click();}
    await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await action(flow.name+'-restore');
   }
  });expect(checks).toBe(36);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent'&&r.method==='POST').map(r=>r.status)).toEqual(Array(12).fill(403));
  expect((await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_connections WHERE group_id=${b.f.scope.groupId}`)[0].n).toBe(0);
 }finally{await b.close();}
},60000);

test('selected browser real back navigation discards private consent without resubmission',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  await page.goto(data.origin+'/dashboard');await page.goBack();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeDisabled();
 });expect(checks).toBe(4);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>r.method)).toEqual(['GET']);expect(b.callbacks).toHaveLength(0);
 }finally{await b.close();}
},60000);

test('selected browser history restoration clears private request and cannot resurrect a decision',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  await page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));");
  await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeDisabled();
 });expect(checks).toBe(6);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>r.method)).toEqual(['GET']);expect(b.callbacks).toHaveLength(0);}finally{await b.close();}
},60000);

test('selected browser duplicate display tabs and competing decisions have one effective approval',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);const url=page.url();
  await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);
  await page.evaluate("(()=>{const f=document.querySelector('form');f.requestSubmit();f.requestSubmit();})()");await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  const other=await context.newPage();await other.goto(url);await other.getByLabel('Tenant namespace').fill(data.scope.groupId);await other.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await other.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(other.getByRole('alert')).toContainText('fresh authorization');await expect(other.getByRole('region',{name:'Connection request'})).toHaveCount(0);await other.close();
  await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.evaluate("(()=>{const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm decision');const cancel=[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel connection');confirm.click();confirm.click();cancel.click();})()");await page.waitForURL(u=>u.pathname==='/callback');expect(new URL(page.url()).searchParams.has('code')).toBe(true);
 });expect(checks).toBe(4);expect(b.callbacks).toHaveLength(1);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['GET',403],['POST',200]]);
 expect((await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_connections WHERE group_id=${b.f.scope.groupId}`)[0].n).toBe(1);
 expect((await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_credentials WHERE group_id=${b.f.scope.groupId}`)[0].n).toBe(0);
 }finally{await b.close();}
},60000);

test('selected browser lost display or decision responses clear private state and never retry or navigate',async()=>{
 const b=await selectedConsentBrowser();try{const flows=[(await b.begin()).authorization,(await b.begin()).authorization];const checks=await b.run({...b.data,flows},{loseGET:async()=>{b.lose('GET');return true;},losePOST:async()=>{b.lose('POST');return true;}},async({page,context,expect,data,action})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const [i,method] of ['GET','POST'].entries()){await page.goto(data.flows[i]!);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await action('lose'+method);await page.getByRole('button',{name:'Review connection request',exact:true}).click();if(method==='POST'){await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm decision');button.click();button.click();})()");}await expect(page.getByRole('alert')).toContainText('No success or rollback is inferred');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:/Retry/})).toHaveCount(0);expect(new URL(page.url()).pathname).toBe('/dashboard/oauth/selected-consent');}
 });expect(checks).toBe(10);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['GET',200],['POST',200]]);const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_credentials WHERE group_id=${b.f.scope.groupId}`;expect(count.n).toBe(0);const [pending]=await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_connections WHERE group_id=${b.f.scope.groupId}`;expect(pending.n).toBe(1);const [frozen]=await b.f.owner`SELECT count(*)::int AS n FROM allura.oauth_transactions WHERE group_id=${b.f.scope.groupId} AND nonce_digest IS NOT NULL`;expect(frozen.n).toBe(1);expect([...await b.f.owner`SELECT status,nonce_digest IS NULL AS consumed,code_digest IS NOT NULL AS coded FROM allura.oauth_transactions WHERE group_id=${b.f.scope.groupId} ORDER BY status`]).toEqual([{status:'approved',consumed:true,coded:true},{status:'displayed',consumed:false,coded:false}]);
 }finally{await b.close();}
},60000);

test('selected browser exact request wraps at desktop and phone with readable named controls',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();const checks=await b.run({...b.data,authorization:flow.authorization},{},async({page,context,expect,data})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('region',{name:'Connection request'})).toBeVisible();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});const layout=await page.evaluate<{width:number;scroll:number;font:string;wrap:string;controls:{height:number;width:number}[]}>(`({width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('code')).fontFamily,background:getComputedStyle(document.body).backgroundColor,controls:[...document.querySelectorAll('button,input')].map(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),wrap:getComputedStyle(document.querySelector('dd')).overflowWrap})`);expect(layout.scroll).toBeLessThanOrEqual(layout.width);expect(layout.font).toContain('IBM Plex Mono');expect(layout.wrap).toBe('anywhere');for(const control of layout.controls){expect(control.height).toBeGreaterThanOrEqual(44);expect(control.width).toBeGreaterThan(0);}await expect(page.getByRole('region',{name:'Connection request'})).toContainText(data.redirect);}
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});const approve=page.getByRole('button',{name:'Approve connection',exact:true});await approve.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(approve).toBeFocused();expect(await page.evaluate("getComputedStyle(document.activeElement).outlineStyle")).not.toBe('none');expect(await page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")).toBe(true);
  expect(await page.locator('main script').count()).toBe(0);expect(await page.evaluate('({local:localStorage.length,session:sessionStorage.length})')).toEqual({local:0,session:0});
 });expect(checks).toBeGreaterThan(30);}finally{await b.close();}
},60000);

test('selected browser disabled APIs deny private consent and machine only mode has no dashboard',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();await b.disable();const checks=await b.run({...b.data,authorization:flow.authorization},{machine:async()=>{await b.disable('machine-only');return true;}},async({page,context,expect,data,action})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);const url=page.url();await expect(page.getByRole('heading',{name:'Connect an app'})).toBeVisible();await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await action('machine');expect((await page.goto(url))?.status()).toBe(404);await expect(page.getByRole('heading',{name:'Connect an app'})).toHaveCount(0);
 });expect(checks).toBe(5);expect(b.callbacks).toHaveLength(0);}finally{await b.close();}
},60000);

test('selected browser delayed real responses cannot resurrect state after lifecycle discard',async()=>{
 const b=await selectedConsentBrowser();try{const flows=[(await b.begin()).authorization,(await b.begin()).authorization];
 const checks=await b.run({...b.data,flows},{delayGET:async()=>{b.delay('GET');return true;},delayPOST:async()=>{b.delay('POST');return true;},arrived:async()=>{for(let i=0;i<100&&!b.delayed();i++){await Bun.sleep(10);}if(!b.delayed()){throw new Error('handler_not_observed');}return true;},release:async()=>{b.release();return true;}},async({page,context,expect,data,action})=>{
  await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const [i,method] of ['GET','POST'].entries()){await page.goto(data.flows[i]!);await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await action('delay'+method);await page.getByRole('button',{name:'Review connection request',exact:true}).click();if(method==='POST'){await page.getByRole('button',{name:'Approve connection',exact:true}).click();await page.getByRole('button',{name:'Confirm decision',exact:true}).click();}expect(await action('arrived')).toBe(true);await page.evaluate("window.dispatchEvent(new PopStateEvent('popstate'))");await action('release');await expect(page.getByRole('alert')).toContainText('fresh authorization');await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toBeDisabled();expect(new URL(page.url()).pathname).toBe('/dashboard/oauth/selected-consent');}
 });expect(checks).toBe(10);expect(b.callbacks).toHaveLength(0);expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent').map(r=>[r.method,r.status])).toEqual([['GET',200],['GET',200],['POST',200]]);expect((await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_credentials WHERE group_id=${b.f.scope.groupId}`)[0].n).toBe(0);
 }finally{await b.close();}
},60000);

test('selected browser malformed navigation remains neutral without requesting private display',async()=>{
 const b=await selectedConsentBrowser();try{const checks=await b.run(b.data,{},async({page,expect,data})=>{
  const base=data.origin+'/dashboard/oauth/selected-consent',transaction='t'.repeat(43);
  for(const suffix of ['', '?transaction=short','?transaction='+transaction+'&transaction='+transaction,'?transaction='+transaction+'&extra=1','?transaction='+transaction+'#hidden']){await page.goto(base+suffix);await expect(page.getByRole('alert')).toContainText('Invalid connection request');await expect(page.getByRole('button',{name:'Review connection request',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Connection request'})).toHaveCount(0);}
 });expect(checks).toBe(15);expect(b.witness.filter(r=>r.path.startsWith('/api/'))).toHaveLength(0);expect(b.callbacks).toHaveLength(0);
 }finally{await b.close();}
},60000);

test('selected browser dialog dismissal preserves consent while explicit cancellation issues no credential',async()=>{
 const b=await selectedConsentBrowser();try{const flow=await b.begin();
  const checks=await b.run({...b.data,authorization:flow.authorization},{unchanged:async()=>{expect(b.witness.filter(r=>r.path==='/api/oauth/selected-consent'&&r.method==='POST')).toHaveLength(0);return true;}},async({page,context,expect,data,action})=>{
   await context.addCookies([{name:'CF_Authorization',value:data.tokens.viewer,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.goto(data.authorization);
   await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Review connection request',exact:true}).click();
   const approve=page.getByRole('button',{name:'Approve connection',exact:true});await approve.focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(approve).toBeFocused();expect(await action('unchanged')).toBe(true);
   await page.getByRole('button',{name:'Cancel connection',exact:true}).click();await page.waitForURL(url=>url.pathname==='/callback');expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied');expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  });expect(checks).toBeGreaterThan(4);expect(b.callbacks).toHaveLength(1);const callback=new URL(b.callbacks[0]!.url);expect(callback.searchParams.get('state')).toBe(flow.state);expect(b.callbacks[0]!.referrer).toBeNull();expect(await flow.authProvider.tokens()).toBeUndefined();
  const [count]=await b.f.owner`SELECT count(*)::int AS n FROM allura.selected_credentials WHERE group_id=${b.f.scope.groupId}`;expect(count.n).toBe(0);
 }finally{await b.close();}
},60000);