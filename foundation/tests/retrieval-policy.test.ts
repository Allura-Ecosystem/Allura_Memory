import {test,expect} from 'bun:test';
import {normalizeAllLimit,mergeCandidates,type RetrievalCandidate} from '../src/retrieval-policy.ts';
const row=(id:string,content:string,source:RetrievalCandidate['source'],score:number,createdAt='2026-10-26T00:00:00Z'):RetrievalCandidate=>({id,content,source,score,scoreKind:source==='vector'?'cosine_similarity':'unscored',confidence:null,createdAt,metadata:{source}});
test('all-mode finite limits normalize before retrieval',()=>{
  expect(normalizeAllLimit(undefined)).toBe(10);expect(normalizeAllLimit(2.9)).toBe(2);expect(normalizeAllLimit(100)).toBe(100);
  for(const value of [null,0,-1,101,100.9,Infinity,NaN,'2',{},[]]){expect(()=>normalizeAllLimit(value)).toThrow('invalid');}
});
test('full semantic and vector batches never evict exact fresh evidence by confidence',()=>{
  const batches=[[row('a','Different semantic content','semantic',0.99),row('b','Second semantic','semantic',0.98)],[row('c','Different vector content','vector',0.97),row('d','Second vector','vector',0.96)],[row('e','  Exact fresh evidence  ','event',0),row('f','Context Exact fresh evidence suffix','event',0)]];
  const result=mergeCandidates('exact fresh evidence',2,batches);expect(result.map(r=>r.id)).toEqual(['e','f']);expect(result.map(r=>r.score)).toEqual([0,0]);
  expect(mergeCandidates('',2,batches).map(r=>r.id)).toEqual(['a','b']);
});
test('same-ID metadata enrichment preserves vector score and latest durable metadata',()=>{
  const vector=row('a','same content','vector',0.81),old=row('a','same content','event',0,'2026-10-25T00:00:00Z'),fresh=row('a','same content','event',0,'2026-10-26T01:00:00Z');fresh.metadata={source:'durable-new'};
  for(const rows of [[vector,old,fresh],[fresh,vector,old],[old,fresh,vector]]){
    const result=mergeCandidates('same content',10,[rows]);expect(result).toHaveLength(1);expect(result[0]).toMatchObject({score:0.81,scoreKind:'cosine_similarity',createdAt:fresh.createdAt,metadata:{source:'durable-new'}});
  }
  expect(mergeCandidates('exact',1,[[row('a','unrelated','vector',0.99)],[row('a','exact','event',0)]])[0]?.content).toBe('exact');
  expect(vector.metadata).toEqual({source:'vector'});expect(fresh.score).toBe(0);
});
test('explicit confidence filtering occurs before enrichment and never invents confidence',()=>{
  const vector={...row('a','match','vector',0.81),confidence:0.9},event={...row('a','match','event',0),confidence:0.2,metadata:{source:'ineligible'}};
  expect(mergeCandidates('match',2,[[vector],[event]],0.5)[0]).toMatchObject({score:0.81,metadata:{source:'vector'}});
  expect(mergeCandidates('match',2,[[row('b','match','event',0)]],0)).toEqual([]);
  expect(()=>mergeCandidates('match',2,[],NaN)).toThrow('invalid');
});
