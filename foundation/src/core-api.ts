import {type SQL} from 'bun';
import {createWorkRoutes} from './work-plane-api.ts';
import {workContract} from './work-plane-contract.ts';
import {createRunRoutes} from './runs-api.ts';
import {type LocalOAuthProvider} from './oauth-provider.ts';
import {createOAuthConsentRoutes} from './oauth-consent.ts';
import {createSelectedClientRoutes} from './selected-client-api.ts';
import {oauthResource} from './oauth-resource.ts';
import {type HumanConfig} from './authentication.ts';
import {type Embedder} from './embedding.ts';
import {DatabaseStore} from './persistence.ts';
import {createGateway} from './gateway.ts';
import {createAccessRoutes} from './access-api.ts';
import {createMemoryShareRoutes} from './memory-shares-api.ts';
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
import {createAppModulesRoutes} from './app-modules-api.ts';
import {createBumblebeeScannerGateway,type BumblebeeScannerOptions} from './bumblebee-lease-api.ts';
export function createCoreGateway(sql:SQL,human:HumanConfig|undefined,origin:string,cursorKey:Uint8Array,provider:Embedder,projection?:ProjectionTransport,scannerOptions?:BumblebeeScannerOptions,mode:'human'|'machine-only'='human',oauth?:LocalOAuthProvider,workCapability?:typeof workContract):(request:Request)=>Promise<Response>{
 if(oauth&&(mode==='machine-only'||!human)){throw new Error('invalid runtime mode');}
 const store=new DatabaseStore(sql);
 const normal=createGateway({mode,...(human?{human}:{}),origin,store,machineLookup:async d=>{const [row]=await sql`SELECT CASE WHEN allura.selected_lookup(${d},${oauth?.config.resource??''}) IS NOT NULL THEN allura.selected_lookup(${d},${oauth?.config.resource??''}) ELSE coalesce(allura.oauth_lookup(${d},${oauth?.config.resource??''}),allura.lookup_machine(${d})) END AS credential`;return row?.credential??null;},routes:[...(mode==='human'&&workCapability===workContract?createWorkRoutes(sql,cursorKey):[]),...(oauth?[...createOAuthConsentRoutes(oauth),...createSelectedClientRoutes(oauth)]:[]),...createRunRoutes(sql),...createMemoryShareRoutes(sql),...createAccessRoutes(sql),...createEvidenceRoutes(sql),...createReviewRoutes(sql),...createRetrievalRoutes(sql,cursorKey,provider),...createOperationsRoutes(sql,provider,scope=>projection?.configured(scope)??false),...createMcpRoutes(sql,cursorKey,provider),...createDeviceRoutes(sql),...createDashboardRoutes(sql),...createProjectionRoutes(sql,projection),...createAppModulesRoutes(sql),...createBumblebeeConfigurationRoutes(sql,scannerOptions?{redaction:{key:scannerOptions.redactionKey,revision:scannerOptions.redactionKeyRevision}}:{})]}),scanner=scannerOptions?createBumblebeeScannerGateway(sql,scannerOptions):undefined;
 const resource=oauth?oauthResource(oauth,normal):normal;
 return async request=>{const reply=await (scanner&&['/api/bumblebee/lease','/api/bumblebee/ingest'].includes(new URL(request.url).pathname)?scanner(request):resource(request));if(['/api/oauth/consent','/api/oauth/selected-consent','/api/oauth/selected-connections/revoke'].includes(new URL(request.url).pathname)){reply.headers.set('Referrer-Policy','no-referrer');}return reply;};
}
