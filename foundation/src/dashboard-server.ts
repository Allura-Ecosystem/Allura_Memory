import {readdir,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {DASHBOARD_ROUTES} from './dashboard-contract.ts';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Allura Memory</title><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';
export async function createDashboardHandler(api:(request:Request)=>Promise<Response>,directory:string):(Promise<(request:Request)=>Promise<Response>>){
 const assets=new Map<string,{bytes:Uint8Array;type:string}>();const names=await readdir(directory);if(names.length>32){throw new Error('dashboard_assets_invalid');}
 for(const name of names){if(!/^[A-Za-z0-9_.-]+\.(js|css|woff2|png)$/.test(name)){throw new Error('dashboard_assets_invalid');}const path=join(directory,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024){throw new Error('dashboard_assets_invalid');}const ext=name.split('.').at(-1)!;assets.set('/assets/'+name,{bytes:await readFile(path),type:({js:'text/javascript',css:'text/css',woff2:'font/woff2',png:'image/png'} as Record<string,string>)[ext]!});}
 if(!assets.has('/assets/app.js')||!assets.has('/assets/app.css')||!assets.has('/assets/allura-lettermark.png')){throw new Error('dashboard_assets_invalid');}
 return async request=>{
  const url=new URL(request.url);if(request.url.length>2048){return new Response(null,{status:414,headers});}
  if(request.method==='GET'){
   const asset=assets.get(url.pathname);if(asset){return new Response(new Uint8Array(asset.bytes).buffer,{headers:{...headers,'Content-Type':asset.type}});}
   if(DASHBOARD_ROUTES.some(route=>route.path===url.pathname)||['/dashboard/search','/dashboard/apps/bumblebee','/dashboard/apps/memory-review'].includes(url.pathname)){return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});}
  }
  return api(request);
 };
}
