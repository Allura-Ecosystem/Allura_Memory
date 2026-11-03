import type { SQL } from 'bun';
import type { HumanConfig } from './authentication.ts';
import { createGateway,type Route } from './gateway.ts';
import { DatabaseStore, readEvents } from './persistence.ts';

// Small genuine read-only API. Not the five-tool memory runtime or a release.
// Caller supplies server-owned validated keys and restricted app connection;
// no environment/production credential discovery and no DevAuth path.
export function createEvidenceGateway(sql: SQL, human: HumanConfig, origin: string): (request: Request) => Promise<Response> {
  const store = new DatabaseStore(sql);
  return createGateway({ human, origin, store, machineLookup: digest => store.lookupMachine(digest), routes:createEvidenceRoutes(sql) });
}
export function createEvidenceRoutes(sql:SQL):Route[]{return [{
    path: '/api/evidence', method: 'GET', identity: 'human', action: 'evidence:read',
    handle: async ({ identity, scope }) => ({ evidence: await readEvents(sql, identity, scope) }),
  }];
}
