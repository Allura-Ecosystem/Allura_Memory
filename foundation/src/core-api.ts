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
import {createDashboardRoutes} from './dashboard-api.ts';
import {createProjectionRoutes} from './projection-api.ts';
import {type ProjectionTransport} from './projection-delivery.ts';
import {createBumblebeeConfigurationRoutes} from './bumblebee-configuration-api.ts';
import {createBumblebeeScannerGateway,type BumblebeeScannerOptions} from './bumblebee-lease-api.ts';
export function createCoreGateway(sql:SQL,human:HumanConfig,origin:string,cursorKey:Uint8Array,provider:Embedder,projection?:ProjectionTransport,scannerOptions?:BumblebeeScannerOptions):(request:Request)=>Promise<Response>{
 const store=new DatabaseStore(sql);
 const normal=createGateway({human,origin,store,machineLookup:d=>store.lookupMachine(d),routes:[...createAccessRoutes(sql),...createEvidenceRoutes(sql),...createReviewRoutes(sql),...createRetrievalRoutes(sql,cursorKey,provider),...createOperationsRoutes(sql,provider,scope=>projection?.configured(scope)??false),...createMcpRoutes(sql,cursorKey,provider),...createDeviceRoutes(sql),...createDashboardRoutes(sql),...createProjectionRoutes(sql,projection),...createBumblebeeConfigurationRoutes(sql,scannerOptions?{redaction:{key:scannerOptions.redactionKey,revision:scannerOptions.redactionKeyRevision}}:{})]}),scanner=scannerOptions?createBumblebeeScannerGateway(sql,scannerOptions):undefined;
 return request=>scanner&&['/api/bumblebee/lease','/api/bumblebee/ingest'].includes(new URL(request.url).pathname)?scanner(request):normal(request);
}
