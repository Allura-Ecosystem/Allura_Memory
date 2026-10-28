import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DASHBOARD_ROUTES,DASHBOARD_STATES,DASHBOARD_LIMITS,parseDashboardLocation,viewOutcome} from '../src/dashboard-contract.ts';
test('dashboard contract pins retained visual sources without granting preview authority',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../_bmad-output/implementation-artifacts/dashboard-design-reference.json',import.meta.url),'utf8')) as {sources:{path:string;sha256:string}[];authority:string};
 expect(manifest.authority).toBe('delegated-local-design-not-human-acceptance');expect(manifest.sources.length).toBe(10);
 for(const row of manifest.sources){expect(row.path.includes('..')).toBe(false);expect(createHash('sha256').update(readFileSync(new URL('../../'+row.path,import.meta.url))).digest('hex')).toBe(row.sha256);}
 expect(DASHBOARD_LIMITS.memoryPage).toBe(20);expect(DASHBOARD_LIMITS.graphSemanticNodes).toBe(40);expect(DASHBOARD_LIMITS.graphDepth).toBe(2);
});
test('dashboard navigation rejects malformed identifiers ambiguous targets and preview role injection',()=>{
 const id='98781824-ce71-49a6-8008-07813ac08363';expect(parseDashboardLocation('/dashboard/graph','?focus='+id)).toEqual({page:'graph',focus:id});expect(parseDashboardLocation('/dashboard/search','')).toEqual({page:'memories'});
 for(const [path,query] of [['//evil.test',''],['/dashboard/missing',''],['/dashboard/graph','?focus=1.5'],['/dashboard/graph','?focus='+id+'&focus='+id],['/dashboard/memories','?role=workspace_admin'],['/dashboard','?group_id=allura-foreign'],['/dashboard/graph','?focus=%00'],['/dashboard/graph','?focus='+id+'#x'],['/dashboard/graph','?q='+('a'.repeat(2049))]]){expect(()=>parseDashboardLocation(path!,query!)).toThrow('navigation_invalid');}
 expect(Object.isFrozen(DASHBOARD_ROUTES)).toBe(true);for(const route of DASHBOARD_ROUTES){expect(Object.isFrozen(route)).toBe(true);expect(route.path.startsWith('/dashboard')).toBe(true);expect(route.action).not.toBe('tenant:member');}
 for(const app of ['bumblebee','memory-review']){expect(parseDashboardLocation('/dashboard/apps/'+app,'')).toEqual({page:'apps',app});for(const query of ['?focus='+id,'?role=workspace_admin','?']){expect(()=>parseDashboardLocation('/dashboard/apps/'+app,query)).toThrow('navigation_invalid');}}for(const path of ['/dashboard/apps/unknown','/dashboard/apps/bumblebee/','/dashboard/apps/%62umblebee']){expect(()=>parseDashboardLocation(path,'')).toThrow('navigation_invalid');}
});
test('dashboard outcomes never infer success from transport failure or pending work',()=>{
 for(const status of [401,403]){expect(viewOutcome(status)).toBe('denied');}expect(viewOutcome(409)).toBe('conflict');expect(viewOutcome(404)).toBe('not_found');for(const status of [0,202,500,503,504]){expect(viewOutcome(status)).toBe('unknown');}expect(viewOutcome(429)).toBe('unavailable');expect(viewOutcome(200)).toBe('success');expect(viewOutcome(400)).toBe('invalid');
 for(const state of ['loading','empty','denied','conflict','degraded','unknown','success','unavailable','stale'] as const){expect(DASHBOARD_STATES).toContain(state);}expect(Object.isFrozen(DASHBOARD_STATES)).toBe(true);expect(Object.isFrozen(DASHBOARD_LIMITS)).toBe(true);
});
