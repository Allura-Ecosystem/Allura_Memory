import {test,expect} from 'bun:test';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {parseCoreConfig} from '../src/core-config.ts';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const config={origin:'https://core.invalid',issuer:'https://core.cloudflareaccess.com',audience:'fixture',port:0,keys:[{kid:'fixture',pem:publicKey.export({type:'spki',format:'pem'}).toString()}]};
const environment={ALLURA_DATABASE_URL:'postgres://allura_app:synthetic-test-only@127.0.0.1:15432/allura_test',ALLURA_CURSOR_KEY:randomBytes(32).toString('base64url')};
test('core configuration binds loopback restricted login explicit origin and public RSA keys',()=>{
 const parsed=parseCoreConfig(config,environment);expect(parsed.host).toBe('127.0.0.1');expect(parsed.port).toBe(0);expect(parsed.human.keys.get('fixture')?.type).toBe('public');expect(parsed.cursorKey.byteLength).toBe(32);
 for(const input of [{...config,origin:'http://core.invalid'},{...config,origin:'https://core.invalid/path'},{...config,port:-1},{...config,port:Infinity},{...config,host:'0.0.0.0'},{...config,keys:[...config.keys,...config.keys]},{...config,keys:[{kid:'fixture',pem:privateKey.export({type:'pkcs8',format:'pem'}).toString()}]}]){expect(()=>parseCoreConfig(input,environment)).toThrow('core_configuration_invalid');}
});
test('core configuration rejects missing secrets owner credentials remote databases and silent defaults',()=>{
 for(const env of [{},{...environment,ALLURA_CURSOR_KEY:'bad'},{...environment,ALLURA_DATABASE_URL:'postgres://postgres:synthetic-test-only@127.0.0.1:15432/allura_test'},{...environment,ALLURA_DATABASE_URL:'postgres://allura_app:synthetic-test-only@foreign.invalid/allura_test'},{...environment,ALLURA_DATABASE_URL:environment.ALLURA_DATABASE_URL+'?options=unsafe'}]){expect(()=>parseCoreConfig(config,env)).toThrow('core_configuration_invalid');}
 expect(()=>parseCoreConfig(null,environment)).toThrow('core_configuration_invalid');expect(()=>parseCoreConfig({...config,issuer:'https://foreign.invalid'},environment)).toThrow('core_configuration_invalid');
});
