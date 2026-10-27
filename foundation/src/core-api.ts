import {type SQL} from 'bun';
import {type HumanConfig} from './authentication.ts';
import {type Embedder} from './embedding.ts';
import {DatabaseStore} from './persistence.ts';
import {createGateway} from './gateway.ts';
import {createAccessRoutes} from './access-api.ts';
import {createEvidenceRoutes} from './evidence-api.ts';
import {createReviewRoutes} from './review-api.ts';
import {createRetrievalRoutes} from './retrieval-api.ts';
import {createOperationsRoutes} from './operations-api.ts';
import {createMcpRoutes} from './mcp-api.ts';
import {createDeviceRoutes} from './device-api.ts';
export function createCoreGateway(sql:SQL,human:HumanConfig,origin:string,cursorKey:Uint8Array,provider:Embedder):(request:Request)=>Promise<Response>{
 const store=new DatabaseStore(sql);
 return createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:[...createAccessRoutes(sql),...createEvidenceRoutes(sql),...createReviewRoutes(sql),...createRetrievalRoutes(sql,cursorKey,provider),...createOperationsRoutes(sql,provider),...createMcpRoutes(sql,cursorKey,provider),...createDeviceRoutes(sql)]});
}
