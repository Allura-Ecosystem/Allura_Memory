import { type SQL } from 'bun';
import { type HumanConfig } from './authentication.ts';
import { accessCommand } from './access.ts';
import { createGateway } from './gateway.ts';
import { DatabaseStore } from './persistence.ts';

// Tenant membership admits bounded access-control requests, NOT content reads.
// Each command performs its own current-role/consent/revision transaction.
// For create/creation acceptance the workspace selector is syntactically valid
// but has no authority meaning; the server generates the new workspace id.
export function createAccessGateway(sql: SQL, human: HumanConfig, origin: string): (request: Request) => Promise<Response> {
  const store = new DatabaseStore(sql);
  return createGateway({ human, origin, store, machineLookup: digest => store.lookupMachine(digest), routes: [{
    path: '/api/access', method: 'POST', identity: 'human', action: 'tenant:member',
    handle: ({identity, scope, body}) => accessCommand(sql, identity, scope.groupId, scope.workspaceId, body!),
  }] });
}
