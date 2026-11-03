import {SQL} from 'bun';
import {readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseCoreConfig} from './core-config.ts';
import {verifyCoreRelease} from './core-release.ts';
import {createCoreGateway} from './core-api.ts';
import {createDashboardHandler} from './dashboard-server.ts';
import {join} from 'node:path';
import {loadLocalEmbedder} from './embedding.ts';
import {loadCoreTls} from './core-tls.ts';
import {BUMBLEBEE} from './bumblebee-contract.ts';
const root=fileURLToPath(new URL('..',import.meta.url));
async function main(){
 const deadline=setTimeout(()=>{console.error(JSON.stringify({outcome:'unavailable',reason:'core_start_timeout'}));process.exit(1);},30000);
 let sql:SQL|undefined;
 try{
  if(process.argv.length!==3||Bun.version!=='1.3.14'){throw new Error();}const release=await verifyCoreRelease(root),metadata=await lstat(process.argv[2]!);if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>65536){throw new Error();}
  const config=parseCoreConfig(JSON.parse(await readFile(process.argv[2]!,'utf8')),process.env),tls=config.tls?await loadCoreTls(config.tls):undefined;sql=new SQL(config.databaseUrl,{max:16,connectionTimeout:5,idleTimeout:30});
  const roles=await sql`SELECT current_user AS name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolinherit,EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS memberships,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='allura' AND c.relowner=r.oid) AS owns FROM pg_roles r WHERE rolname=current_user`;
  const role=roles[0];if(!role||role.name!=='allura_app'||role.rolsuper||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolinherit||role.memberships||role.owns){throw new Error();}
  const schema=await sql`SELECT to_regclass('allura.events') IS NOT NULL AND to_regclass('allura.semantic_versions') IS NOT NULL AND to_regclass('allura.source_vectors') IS NOT NULL AND to_regclass('allura.operation_observations') IS NOT NULL AS ready`;if(!schema[0]?.ready){throw new Error();}
  const provider=await loadLocalEmbedder(),handler=await createDashboardHandler(createCoreGateway(sql,config.human,config.origin,config.cursorKey,provider,undefined,config.scanner),join(root,'dashboard'));
  const server=Bun.serve({hostname:config.host,port:config.port,...(tls?{tls}:{}),maxRequestBodySize:config.scanner?BUMBLEBEE.maxWireBytes:65536,idleTimeout:10,fetch:handler,error:()=>Response.json({outcome:'unavailable'},{status:503})});clearTimeout(deadline);
  console.log(JSON.stringify({event:'listening',host:config.host,port:server.port,contract:release.contract,sourceHead:release.sourceHead,sourceDirty:release.sourceDirty}));
  let stopping=false;const stop=async()=>{if(stopping){return;}stopping=true;const limit=setTimeout(()=>process.exit(1),5000);try{await server.stop();await sql!.close();clearTimeout(limit);process.exit(0);}catch{process.exit(1);}};
  process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
 }catch{clearTimeout(deadline);if(sql){await sql.close().catch(()=>{});}console.error(JSON.stringify({outcome:'unavailable',reason:'core_start_failed'}));process.exit(1);}
}
if(import.meta.main){await main();}
