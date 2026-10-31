import { type SQL } from 'bun';
import { type Route } from './gateway.ts';
import { memoryShare } from './memory-shares.ts';
export function createMemoryShareRoutes(sql: SQL): Route[] {
  return (['approve','revoke','get'] as const).map(op => ({
    path: `/api/memory-shares/${op}`, method: 'POST', identity: 'human', action: 'tenant:member',
    handle: ({identity,scope,body}) => memoryShare(sql,identity,scope,op,body),
  }));
}
