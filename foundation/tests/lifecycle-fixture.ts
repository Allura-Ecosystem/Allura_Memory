import { SQL } from 'bun';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { authenticateHuman, authenticateMachine, type Identity } from '../src/authentication.ts';
import { DatabaseStore, migrate } from '../src/persistence.ts';

export async function fixture(groupId:string) {
  const target=process.env.ALLURA_DISPOSABLE_DB_URL;
  if(!target||new URL(target).hostname!=='127.0.0.1'||process.env.ALLURA_DISPOSABLE_DB!=='owned-test-container'){throw new Error('Requires owned disposable runner');}
  const owner=new SQL(target,{max:4});await migrate(owner);
  const password=randomBytes(32).toString('hex');await owner.unsafe(`ALTER ROLE allura_app LOGIN PASSWORD '${password}'`);
  const url=new URL(target);url.username='allura_app';url.password=password;
  const app=new SQL(url.toString(),{max:8}),workspaceId=randomUUID(),foreignWorkspace=randomUUID();
  const scope={groupId,workspaceId};
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const humanConfig={issuer:'https://lifecycle.cloudflareaccess.com',audience:'fixture',keys:new Map([['key',publicKey]])};
  const names=['author','reviewer','curator','viewer','org','machine'] as const;
  type Name=typeof names[number];
  const ids={} as Record<Name,string>,identities={} as Record<Name,Identity>;
  const jwt=(name:Name)=>{
    const now=Math.floor(Date.now()/1000),data=[{alg:'RS256',kid:'key'},{iss:humanConfig.issuer,aud:humanConfig.audience,sub:`${groupId}:${name}`,email:`${name}@example.invalid`,type:'app',iat:now,exp:now+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    return `${data}.${sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;
  };
  await owner`INSERT INTO allura.tenants(group_id) VALUES (${groupId})`;
  for(const name of names){
    ids[name]=randomUUID();await owner`INSERT INTO allura.principals(id,kind) VALUES (${ids[name]},${name==='machine'?'service':'human'})`;
    await owner`INSERT INTO allura.memberships(group_id,principal_id,org_admin) VALUES (${groupId},${ids[name]},${name==='org'})`;
    if(name!=='machine'){
      await owner`INSERT INTO allura.identity_bindings(issuer,subject,identity_kind,principal_id) VALUES (${humanConfig.issuer},${`${groupId}:${name}`},'human',${ids[name]})`;
      identities[name]=authenticateHuman({assertion:jwt(name)},humanConfig);
    }
  }
  for(const ws of [workspaceId,foreignWorkspace]){await owner`INSERT INTO allura.workspaces(group_id,id,display_name,created_by) VALUES (${groupId},${ws},'Lifecycle fixture',${ids.author})`;}
  for(const name of names.filter(n=>n!=='org')){
    await owner`INSERT INTO allura.workspace_grants(group_id,workspace_id,principal_id,role,review_approve,issuer) VALUES (${groupId},${workspaceId},${ids[name]},${name==='author'?'workspace_admin':name==='viewer'?'viewer':'curator'},${name==='reviewer'},${ids.author})`;
  }
  const token=randomBytes(32).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
  await owner`INSERT INTO allura.machine_credentials(principal_id,digest,group_id,workspace_id,actions,expires_at) VALUES (${ids.machine},decode(${digest},'hex'),${groupId},${workspaceId},ARRAY['memory:capture','memory:read','proposal:write','review:read'],clock_timestamp()+interval '1 hour')`;
  identities.machine=await authenticateMachine(token,d=>new DatabaseStore(app).lookupMachine(d));
  return {owner,app,scope,foreignWorkspace,ids,identities,humanConfig,jwt,close:async()=>{await app.close();await owner.close();}};
}
