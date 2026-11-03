import {expect,test} from 'bun:test';
import {parseDestination,projectionEnvelope,notionPatch,compareReadBack,claimMode,PROJECTION} from '../src/projection-contract.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const scope={groupId:'allura-test',workspaceId:id};
const dest=()=>({id,revision:1,adapter:'notion-page-v1',origin:'https://api.notion.com',pageId:id,dataSourceId:other,contentProperty:'content',bindingProperty:'binding'});
const source=()=>({semanticVersionId:id,decisionId:other,version:1,content:'Exact\r\nCafe\u0301 🧠'});
const envelope=()=>projectionEnvelope(scope,parseDestination(dest()),source());
function page(){const e=envelope(),p=notionPatch(e);return {object:'page',id, parent:{type:'data_source_id',data_source_id:other},is_archived:false,in_trash:false,properties:Object.fromEntries(Object.entries(p.properties).map(([k,v])=>[k,{id:k,type:'rich_text',rich_text:v.rich_text}]))};}
test('projection destination parsing rejects authority injection and implicit remote targets',()=>{
 const d=parseDestination(dest());expect(Object.isFrozen(d)).toBe(true);expect(d.origin).toBe('https://api.notion.com');
 for(const v of [null,[],{},...['groupId','token','role','url','enabled'].map(k=>({...dest(),[k]:'private-marker'})),...['https://evil.invalid','http://api.notion.com','https://user:secret@api.notion.com','https://api.notion.com/','https://api.notion.com?x=1','https://api.notion.com#secret','http://127.0.0.1:2345'].map(origin=>({...dest(),origin})),{...dest(),revision:0},{...dest(),revision:NaN},{...dest(),pageId:'bad'},{...dest(),adapter:'notion-latest'},{...dest(),bindingProperty:'content'},{...dest(),bindingProperty:'__proto__'},{...dest(),contentProperty:'a'.repeat(81)}]){expect(()=>parseDestination(v)).toThrow('projection_invalid');}
 expect(parseDestination({...dest(),origin:'http://127.0.0.1:2345'},true).origin).toBe('http://127.0.0.1:2345');
 for(const origin of ['http://localhost:2345','http://127.0.0.2:2345','http://127.0.0.1:0','http://127.0.0.1:2345/path','http://127.0.0.1:99999']){expect(()=>parseDestination({...dest(),origin},true)).toThrow('projection_invalid');}
});
test('projection digest binds exact scoped source destination revision and content without normalization',()=>{
 const e=envelope();expect(Object.isFrozen(e)).toBe(true);expect(e.digest).toMatch(/^[a-f0-9]{64}$/);expect(e.content).toBe(source().content);expect(e.binding.length).toBeLessThan(2000);
 for(const s of [{...source(),semanticVersionId:other},{...source(),decisionId:id},{...source(),version:2},{...source(),content:source().content.normalize('NFC')},{...source(),content:source().content.replace('\r\n','\n')}]){expect(projectionEnvelope(scope,parseDestination(dest()),s).digest).not.toBe(e.digest);}
 for(const d of [{...dest(),id:other},{...dest(),revision:2},{...dest(),pageId:other},{...dest(),dataSourceId:id},{...dest(),contentProperty:'alternate'}]){expect(projectionEnvelope(scope,parseDestination(d),source()).digest).not.toBe(e.digest);}
 expect(projectionEnvelope({...scope,groupId:'allura-other'},parseDestination(dest()),source()).digest).not.toBe(e.digest);
 for(const s of [{...source(),content:''},{...source(),content:'\ud800'},{...source(),content:'\u0000'},{...source(),content:'x'.repeat(12001)},{...source(),version:0},{...source(),digest:'a'.repeat(64)}]){expect(()=>projectionEnvelope(scope,parseDestination(dest()),s)).toThrow('projection_invalid');}
 const long=projectionEnvelope(scope,parseDestination(dest()),{...source(),content:'🧠'.repeat(3000)}),patch=notionPatch(long);expect(patch.properties.content!.rich_text.map(x=>x.text.content).join('')).toBe(long.content);expect(patch.properties.content!.rich_text.every(x=>x.text.content.length<=2000&&Buffer.from(x.text.content).toString()===x.text.content)).toBe(true);expect(PROJECTION.notionVersion).toBe('2026-03-11');
});
test('projection read back verifies actual content and exact target rather than remote acknowledgement',()=>{
 const e=envelope();expect(compareReadBack(e,page())).toBe('match');
 for(const v of [{ok:true},{id},null,{...page(),id:other},{...page(),parent:{type:'data_source_id',data_source_id:id}},{...page(),is_archived:true},{...page(),in_trash:true},{...page(),properties:{}},{...page(),object:'block'}]){expect(compareReadBack(e,v)).toBe('conflict');}
 const wrong=page();wrong.properties.content!.rich_text=[{type:'text',text:{content:'tampered',link:null}}];expect(compareReadBack(e,wrong)).toBe('conflict');
 const blank=page();blank.properties.content!.rich_text=[];blank.properties.binding!.rich_text=[];expect(compareReadBack(e,blank)).toBe('empty');
 const partial=page();partial.properties.binding!.rich_text=[];expect(compareReadBack(e,partial)).toBe('conflict');
 const duplicate=page();duplicate.properties.alias=duplicate.properties.content!;expect(compareReadBack(e,duplicate)).toBe('conflict');
 const mention=page();(mention.properties.content!.rich_text as unknown[])=[{type:'mention',plain_text:e.content}];expect(compareReadBack(e,mention)).toBe('conflict');
 const link=page();(link.properties.content!.rich_text as unknown[])=[{type:'text',text:{content:e.content,link:{url:'https://evil.invalid'}}}];expect(compareReadBack(e,link)).toBe('conflict');
 const forgedPlain=page();forgedPlain.properties.content!.rich_text[0]={...forgedPlain.properties.content!.rich_text[0]!,...{plain_text:'other'}};expect(compareReadBack(e,forgedPlain)).toBe('conflict');
});
test('projection claim policy never rewrites ambiguous work or bypasses due authority and attempt ceilings',()=>{
 const state={status:'queued',attempts:0,availableAt:100,leaseUntil:0,writeStarted:false};expect(claimMode(state,100,true)).toBe('read_then_write');
 for(const patch of [{status:'synced'},{status:'failed'},{availableAt:101},{leaseUntil:101},{attempts:5}]){expect(claimMode({...state,...patch},100,true)).toBe('none');}
 expect(claimMode(state,100,false)).toBe('none');expect(claimMode({...state,writeStarted:true},100,true)).toBe('reconcile');expect(claimMode({...state,status:'unknown'},100,true)).toBe('reconcile');
 for(const patch of [{status:'invented'},{attempts:-1},{attempts:1.1},{availableAt:Infinity},{leaseUntil:-1},{writeStarted:'false'},{role:'admin'}]){expect(()=>claimMode({...state,...patch},100,true)).toThrow('projection_invalid');}
 expect(()=>claimMode(state,NaN,true)).toThrow('projection_invalid');
});
