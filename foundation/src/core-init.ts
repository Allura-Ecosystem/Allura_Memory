import {SQL} from 'bun';
import {fileURLToPath} from 'node:url';
import {verifyCoreRelease} from './core-release.ts';
import {migrate} from './persistence.ts';
async function main(){
 const deadline=setTimeout(()=>{console.error(JSON.stringify({outcome:'unavailable',reason:'core_initialization_timeout'}));process.exit(1);},30000);let owner:SQL|undefined;
 try{
  if(process.argv.length!==2||Bun.version!=='1.3.14'){throw new Error();}await verifyCoreRelease(fileURLToPath(new URL('..',import.meta.url)));
  const supplied=process.env.ALLURA_INIT_DATABASE_URL,password=process.env.ALLURA_INIT_APP_PASSWORD;if(!supplied||!password||!/^[a-f0-9]{64}$/.test(password)){throw new Error();}const url=new URL(supplied);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username!=='postgres'||!url.password||url.search||url.hash||!/^\/[a-z][a-z0-9_]{0,62}$/.test(url.pathname)||['/postgres','/template0','/template1'].includes(url.pathname)){throw new Error();}
  owner=new SQL(supplied,{max:1,connectionTimeout:5});await owner.unsafe("SET statement_timeout='15000'; SELECT pg_advisory_lock(20861027)");
  const [existing]=await owner`SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname<>'public' AND nspname<>'information_schema' AND nspname !~ '^pg_') OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') OR EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='allura_app') AS occupied`;
  if(existing?.occupied){throw new Error();}if(await migrate(owner)!=='applied'){throw new Error();}
  await owner.unsafe(`ALTER ROLE allura_app LOGIN PASSWORD '${password}'`);console.log(JSON.stringify({event:'initialized',knowledge:'empty',principals:'empty',authority:'none_provisioned'}));
 }catch{console.error(JSON.stringify({outcome:'unavailable',reason:'core_initialization_failed'}));process.exitCode=1;}finally{if(owner){await owner.close().catch(()=>{});}clearTimeout(deadline);}
}
if(import.meta.main){await main();}
