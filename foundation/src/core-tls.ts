import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createSecureContext} from 'node:tls';
import {type CoreConfig} from './core-config.ts';
/** Explicit local TLS material only; no proxy-header inference or network lookup. */
export async function loadCoreTls(config:NonNullable<CoreConfig['tls']>):Promise<{cert:Buffer;key:Buffer}>{
 try{
  const read=async(path:string,secret:boolean)=>{
   if(await realpath(path)!==path){throw new Error();}const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
   try{const s=await handle.stat();if(!s.isFile()||s.size<1||s.size>65536||(secret&&((s.mode&0o077)!==0||s.uid!==process.getuid?.()))){throw new Error();}const bytes=Buffer.alloc(65537),{bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead!==s.size){throw new Error();}return bytes.subarray(0,bytesRead);}finally{await handle.close();}
  };
  const cert=await read(config.certificateFile,false),key=await read(config.privateKeyFile,true);createSecureContext({cert,key,minVersion:'TLSv1.2'});return {cert,key};
 }catch{throw new Error('core_tls_invalid');}
}
