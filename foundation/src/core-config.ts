import {createPublicKey,timingSafeEqual} from 'node:crypto';
import {isAbsolute,normalize} from 'node:path';
import {type BumblebeeScannerOptions} from './bumblebee-lease-api.ts';
import {type HumanConfig} from './authentication.ts';
export type EmbeddingConfig=Readonly<{provider:'openai';model:'text-embedding-3-small';dimensions:384}>;
export type OAuthConfig=Readonly<{host:'127.0.0.1';port:number;issuer:string;resource:string;consentOrigin:string;client:Readonly<{clientId:string;name:string;redirectUris:readonly string[];actions:readonly string[]}>}>;
export type CoreConfig={oauth?:OAuthConfig;host:'127.0.0.1';port:number;origin:string;mode:'human'|'machine-only';human:HumanConfig|undefined;databaseUrl:string;cursorKey:Uint8Array;embedding?:EmbeddingConfig;scanner?:BumblebeeScannerOptions;tls?:Readonly<{certificateFile:string;privateKeyFile:string}>};
export function parseCoreConfig(raw:unknown,environment:Readonly<Record<string,string|undefined>>):CoreConfig{
 try{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){throw new Error();}const input=raw as Record<string,unknown>;
  const mode=Object.hasOwn(input,'mode')?input.mode:'human';if(!['human','machine-only'].includes(mode as string)||!Number.isSafeInteger(input.port)||(input.port as number)<0||(input.port as number)>65535||typeof input.origin!=='string'){throw new Error();}
  const machineOnly=mode==='machine-only',allowed=machineOnly?['mode','origin','port','tls','scanner','embedding']:['mode','origin','issuer','audience','port','keys','scanner','tls','embedding','oauth'];
  if(Object.keys(input).some(k=>!allowed.includes(k))){throw new Error();}
  const origin=new URL(input.origin);if(origin.origin!==input.origin||origin.username||origin.password){throw new Error();}
  let human:HumanConfig|undefined;
  if(machineOnly){if(!['http:','https:'].includes(origin.protocol)||origin.hostname!=='127.0.0.1'||Number(origin.port||(origin.protocol==='https:'?'443':'80'))!==input.port){throw new Error();}}
  else{
   if(origin.protocol!=='https:'||typeof input.issuer!=='string'||typeof input.audience!=='string'||!input.audience.trim()||input.audience.length>1024||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(input.issuer)||new URL(input.issuer).origin!==input.issuer){throw new Error();}
   if(!Array.isArray(input.keys)||input.keys.length<1||input.keys.length>8){throw new Error();}const keys=new Map<string,ReturnType<typeof createPublicKey>>();
   for(const entry of input.keys){if(!entry||typeof entry!=='object'||Object.keys(entry).length!==2||typeof entry.kid!=='string'||entry.kid.length<1||entry.kid.length>128||keys.has(entry.kid)||typeof entry.pem!=='string'||entry.pem.length>8192||!entry.pem.startsWith('-----BEGIN PUBLIC KEY-----')||!entry.pem.trimEnd().endsWith('-----END PUBLIC KEY-----')){throw new Error();}const key=createPublicKey(entry.pem);if(key.type!=='public'||key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048){throw new Error();}keys.set(entry.kid,key);}
   human={issuer:input.issuer,audience:input.audience,keys};
  }
  const supplied=environment.ALLURA_DATABASE_URL;if(!supplied){throw new Error();}const database=new URL(supplied);if(!['postgres:','postgresql:'].includes(database.protocol)||!['127.0.0.1','[::1]'].includes(database.hostname)||database.username!=='allura_app'||!database.password||database.search||database.hash||!/^\/[a-z][a-z0-9_]{0,62}$/.test(database.pathname)){throw new Error();}
  const encoded=environment.ALLURA_CURSOR_KEY;if(!encoded){throw new Error();}const cursorKey=Buffer.from(encoded,'base64url');if(cursorKey.byteLength!==32||cursorKey.toString('base64url')!==encoded){throw new Error();}
  let tls:CoreConfig['tls'],scanner:CoreConfig['scanner'];
  if(Object.hasOwn(input,'tls')){const t=input.tls as Record<string,unknown>;if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).length!==2||Object.keys(t).some(k=>!['certificateFile','privateKeyFile'].includes(k))){throw new Error();}for(const v of Object.values(t)){if(typeof v!=='string'||v.length>4096||v.includes('\0')||!isAbsolute(v)||normalize(v)!==v){throw new Error();}}tls={certificateFile:t.certificateFile as string,privateKeyFile:t.privateKeyFile as string};}
  if(machineOnly&&((origin.protocol==='https:')!==!!tls)){throw new Error();}
  if(Object.hasOwn(input,'scanner')){const s=input.scanner as Record<string,unknown>;if(!tls||!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).length!==2||Object.keys(s).some(k=>!['leaseKeyRevision','redactionKeyRevision'].includes(k))||Object.values(s).some(v=>typeof v!=='string'||!/^[-a-zA-Z0-9._:]{1,64}$/.test(v))){throw new Error();}
   const key=(name:string)=>{const text=environment[name];if(!text){throw new Error();}const bytes=Buffer.from(text,'base64url');if(bytes.length!==32||bytes.toString('base64url')!==text||timingSafeEqual(bytes,cursorKey)){throw new Error();}return bytes;},leaseKey=key('ALLURA_BUMBLEBEE_LEASE_KEY'),redactionKey=key('ALLURA_BUMBLEBEE_REDACTION_KEY');if(timingSafeEqual(leaseKey,redactionKey)){throw new Error();}scanner={leaseKey,redactionKey,keyRevision:s.leaseKeyRevision as string,redactionKeyRevision:s.redactionKeyRevision as string};
  }
  let embedding:EmbeddingConfig|undefined;
  if(Object.hasOwn(input,'embedding')){const e=input.embedding as Record<string,unknown>;if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).length!==3||e.provider!=='openai'||e.model!=='text-embedding-3-small'||e.dimensions!==384||!environment.ALLURA_OPENAI_API_KEY||!/^[\x21-\x7e]{1,4096}$/.test(environment.ALLURA_OPENAI_API_KEY)){throw new Error();}embedding={provider:'openai',model:'text-embedding-3-small',dimensions:384};}
  let oauth:OAuthConfig|undefined;
  if(Object.hasOwn(input,'oauth')){
   const o=input.oauth as Record<string,unknown>;
   if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==5||Object.keys(o).some(k=>!['port','issuer','resource','consentOrigin','client'].includes(k))||!Number.isSafeInteger(o.port)||(o.port as number)<1||(o.port as number)>65535||o.port===input.port||o.issuer!==`http://127.0.0.1:${o.port}`||o.resource!==`${input.origin}/mcp`||o.consentOrigin!==input.origin){throw new Error();}
   const c=o.client as Record<string,unknown>;
   if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==4||Object.keys(c).some(k=>!['clientId','name','redirectUris','actions'].includes(k))||typeof c.clientId!=='string'||!/^[-a-zA-Z0-9._:]{1,128}$/.test(c.clientId)||typeof c.name!=='string'||!c.name.trim()||c.name.length>128||/[\x00-\x1f\x7f]/.test(c.name)){throw new Error();}
   if(!Array.isArray(c.redirectUris)||c.redirectUris.length<1||c.redirectUris.length>8||new Set(c.redirectUris).size!==c.redirectUris.length){throw new Error();}
   for(const uri of c.redirectUris){if(typeof uri!=='string'||uri.length>2048||uri.includes('#')||/[\x00-\x20\\]/.test(uri)){throw new Error();}const u=new URL(uri);if(u.href!==uri||u.username||u.password||!(u.protocol==='https:'||(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port))||u.search){throw new Error();}}
   const ceiling=['memory:read','memory:capture','evidence:read','proposal:write','review:read','memory:delete','audit:read','health:read','memory:selected:read'];
   if(!Array.isArray(c.actions)||c.actions.length<1||c.actions.length>ceiling.length||new Set(c.actions).size!==c.actions.length||c.actions.some(v=>!ceiling.includes(v))){throw new Error();}
   oauth=Object.freeze({host:'127.0.0.1',port:o.port as number,issuer:o.issuer as string,resource:o.resource as string,consentOrigin:o.consentOrigin as string,client:Object.freeze({clientId:c.clientId,name:c.name,redirectUris:Object.freeze([...c.redirectUris]) as readonly string[],actions:Object.freeze([...c.actions]) as readonly string[]})});
  }
  return {host:'127.0.0.1',port:input.port as number,origin:input.origin,mode:mode as CoreConfig['mode'],human,databaseUrl:supplied,cursorKey,...(oauth?{oauth}:{}),...(embedding?{embedding}:{}),...(tls?{tls}:{}),...(scanner?{scanner}:{})};
 }catch{throw new Error('core_configuration_invalid');}
}
