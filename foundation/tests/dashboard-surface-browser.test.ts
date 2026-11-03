import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {operatorBrowser} from './dashboard-browser-fixture.ts';
import {DASHBOARD_ROUTES} from '../src/dashboard-contract.ts';
import {capture} from '../src/capture.ts';
import {submitProposal} from '../src/proposals.ts';
import {decideProposal} from '../src/decisions.ts';

test('operator route viewport matrix has named readable controls and no document overflow',async()=>{
 const b=await operatorBrowser(),{f}=b;
 try{
  const event=JSON.parse(await capture(f.app,f.identities.machine,f.scope,{content:'Surface matrix source',idempotency_key:randomUUID()})).event_id;
  const p=await submitProposal(f.app,f.identities.machine,f.scope,{summary:'Surface matrix approved guidance',assertionKind:'observation',evidenceIds:[event]});await decideProposal(f.app,f.identities.reviewer,f.scope,{proposalId:p.id,reviewedProposalVersion:1,decision:'approve',rationale:'Independent fixture decision',evidenceIds:[event],operationKey:randomUUID()});
  const checks=await b.run({...b.data,routes:DASHBOARD_ROUTES,widths:[1440,820,390],evidence:process.env.ALLURA_UI_EVIDENCE??b.dir},{},async({page,context,expect,data,fs,path})=>{
   const {AxeBuilder}=await import('@axe-core/playwright');await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await fs.mkdir(data.evidence,{recursive:true});const observations:{page:string;width:number;buttons:number;screenshot:string;axePasses:number;axeIncomplete:string[]}[]=[];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));
   for(const width of data.widths){await page.setViewportSize({width,height:1000});for(const route of data.routes){
    await page.goto(data.origin+route.path);await expect(page.getByRole('heading',{name:route.label,exact:true})).toBeVisible();await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Open workspace',exact:true}).click();await expect(page.getByText(route.page==='embeddings'?'Degraded service result. Inspect observed paths and readiness; completeness is not assured.':'Fetched from the authorized service. Not a live stream.',{exact:true})).toBeVisible();if(route.page==='graph'){await expect(page.getByText('Current scoped graph loaded. This is a bounded slice, not the whole workspace.',{exact:true})).toBeVisible();}
    expect(await page.getByRole('heading',{name:'This view could not be shown',exact:true}).count()).toBe(0);expect(errors).toEqual([]);
    const size=await page.locator('html').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(size.scroll).toBeLessThanOrEqual(size.width);if(route.page==='graph'){expect((await page.getByLabel('Root semantic UUID (optional)',{exact:true}).boundingBox())!.width).toBeGreaterThanOrEqual(140);expect((await page.getByLabel('Neighborhood depth',{exact:true}).boundingBox())!.width).toBeGreaterThanOrEqual(100);}
    const buttons=page.locator('button:visible'),count=await buttons.count();expect(count).toBeGreaterThan(0);for(let i=0;i<count;i++){const button=buttons.nth(i);expect(((await button.getAttribute('aria-label'))??await button.innerText()).trim().length).toBeGreaterThan(0);expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
    if(width===390){await expect(page.getByText('Menu',{exact:true})).toBeVisible();if(route.page==='graph'){await expect(page.getByRole('button',{name:'List',exact:true})).toHaveAttribute('aria-pressed','true');}}
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();await fs.writeFile(path.join(data.evidence,`axe-${width}-${route.page}.json`),JSON.stringify(scan,null,2));expect(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);expect(scan.passes.length).toBeGreaterThan(0);
    const screenshot=`surface-${width}-${route.page}.png`;await page.screenshot({path:path.join(data.evidence,screenshot),fullPage:true});observations.push({page:route.page,width,buttons:count,screenshot,axePasses:scan.passes.length,axeIncomplete:scan.incomplete.map(v=>v.id)});
   }}
   expect(observations.length).toBe(data.routes.length*data.widths.length);expect(new Set(observations.map(x=>`${x.page}/${x.width}`)).size).toBe(observations.length);await fs.writeFile(path.join(data.evidence,'surface-observations.json'),JSON.stringify({kind:'local-synthetic-browser-evidence',humanAcceptance:false,observations},null,2));
  });expect(checks).toBeGreaterThanOrEqual(DASHBOARD_ROUTES.length*3*5);
 }finally{await b.close();}
},90000);

test('operator keyboard dialog cancels without writes and restores focus in forced colors',async()=>{
 const b=await operatorBrowser(),{f}=b;
 try{
  const checks=await b.run({...b.data,evidence:process.env.ALLURA_UI_EVIDENCE??b.dir},{unchanged:async()=>{expect(Number((await f.owner`SELECT count(*) AS n FROM allura.access_requests WHERE group_id=${f.scope.groupId}`)[0].n)).toBe(0);return true;}},async({page,context,expect,data,action,fs,path})=>{
   const {AxeBuilder}=await import('@axe-core/playwright');await context.addCookies([{name:'CF_Authorization',value:data.tokens.author,url:data.origin,httpOnly:true,secure:true,sameSite:'Strict'}]);await page.setViewportSize({width:390,height:844});await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.goto(data.origin+'/dashboard/settings');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
   await page.getByLabel('Tenant namespace').fill(data.scope.groupId);await page.getByLabel('Workspace UUID').fill(data.scope.workspaceId);await page.getByRole('button',{name:'Open workspace',exact:true}).click();await expect(page.getByText('Fetched from the authorized service. Not a live stream.',{exact:true})).toBeVisible();await page.getByLabel('Access reason',{exact:true}).fill('Keyboard cancellation must not submit');const trigger=page.getByRole('button',{name:'Review access action',exact:true});await trigger.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('alertdialog',{name:'Confirm governed access action',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();for(let i=0;i<6;i++){await page.keyboard.press(i%2?'Shift+Tab':'Tab');expect(await dialog.evaluate(el=>el.contains(el.ownerDocument.activeElement))).toBe(true);}
   const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(scan.violations.map(v=>v.id)).toEqual([]);await fs.mkdir(data.evidence,{recursive:true});await fs.writeFile(path.join(data.evidence,'axe-keyboard-dialog.json'),JSON.stringify(scan,null,2));await page.screenshot({path:path.join(data.evidence,'keyboard-dialog-forced-colors.png'),fullPage:true});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();expect(await action('unchanged')).toBe(true);
   await page.getByText('Menu',{exact:true}).focus();await page.keyboard.press('Enter');const link=page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Company Knowledge',exact:true});await link.focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Company Knowledge',exact:true})).toBeVisible();expect(await page.locator('details[open]').count()).toBe(0);await expect(page.getByText('No records returned in this bounded result.',{exact:true})).toBeVisible();
  });expect(checks).toBeGreaterThanOrEqual(18);
 }finally{await b.close();}
},90000);
