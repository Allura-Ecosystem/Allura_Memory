import type {Page,BrowserContext,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type * as fs from 'node:fs/promises';
import type * as path from 'node:path';
type Environment<T>={page:Page;context:BrowserContext;expect:typeof expect;data:T;action:(name:string)=>Promise<unknown>;fs:typeof fs;path:typeof path};
// All Playwright code runs on Node. Bun owns the real app and restricted DB.
// This private fixture-control listener is never bundled into the product.
// It exposes only explicitly supplied synthetic-fixture actions, not SQL/code.
export async function runBrowserScenario<T>(data:T,actions:Record<string,()=>Promise<unknown>>,scenario:(env:Environment<T>)=>Promise<void>):Promise<number>{
 const token=randomBytes(32).toString('hex');let actionFailure:unknown;
 const control=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  const name=new URL(request.url).pathname.slice(1);
  if(request.method!=='POST'||request.headers.get('authorization')!==`Bearer ${token}`||!Object.hasOwn(actions,name)){return new Response(null,{status:403});}
  try{return Response.json((await actions[name]!())??null);}catch(error){actionFailure=error;return new Response(null,{status:500});}
 }});
 const code=`import {chromium,expect as assertion} from '@playwright/test';import * as fs from 'node:fs/promises';import * as path from 'node:path';
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>131072)throw new Error('fixture_input_limit');}const {data,url,token}=JSON.parse(input);let browser,page;let checks=0;
 process.on('SIGTERM',async()=>{await browser?.close();process.exit(1)});
 try{browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'});page=await context.newPage();page.on('response',r=>{if(r.status()>=400)console.error('Fixture HTTP failure:',new URL(r.url()).pathname,r.status())});page.on('requestfailed',r=>console.error('Fixture request failure:',new URL(r.url()).pathname,r.failure()?.errorText));
 const expect=(...args)=>{checks++;return assertion(...args)};const action=async(name)=>{const response=await fetch(url+'/'+encodeURIComponent(name),{method:'POST',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('fixture_action_failed');return response.json()};
 await (${scenario.toString()})({page,context,expect,data,action,fs,path});console.log(JSON.stringify({browserAssertions:checks}));}catch(error){console.error('Synthetic fixture failure view:',await page?.locator('main').innerText().catch(()=>''));throw error;}finally{await browser?.close();}`;
 const child=Bun.spawn(['node','--input-type=module','-e',code],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdin:'pipe',stdout:'pipe',stderr:'inherit'});
 const deadline=setTimeout(()=>child.kill('SIGTERM'),60000),kill=setTimeout(()=>child.kill('SIGKILL'),65000);
 try{child.stdin.write(JSON.stringify({data,url:`http://127.0.0.1:${control.port}`,token}));child.stdin.end();const output=await new Response(child.stdout).text(),exit=await child.exited;
  if(actionFailure){throw actionFailure;}if(exit!==0||output.length>4096){throw new Error('browser_scenario_failed');}const result=JSON.parse(output);if(!Number.isSafeInteger(result.browserAssertions)||result.browserAssertions<1){throw new Error('browser_assertions_missing');}console.log(output.trim());return result.browserAssertions;
 }finally{clearTimeout(deadline);clearTimeout(kill);if(child.exitCode===null){child.kill('SIGKILL');await child.exited;}await control.stop(true);}
}
