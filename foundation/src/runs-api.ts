import { type SQL } from 'bun';
import { type Route } from './gateway.ts';
import { startRun, advanceRun, decideRun, resumeRun } from './runs.ts';
import { RunError } from './run-contract.ts';

export function createRunRoutes(sql: SQL): Route[] {
  return [{ path: '/api/runs/start', method: 'POST', identity: 'human', action: 'workspace:grants:manage', handle: async ({ identity, scope, body, request, signal }) => {
    const query = new URL(request.url).searchParams;
    if (Array.from(query.keys()).some(key => !['group_id', 'workspace_id'].includes(key))) { throw new RunError('invalid'); }
    signal.throwIfAborted();
    return JSON.parse(await startRun(sql, identity, scope, body));
  } }, { path: '/api/runs/advance', method: 'POST', identity: 'human', action: 'workspace:grants:manage', handle: async ({ identity, scope, body, request, signal }) => {
    const query = new URL(request.url).searchParams;
    if (Array.from(query.keys()).some(key => !['group_id', 'workspace_id'].includes(key))) { throw new RunError('invalid'); }
    signal.throwIfAborted();
    return JSON.parse(await advanceRun(sql, identity, scope, body, signal));
  } }, { path: '/api/runs/decide', method: 'POST', identity: 'human', action: 'workspace:grants:manage', handle: async ({ identity, scope, body, request, signal }) => {
    const query = new URL(request.url).searchParams;
    if (Array.from(query.keys()).some(key => !['group_id', 'workspace_id'].includes(key))) { throw new RunError('invalid'); }
    signal.throwIfAborted();
    return JSON.parse(await decideRun(sql, identity, scope, body, signal));
  } }, { path: '/api/runs/resume', method: 'POST', identity: 'human', action: 'workspace:grants:manage', handle: async ({ identity, scope, body, request, signal }) => {
    const query = new URL(request.url).searchParams;
    if (Array.from(query.keys()).some(key => !['group_id', 'workspace_id'].includes(key))) { throw new RunError('invalid'); }
    signal.throwIfAborted();
    return JSON.parse(await resumeRun(sql, identity, scope, body, signal));
  } }];
}
