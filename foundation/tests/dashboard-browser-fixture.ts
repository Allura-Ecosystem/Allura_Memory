import {runBrowserScenario} from './browser-runtime.ts';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './lifecycle-fixture.ts';
import {createCoreGateway} from '../src/core-api.ts';
import {createDashboardHandler} from '../src/dashboard-server.ts';
import {buildDashboard} from '../scripts/build-dashboard.ts';
import {loadLocalEmbedder} from '../src/embedding.ts';
export async function operatorBrowser(){
 const f=await fixture(`allura-admin-ui-${randomUUID()}`),dir=await mkdtemp(join(tmpdir(),'allura-admin-ui-'));let server:ReturnType<typeof Bun.serve>|undefined;
 const close=async()=>{await server?.stop(true);await f.close();await rm(dir,{recursive:true,force:true});};
 try{
  const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');if(Bun.spawnSync(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdout:'pipe',stderr:'pipe'}).exitCode!==0){throw new Error('fixture_tls_unavailable');}
  const assets=join(dir,'assets');await buildDashboard(assets);let handler:(r:Request)=>Promise<Response>=async()=>new Response(null,{status:503});server=Bun.serve({hostname:'127.0.0.1',port:0,tls:{cert:Bun.file(cert),key:Bun.file(key)},fetch:r=>handler(r)});const origin=`https://127.0.0.1:${server.port}`;handler=await createDashboardHandler(createCoreGateway(f.app,f.humanConfig,origin,randomBytes(32),await loadLocalEmbedder()),assets);
  const data={origin,dir,scope:f.scope,tokens:{author:f.jwt('author'),reviewer:f.jwt('reviewer'),viewer:f.jwt('viewer'),curator:f.jwt('curator')}};return {f,dir,origin,data,run:runBrowserScenario,close};
 }catch(error){await close();throw error;}
}
