import {SQL} from 'bun';
import {randomBytes,randomUUID} from 'node:crypto';
import {waitForRecoveryReady} from './recovery-readiness.ts';
export const RECOVERY_IMAGE='postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
export type RecoveryTarget=Readonly<{id:string}>;
type RecordState={name:string;volume:string;network:string;containerId:string;networkId:string;url:string;id:string};
const owned=new WeakMap<object,RecordState>();
function docker(args:string[]):string{const p=Bun.spawnSync(['docker',...args],{stdout:'pipe',stderr:'pipe',timeout:30000});if(p.exitCode!==0){throw new Error('recovery_docker_failed');}return p.stdout.toString().trim();}
function state(target:RecoveryTarget):RecordState{const value=owned.get(target);if(!value){throw new Error('recovery_target_denied');}return value;}
function verify(target:RecoveryTarget):RecordState{
 const value=state(target),actual=docker(['inspect','--format','{{.Id}} {{index .Config.Labels "allura.fixture"}} {{.Config.Image}}',value.name]);
 if(actual!==`${value.containerId} ${value.id} ${RECOVERY_IMAGE}`||docker(['volume','inspect','--format','{{index .Labels "allura.fixture"}}',value.volume])!==value.id||docker(['network','inspect','--format','{{.Id}} {{index .Labels "allura.fixture"}}',value.network])!==`${value.networkId} ${value.id}`){throw new Error('recovery_target_denied');}
 const mounts=JSON.parse(docker(['inspect','--format','{{json .Mounts}}',value.name])) as {Type:string;Name:string;Destination:string}[],networks=JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Networks}}',value.name])) as Record<string,unknown>;
 if(mounts.length!==1||mounts[0]?.Type!=='volume'||mounts[0]?.Name!==value.volume||mounts[0]?.Destination!=='/var/lib/postgresql/data'||Object.keys(networks).length!==1||!Object.hasOwn(networks,value.network)||docker(['inspect','--format','{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}} {{.HostConfig.Privileged}}',value.name])!==`${2*1024*1024*1024} ${1000000000} 128 false`){throw new Error('recovery_target_denied');}return value;
}
async function ready(value:RecordState):Promise<void>{
 await waitForRecoveryReady(async signal=>{
  const sql=new SQL(value.url,{connectionTimeout:1,max:1}),query=sql`SELECT 1`,cancel=()=>{query.cancel();};
  signal.addEventListener('abort',cancel,{once:true});
  try{signal.throwIfAborted();await query;}finally{signal.removeEventListener('abort',cancel);await sql.close({timeout:0});}
 });
}
export async function createRecoveryTarget():Promise<RecoveryTarget>{
 const id=randomUUID(),name=`allura-recovery-${id}`,volume=`${name}-data`,network=`${name}-net`,password=randomBytes(32).toString('hex');
 const value:RecordState={id,name,volume,network,containerId:'',networkId:'',url:''};let volumeCreated=false;
 try{
  value.networkId=docker(['network','create','--label',`allura.fixture=${id}`,network]);docker(['volume','create','--label',`allura.fixture=${id}`,volume]);volumeCreated=true;
  value.containerId=docker(['run','--detach','--name',name,'--label',`allura.fixture=${id}`,'--network',network,'--memory','2g','--cpus','1','--pids-limit','128','--publish','127.0.0.1::5432','--mount',`type=volume,source=${volume},target=/var/lib/postgresql/data`,'--env',`POSTGRES_PASSWORD=${password}`,'--env','POSTGRES_DB=allura_test',RECOVERY_IMAGE]);
  const binding=docker(['port',name,'5432/tcp']);if(!/^127\.0\.0\.1:\d+$/.test(binding)){throw new Error('recovery_target_denied');}value.url=`postgres://postgres:${password}@${binding}/allura_test`;
  const target=Object.freeze({id});owned.set(target,value);verify(target);await ready(value);return target;
 }catch(error){
  // Creation owns these exact freshly minted IDs; never discover by broad prefix.
  if(value.containerId&&docker(['inspect','--format','{{.Id}}',name])===value.containerId){docker(['rm','--force',name]);}
  if(volumeCreated&&docker(['volume','inspect','--format','{{index .Labels "allura.fixture"}}',volume])===id){docker(['volume','rm',volume]);}
  if(value.networkId&&docker(['network','inspect','--format','{{.Id}}',network])===value.networkId){docker(['network','rm',network]);}throw error;
 }
}
export async function recoveryConnection(target:RecoveryTarget):Promise<string>{return verify(target).url;}
export async function restartRecoveryTarget(target:RecoveryTarget):Promise<void>{const value=verify(target);docker(['restart','--time','2',value.name]);const binding=docker(['port',value.name,'5432/tcp']);if(!/^127\.0\.0\.1:\d+$/.test(binding)){throw new Error('recovery_target_denied');}const url=new URL(value.url);url.port=binding.split(':')[1]!;value.url=url.href;await ready(value);}
export async function closeRecoveryTarget(target:RecoveryTarget):Promise<void>{const value=verify(target);docker(['rm','--force',value.name]);docker(['volume','rm',value.volume]);docker(['network','rm',value.network]);owned.delete(target);}
export function startRecoveryDump(target:RecoveryTarget,timeoutMs:number,snapshot:string){if(!/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/.test(snapshot)){throw new Error('recovery_invalid');}const value=verify(target);return Bun.spawn(['docker','exec',value.name,'timeout','-k','1',`${timeoutMs/1000}`,'pg_dump','-U','postgres','-d','allura_test','--format=custom','--compress=0','--lock-wait-timeout=2000',`--snapshot=${snapshot}`],{stdin:'ignore',stdout:'pipe',stderr:'pipe',timeout:timeoutMs+5000});}
export function startRecoveryRestore(target:RecoveryTarget,snapshot:string){const value=verify(target);return Bun.spawn(['docker','exec','-i',value.name,'timeout','-k','1','60','pg_restore','-U','postgres','-d','allura_test','--no-owner','--single-transaction','--exit-on-error'],{stdin:Bun.file(snapshot),stdout:'pipe',stderr:'pipe',timeout:65000});}
