import { z } from 'zod';

/**
 * @allura/sdk — Public TypeScript types
 *
 * These types mirror the canonical contracts in
 * src/lib/memory/canonical-contracts.ts but are designed for
 * external consumers. They use plain string types (not branded types)
 * for ergonomics, with Zod validation enforcing invariants at runtime.
 *
 * Invariants:
 * - group_id is REQUIRED on every operation (enforced by Zod)
 * - group_id MUST match ^allura- (enforced by Zod)
 * - All responses include optional meta for degraded-mode awareness
 */

/** Tenant namespace — must match ^allura-[a-z0-9-]+$ */
type GroupId = string;
/** Memory identifier — UUID v4 */
type MemoryId = string;
/** User identifier within a tenant */
type UserId = string;
/** Memory content text */
type MemoryContent = string;
/** Confidence score (0.0 to 1.0) */
type ConfidenceScore = number;
/** Storage location */
type StorageLocation = "episodic" | "semantic" | "both";
/** Promotion mode */
type PromotionMode = "auto" | "soc2";
/** Memory provenance */
type MemoryProvenance = "conversation" | "manual";
/** Memory status in Neo4j */
type MemoryStatus = "active" | "deprecated";
/** Sort order for memory_list */
type MemorySortOrder = "created_at_desc" | "created_at_asc" | "score_desc" | "score_asc";
/** Backing stores that can be reported by canonical memory retrieval metadata. */
type MemoryRetrievalStore = "postgres" | "neo4j" | "graph" | "ruvector";
/** Validates group_id format: ^allura-[a-z0-9-]+$ */
declare const GroupIdSchema: z.ZodString;
/** Validates UUID v4 format */
declare const MemoryIdSchema: z.ZodString;
/** Validates confidence score range */
declare const ConfidenceScoreSchema: z.ZodNumber;
/** Configuration for AlluraClient */
interface AlluraClientConfig {
    /** Base URL of the Allura Memory HTTP gateway (e.g., http://localhost:3201) */
    baseUrl: string;
    /** Bearer token for authentication (optional in dev mode) */
    authToken?: string;
    /** Request timeout in milliseconds (default: 5000) */
    timeout?: number;
    /** Number of retry attempts with exponential backoff (default: 3) */
    retries?: number;
    /** Custom fetch implementation (for testing or edge runtimes) */
    fetch?: typeof globalThis.fetch;
}
/** Parameters for memory_add */
interface MemoryAddParams {
    /** Required: Tenant namespace (format: allura-*) */
    group_id: GroupId;
    /** Required: User identifier within tenant */
    user_id: UserId;
    /** Required: Memory content text */
    content: MemoryContent;
    /** Optional: Metadata */
    metadata?: {
        source?: MemoryProvenance;
        conversation_id?: string;
        agent_id?: string;
        [key: string]: unknown;
    };
    /** Optional: Override promotion threshold (default: 0.85) */
    threshold?: number;
}
/** Parameters for memory_search */
interface MemorySearchParams {
    /** Required: Search query */
    query: string;
    /** Required: Tenant namespace */
    group_id: GroupId;
    /** Optional: User identifier (scope to user) */
    user_id?: UserId;
    /** Optional: Maximum results (default: 10) */
    limit?: number;
    /** Optional: Minimum confidence filter */
    min_score?: ConfidenceScore;
    /** Optional: Include global memories (default: true) */
    include_global?: boolean;
}
/** Parameters for memory_get */
interface MemoryGetParams {
    /** Required: Memory identifier */
    id: MemoryId;
    /** Required: Tenant namespace */
    group_id: GroupId;
}
/** Parameters for memory_list */
interface MemoryListParams {
    /** Required: Tenant namespace */
    group_id: GroupId;
    /** Optional: User identifier. Omit only for tenant-scoped/admin listing. */
    user_id?: UserId;
    /** Optional: Maximum results (default: 50) */
    limit?: number;
    /** Optional: Pagination offset */
    offset?: number;
    /** Optional: Sort order (default: created_at_desc) */
    sort?: MemorySortOrder;
}
/** Parameters for memory_delete */
interface MemoryDeleteParams {
    /** Required: Memory identifier */
    id: MemoryId;
    /** Required: Tenant namespace */
    group_id: GroupId;
    /** Required: User identifier (for authorization) */
    user_id: UserId;
}
/** Execution metadata included in responses */
interface MemoryResponseMeta {
    contract_version: "v1";
    degraded: boolean;
    degraded_reason?: "neo4j_unavailable" | "graph_unavailable";
    stores_used: MemoryRetrievalStore[];
    stores_attempted: MemoryRetrievalStore[];
    warnings?: string[];
    /** RuVector trajectory ID for evidence-gated feedback, when RuVector was used. */
    ruvector_trajectory_id?: string;
    /** Number of results returned from RuVector, when available. */
    ruvector_count?: number;
}
/** Response from memory_add */
interface MemoryAddResponse {
    id: MemoryId;
    stored: StorageLocation;
    score: ConfidenceScore;
    pending_review?: boolean;
    created_at: string;
    meta?: MemoryResponseMeta;
    duplicate?: boolean;
    duplicate_of?: string;
    similarity?: number;
}
/** Individual search result */
interface MemorySearchResult {
    id: MemoryId;
    content: MemoryContent;
    score: ConfidenceScore;
    source: StorageLocation;
    provenance: MemoryProvenance;
    created_at: string;
    usage_count?: number;
}
/** Response from memory_search */
interface MemorySearchResponse {
    results: MemorySearchResult[];
    count: number;
    latency_ms: number;
    meta?: MemoryResponseMeta;
}
/** Response from memory_get */
interface MemoryGetResponse {
    id: MemoryId;
    content: MemoryContent;
    score: ConfidenceScore;
    source: StorageLocation;
    provenance: MemoryProvenance;
    user_id: UserId;
    actor?: UserId | null;
    creator?: UserId | null;
    approver?: UserId | null;
    group_id?: GroupId;
    created_at: string;
    status?: "approved" | "proposed" | "pending" | "deprecated" | "active" | "deleted";
    source_event_id?: string | null;
    proposal_id?: string | null;
    trace_ref?: string | number | null;
    evidence?: Array<{
        id: string | null;
        type: "event" | "proposal" | "trace" | "version";
        label: string;
        status: "available" | "unavailable";
    }>;
    version?: number;
    superseded_by?: MemoryId;
    usage_count?: number;
    hash?: string | null;
    previous_hash?: string | null;
    meta?: MemoryResponseMeta;
}
/** Response from memory_list */
interface MemoryListResponse {
    memories: MemoryGetResponse[];
    total: number;
    has_more: boolean;
    meta?: MemoryResponseMeta;
}
/** Response from memory_delete */
interface MemoryDeleteResponse {
    id: MemoryId;
    deleted: boolean;
    deleted_at: string;
    recovery_days: number;
    meta?: MemoryResponseMeta;
}
/** Health check response */
interface HealthResponse {
    status: string;
    mode: string;
    interface: string;
    transports: string[];
    mcp_endpoint: string;
    port: number;
    port_source: string;
    auth_enabled: boolean;
    warnings?: string[];
    timestamp: string;
}
declare const MemoryAddResponseSchema: z.ZodObject<{
    id: z.ZodString;
    stored: z.ZodEnum<["episodic", "semantic", "both"]>;
    score: z.ZodNumber;
    pending_review: z.ZodOptional<z.ZodBoolean>;
    created_at: z.ZodString;
    meta: z.ZodOptional<z.ZodObject<{
        contract_version: z.ZodLiteral<"v1">;
        degraded: z.ZodBoolean;
        degraded_reason: z.ZodOptional<z.ZodEnum<["neo4j_unavailable", "graph_unavailable"]>>;
        stores_used: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        stores_attempted: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        ruvector_trajectory_id: z.ZodOptional<z.ZodString>;
        ruvector_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }>>;
    duplicate: z.ZodOptional<z.ZodBoolean>;
    duplicate_of: z.ZodOptional<z.ZodString>;
    similarity: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    stored: "episodic" | "semantic" | "both";
    score: number;
    created_at: string;
    pending_review?: boolean | undefined;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
    duplicate?: boolean | undefined;
    duplicate_of?: string | undefined;
    similarity?: number | undefined;
}, {
    id: string;
    stored: "episodic" | "semantic" | "both";
    score: number;
    created_at: string;
    pending_review?: boolean | undefined;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
    duplicate?: boolean | undefined;
    duplicate_of?: string | undefined;
    similarity?: number | undefined;
}>;
declare const MemorySearchResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        score: z.ZodNumber;
        source: z.ZodEnum<["episodic", "semantic", "both"]>;
        provenance: z.ZodEnum<["conversation", "manual"]>;
        created_at: z.ZodString;
        usage_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        usage_count?: number | undefined;
    }, {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        usage_count?: number | undefined;
    }>, "many">;
    count: z.ZodNumber;
    latency_ms: z.ZodNumber;
    meta: z.ZodOptional<z.ZodObject<{
        contract_version: z.ZodLiteral<"v1">;
        degraded: z.ZodBoolean;
        degraded_reason: z.ZodOptional<z.ZodEnum<["neo4j_unavailable", "graph_unavailable"]>>;
        stores_used: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        stores_attempted: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        ruvector_trajectory_id: z.ZodOptional<z.ZodString>;
        ruvector_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    results: {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        usage_count?: number | undefined;
    }[];
    count: number;
    latency_ms: number;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
}, {
    results: {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        usage_count?: number | undefined;
    }[];
    count: number;
    latency_ms: number;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
}>;
declare const MemoryGetResponseSchema: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodString;
    score: z.ZodNumber;
    source: z.ZodEnum<["episodic", "semantic", "both"]>;
    provenance: z.ZodEnum<["conversation", "manual"]>;
    user_id: z.ZodString;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    creator: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    approver: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    group_id: z.ZodOptional<z.ZodString>;
    created_at: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["approved", "proposed", "pending", "deprecated", "active", "deleted"]>>;
    source_event_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    proposal_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    trace_ref: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodNumber]>>>;
    evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodNullable<z.ZodString>;
        type: z.ZodEnum<["event", "proposal", "trace", "version"]>;
        label: z.ZodString;
        status: z.ZodEnum<["available", "unavailable"]>;
    }, "strip", z.ZodTypeAny, {
        status: "available" | "unavailable";
        type: "event" | "proposal" | "trace" | "version";
        id: string | null;
        label: string;
    }, {
        status: "available" | "unavailable";
        type: "event" | "proposal" | "trace" | "version";
        id: string | null;
        label: string;
    }>, "many">>;
    version: z.ZodOptional<z.ZodNumber>;
    superseded_by: z.ZodOptional<z.ZodString>;
    usage_count: z.ZodOptional<z.ZodNumber>;
    hash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    previous_hash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    meta: z.ZodOptional<z.ZodObject<{
        contract_version: z.ZodLiteral<"v1">;
        degraded: z.ZodBoolean;
        degraded_reason: z.ZodOptional<z.ZodEnum<["neo4j_unavailable", "graph_unavailable"]>>;
        stores_used: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        stores_attempted: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        ruvector_trajectory_id: z.ZodOptional<z.ZodString>;
        ruvector_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    source: "episodic" | "semantic" | "both";
    id: string;
    score: number;
    created_at: string;
    content: string;
    provenance: "conversation" | "manual";
    user_id: string;
    version?: number | undefined;
    status?: "active" | "deprecated" | "approved" | "proposed" | "pending" | "deleted" | undefined;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
    usage_count?: number | undefined;
    actor?: string | null | undefined;
    creator?: string | null | undefined;
    approver?: string | null | undefined;
    group_id?: string | undefined;
    source_event_id?: string | null | undefined;
    proposal_id?: string | null | undefined;
    trace_ref?: string | number | null | undefined;
    evidence?: {
        status: "available" | "unavailable";
        type: "event" | "proposal" | "trace" | "version";
        id: string | null;
        label: string;
    }[] | undefined;
    superseded_by?: string | undefined;
    hash?: string | null | undefined;
    previous_hash?: string | null | undefined;
}, {
    source: "episodic" | "semantic" | "both";
    id: string;
    score: number;
    created_at: string;
    content: string;
    provenance: "conversation" | "manual";
    user_id: string;
    version?: number | undefined;
    status?: "active" | "deprecated" | "approved" | "proposed" | "pending" | "deleted" | undefined;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
    usage_count?: number | undefined;
    actor?: string | null | undefined;
    creator?: string | null | undefined;
    approver?: string | null | undefined;
    group_id?: string | undefined;
    source_event_id?: string | null | undefined;
    proposal_id?: string | null | undefined;
    trace_ref?: string | number | null | undefined;
    evidence?: {
        status: "available" | "unavailable";
        type: "event" | "proposal" | "trace" | "version";
        id: string | null;
        label: string;
    }[] | undefined;
    superseded_by?: string | undefined;
    hash?: string | null | undefined;
    previous_hash?: string | null | undefined;
}>;
declare const MemoryListResponseSchema: z.ZodObject<{
    memories: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        score: z.ZodNumber;
        source: z.ZodEnum<["episodic", "semantic", "both"]>;
        provenance: z.ZodEnum<["conversation", "manual"]>;
        user_id: z.ZodString;
        actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        creator: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        approver: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        group_id: z.ZodOptional<z.ZodString>;
        created_at: z.ZodString;
        status: z.ZodOptional<z.ZodEnum<["approved", "proposed", "pending", "deprecated", "active", "deleted"]>>;
        source_event_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        proposal_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        trace_ref: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodNumber]>>>;
        evidence: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodNullable<z.ZodString>;
            type: z.ZodEnum<["event", "proposal", "trace", "version"]>;
            label: z.ZodString;
            status: z.ZodEnum<["available", "unavailable"]>;
        }, "strip", z.ZodTypeAny, {
            status: "available" | "unavailable";
            type: "event" | "proposal" | "trace" | "version";
            id: string | null;
            label: string;
        }, {
            status: "available" | "unavailable";
            type: "event" | "proposal" | "trace" | "version";
            id: string | null;
            label: string;
        }>, "many">>;
        version: z.ZodOptional<z.ZodNumber>;
        superseded_by: z.ZodOptional<z.ZodString>;
        usage_count: z.ZodOptional<z.ZodNumber>;
        hash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        previous_hash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        meta: z.ZodOptional<z.ZodObject<{
            contract_version: z.ZodLiteral<"v1">;
            degraded: z.ZodBoolean;
            degraded_reason: z.ZodOptional<z.ZodEnum<["neo4j_unavailable", "graph_unavailable"]>>;
            stores_used: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
            stores_attempted: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
            warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            ruvector_trajectory_id: z.ZodOptional<z.ZodString>;
            ruvector_count: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            contract_version: "v1";
            degraded: boolean;
            stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
            warnings?: string[] | undefined;
            ruvector_trajectory_id?: string | undefined;
            ruvector_count?: number | undefined;
        }, {
            contract_version: "v1";
            degraded: boolean;
            stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
            warnings?: string[] | undefined;
            ruvector_trajectory_id?: string | undefined;
            ruvector_count?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        user_id: string;
        version?: number | undefined;
        status?: "active" | "deprecated" | "approved" | "proposed" | "pending" | "deleted" | undefined;
        meta?: {
            contract_version: "v1";
            degraded: boolean;
            stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
            warnings?: string[] | undefined;
            ruvector_trajectory_id?: string | undefined;
            ruvector_count?: number | undefined;
        } | undefined;
        usage_count?: number | undefined;
        actor?: string | null | undefined;
        creator?: string | null | undefined;
        approver?: string | null | undefined;
        group_id?: string | undefined;
        source_event_id?: string | null | undefined;
        proposal_id?: string | null | undefined;
        trace_ref?: string | number | null | undefined;
        evidence?: {
            status: "available" | "unavailable";
            type: "event" | "proposal" | "trace" | "version";
            id: string | null;
            label: string;
        }[] | undefined;
        superseded_by?: string | undefined;
        hash?: string | null | undefined;
        previous_hash?: string | null | undefined;
    }, {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        user_id: string;
        version?: number | undefined;
        status?: "active" | "deprecated" | "approved" | "proposed" | "pending" | "deleted" | undefined;
        meta?: {
            contract_version: "v1";
            degraded: boolean;
            stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
            warnings?: string[] | undefined;
            ruvector_trajectory_id?: string | undefined;
            ruvector_count?: number | undefined;
        } | undefined;
        usage_count?: number | undefined;
        actor?: string | null | undefined;
        creator?: string | null | undefined;
        approver?: string | null | undefined;
        group_id?: string | undefined;
        source_event_id?: string | null | undefined;
        proposal_id?: string | null | undefined;
        trace_ref?: string | number | null | undefined;
        evidence?: {
            status: "available" | "unavailable";
            type: "event" | "proposal" | "trace" | "version";
            id: string | null;
            label: string;
        }[] | undefined;
        superseded_by?: string | undefined;
        hash?: string | null | undefined;
        previous_hash?: string | null | undefined;
    }>, "many">;
    total: z.ZodNumber;
    has_more: z.ZodBoolean;
    meta: z.ZodOptional<z.ZodObject<{
        contract_version: z.ZodLiteral<"v1">;
        degraded: z.ZodBoolean;
        degraded_reason: z.ZodOptional<z.ZodEnum<["neo4j_unavailable", "graph_unavailable"]>>;
        stores_used: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        stores_attempted: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        ruvector_trajectory_id: z.ZodOptional<z.ZodString>;
        ruvector_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    memories: {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        user_id: string;
        version?: number | undefined;
        status?: "active" | "deprecated" | "approved" | "proposed" | "pending" | "deleted" | undefined;
        meta?: {
            contract_version: "v1";
            degraded: boolean;
            stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
            warnings?: string[] | undefined;
            ruvector_trajectory_id?: string | undefined;
            ruvector_count?: number | undefined;
        } | undefined;
        usage_count?: number | undefined;
        actor?: string | null | undefined;
        creator?: string | null | undefined;
        approver?: string | null | undefined;
        group_id?: string | undefined;
        source_event_id?: string | null | undefined;
        proposal_id?: string | null | undefined;
        trace_ref?: string | number | null | undefined;
        evidence?: {
            status: "available" | "unavailable";
            type: "event" | "proposal" | "trace" | "version";
            id: string | null;
            label: string;
        }[] | undefined;
        superseded_by?: string | undefined;
        hash?: string | null | undefined;
        previous_hash?: string | null | undefined;
    }[];
    total: number;
    has_more: boolean;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
}, {
    memories: {
        source: "episodic" | "semantic" | "both";
        id: string;
        score: number;
        created_at: string;
        content: string;
        provenance: "conversation" | "manual";
        user_id: string;
        version?: number | undefined;
        status?: "active" | "deprecated" | "approved" | "proposed" | "pending" | "deleted" | undefined;
        meta?: {
            contract_version: "v1";
            degraded: boolean;
            stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
            degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
            warnings?: string[] | undefined;
            ruvector_trajectory_id?: string | undefined;
            ruvector_count?: number | undefined;
        } | undefined;
        usage_count?: number | undefined;
        actor?: string | null | undefined;
        creator?: string | null | undefined;
        approver?: string | null | undefined;
        group_id?: string | undefined;
        source_event_id?: string | null | undefined;
        proposal_id?: string | null | undefined;
        trace_ref?: string | number | null | undefined;
        evidence?: {
            status: "available" | "unavailable";
            type: "event" | "proposal" | "trace" | "version";
            id: string | null;
            label: string;
        }[] | undefined;
        superseded_by?: string | undefined;
        hash?: string | null | undefined;
        previous_hash?: string | null | undefined;
    }[];
    total: number;
    has_more: boolean;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
}>;
declare const MemoryDeleteResponseSchema: z.ZodObject<{
    id: z.ZodString;
    deleted: z.ZodBoolean;
    deleted_at: z.ZodString;
    recovery_days: z.ZodNumber;
    meta: z.ZodOptional<z.ZodObject<{
        contract_version: z.ZodLiteral<"v1">;
        degraded: z.ZodBoolean;
        degraded_reason: z.ZodOptional<z.ZodEnum<["neo4j_unavailable", "graph_unavailable"]>>;
        stores_used: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        stores_attempted: z.ZodArray<z.ZodEnum<["postgres", "neo4j", "graph", "ruvector"]>, "many">;
        warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        ruvector_trajectory_id: z.ZodOptional<z.ZodString>;
        ruvector_count: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }, {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    deleted: boolean;
    id: string;
    deleted_at: string;
    recovery_days: number;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
}, {
    deleted: boolean;
    id: string;
    deleted_at: string;
    recovery_days: number;
    meta?: {
        contract_version: "v1";
        degraded: boolean;
        stores_used: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        stores_attempted: ("postgres" | "neo4j" | "graph" | "ruvector")[];
        degraded_reason?: "neo4j_unavailable" | "graph_unavailable" | undefined;
        warnings?: string[] | undefined;
        ruvector_trajectory_id?: string | undefined;
        ruvector_count?: number | undefined;
    } | undefined;
}>;
declare const HealthResponseSchema: z.ZodObject<{
    status: z.ZodString;
    mode: z.ZodString;
    interface: z.ZodString;
    transports: z.ZodArray<z.ZodString, "many">;
    mcp_endpoint: z.ZodString;
    port: z.ZodNumber;
    port_source: z.ZodString;
    auth_enabled: z.ZodBoolean;
    warnings: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: string;
    mode: string;
    interface: string;
    transports: string[];
    mcp_endpoint: string;
    port: number;
    port_source: string;
    auth_enabled: boolean;
    timestamp: string;
    warnings?: string[] | undefined;
}, {
    status: string;
    mode: string;
    interface: string;
    transports: string[];
    mcp_endpoint: string;
    port: number;
    port_source: string;
    auth_enabled: boolean;
    timestamp: string;
    warnings?: string[] | undefined;
}>;

/**
 * @allura/sdk — Memory operations
 *
 * Implements the 5 canonical memory operations:
 * add, search, get, list, delete
 *
 * Each operation:
 * 1. Validates group_id (ARCH-001 tenant isolation)
 * 2. Validates request parameters with Zod
 * 3. Sends request via MCP Streamable HTTP (POST /mcp)
 * 4. Validates response with Zod
 * 5. Returns typed response
 */

/**
 * Internal request function type — injected by AlluraClient.
 */
type RequestFn = <T>(method: string, params: Record<string, unknown>, responseSchema: {
    parse: (data: unknown) => T;
}) => Promise<T>;
/**
 * Memory operations class — provides the 5 canonical memory operations.
 *
 * This class is not instantiated directly. Use `client.memory` to access it.
 */
declare class MemoryOperations {
    private readonly request;
    constructor(requestFn: RequestFn);
    /**
     * Add a memory for a user.
     *
     * Flow:
     * 1. Validate group_id
     * 2. Send memory_add request
     * 3. Return typed response with storage location and score
     *
     * @param params - Memory add parameters
     * @returns Memory add response with ID, storage location, and score
     * @throws {ValidationError} if group_id is invalid or content is empty
     * @throws {AuthenticationError} if auth token is invalid
     */
    add(params: MemoryAddParams): Promise<MemoryAddResponse>;
    /**
     * Search memories across both stores (PostgreSQL + Neo4j).
     * Federated search with results merged by relevance.
     *
     * @param params - Search parameters
     * @returns Search results with relevance scores
     * @throws {ValidationError} if group_id is invalid or query is empty
     */
    search(params: MemorySearchParams): Promise<MemorySearchResponse>;
    /**
     * Retrieve a single memory by ID.
     *
     * @param params - Get parameters (id and group_id)
     * @returns Memory details
     * @throws {ValidationError} if group_id is invalid
     * @throws {NotFoundError} if memory does not exist
     */
    get(params: MemoryGetParams): Promise<MemoryGetResponse>;
    /**
     * List all memories for a user within a tenant.
     * Returns from both stores, merged and sorted.
     *
     * @param params - List parameters
     * @returns Paginated list of memories
     * @throws {ValidationError} if group_id is invalid
     */
    list(params: MemoryListParams): Promise<MemoryListResponse>;
    /**
     * Soft-delete a memory.
     * Appends deletion event to PostgreSQL and marks Neo4j node as deprecated.
     * Original rows remain for audit trail.
     *
     * @param params - Delete parameters (id, group_id, user_id)
     * @returns Deletion confirmation
     * @throws {ValidationError} if group_id is invalid
     * @throws {NotFoundError} if memory does not exist
     */
    delete(params: MemoryDeleteParams): Promise<MemoryDeleteResponse>;
}

/**
 * @allura/sdk — HarnessOperations
 *
 * Typed clients for scenario execution, replay, evaluation, and evidence
 * inspection (Story 24.7 AC-1). All operations go through the same MCP
 * tools/call envelope as memory operations, so they are transport-consistent
 * with the rest of the SDK.
 */

interface ScenarioRunParams {
    /** Scenario file path (repo-relative, e.g. examples/engineering-review-agent/scenarios/success.json) */
    scenario: string;
    /** Run mode: simulate (default) or replay */
    mode?: "simulate" | "replay";
    /** Prior receipt path for replay comparison */
    priorReceipt?: string;
}
interface ScenarioReplayParams {
    /** Scenario file path */
    scenario: string;
    /** Prior receipt path to compare against */
    receipt: string;
}
interface EvalRunParams {
    /** Evaluation suite path (defaults to evals/suites/portfolio.yaml) */
    suite?: string;
}
interface EvidenceInspectParams {
    /** Optional directory to inspect (defaults to cwd receipts + artifacts/) */
    dir?: string;
}
interface ScenarioRunResponse {
    status: "completed" | "failed" | "pending";
    error?: string;
    receiptPath?: string;
}
interface ScenarioReplayResponse {
    identical: boolean;
    divergentFields: string[];
}
interface EvalRunResponse {
    status: "pass" | "fail";
    lanes: Array<{
        name: string;
        status: string;
        metrics?: Record<string, number>;
    }>;
}
interface EvidenceInspectResponse {
    receipts: string[];
    artifacts: string[];
}
declare class HarnessOperations {
    private readonly request;
    constructor(request: RequestFn);
    /**
     * Execute a scenario through the deterministic harness.
     */
    run(params: ScenarioRunParams): Promise<ScenarioRunResponse>;
    /**
     * Replay a scenario against a prior receipt and compare determinism.
     */
    replay(params: ScenarioReplayParams): Promise<ScenarioReplayResponse>;
    /**
     * Run the portfolio evaluation suite.
     */
    eval(params?: EvalRunParams): Promise<EvalRunResponse>;
    /**
     * List evidence artifacts (run receipts + artifacts/ contents).
     */
    inspect(params?: EvidenceInspectParams): Promise<EvidenceInspectResponse>;
}

/**
 * @allura/sdk — AlluraClient
 *
 * Main client class for interacting with Allura Memory.
 * Uses MCP Streamable HTTP transport via the canonical /mcp endpoint.
 *
 * Usage:
 * ```typescript
 * const client = new AlluraClient({
 *   baseUrl: "http://localhost:3201",
 *   authToken: process.env.ALLURA_AUTH_TOKEN,
 * });
 *
 * // Add a memory
 * const result = await client.memory.add({
 *   group_id: "allura-my-tenant",
 *   user_id: "user-123",
 *   content: "Remember this important fact",
 * });
 *
 * // Search memories
 * const results = await client.memory.search({
 *   query: "important fact",
 *   group_id: "allura-my-tenant",
 * });
 * ```
 */

type ClientState = "disconnected" | "connected" | "error";
declare class AlluraClient {
    private readonly baseUrl;
    private readonly authToken;
    private readonly timeout;
    private readonly retries;
    private readonly customFetch;
    private state;
    readonly memory: MemoryOperations;
    readonly harness: HarnessOperations;
    constructor(config: AlluraClientConfig);
    /**
     * Verify connectivity to the Allura Memory server.
     * Calls the /health endpoint and validates the response.
     *
     * @returns Health response from the server
     * @throws {ConnectionError} if the server is unreachable
     * @throws {AlluraError} if the server returns an error
     */
    health(): Promise<HealthResponse>;
    /**
     * Connect to the Allura Memory server.
     * Verifies connectivity by calling the health endpoint.
     *
     * @throws {ConnectionError} if the server is unreachable
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the server.
     * No-op for HTTP clients (connections are not persistent).
     */
    disconnect(): Promise<void>;
    /**
     * Get the current connection state.
     */
    getState(): ClientState;
    /**
     * Check if the client is connected.
     */
    get isConnected(): boolean;
    /**
     * Make a request to the Allura Memory server.
     *
     * Sends an MCP JSON-RPC `tools/call` request to the canonical `/mcp`
     * endpoint and unwraps the tool result payload.
     *
     * @internal
     */
    private makeRequest;
    private unwrapToolResult;
    /**
     * Parse the response body as JSON.
     * Handles empty responses and non-JSON content types gracefully.
     *
     * @internal
     */
    private parseResponseBody;
}

/**
 * @allura/sdk — Custom error classes
 *
 * Hierarchy:
 *   AlluraError
 *   ├── AuthenticationError  (401)
 *   ├── ValidationError       (400)
 *   ├── NotFoundError        (404)
 *   ├── RateLimitError       (429)
 *   ├── ServerError          (500)
 *   └── ConnectionError      (network)
 */
/**
 * Base error class for all Allura SDK errors.
 * Includes machine-readable error code and HTTP status code.
 */
declare class AlluraError extends Error {
    /** Machine-readable error code */
    readonly code: string;
    /** HTTP status code (if applicable) */
    readonly statusCode: number;
    /** Original response body (if available) */
    readonly body?: unknown;
    constructor(message: string, code: string, statusCode: number, body?: unknown);
}
/**
 * Thrown when authentication fails (HTTP 401).
 * The Bearer token is missing, invalid, or expired.
 */
declare class AuthenticationError extends AlluraError {
    constructor(message?: string, body?: unknown);
}
/**
 * Thrown when request validation fails (HTTP 400).
 * Includes group_id format violations and missing required fields.
 */
declare class ValidationError extends AlluraError {
    /** Field-level validation details */
    readonly fields?: Record<string, string[]>;
    constructor(message?: string, fields?: Record<string, string[]>, body?: unknown);
}
/**
 * Thrown when a requested resource is not found (HTTP 404).
 * Includes memory not found and unknown tool errors.
 */
declare class NotFoundError extends AlluraError {
    constructor(message?: string, body?: unknown);
}
/**
 * Thrown when rate limit is exceeded (HTTP 429).
 * Includes retry-after hint when available.
 */
declare class RateLimitError extends AlluraError {
    /** Suggested retry delay in seconds */
    readonly retryAfter?: number;
    constructor(message?: string, retryAfter?: number, body?: unknown);
}
/**
 * Thrown when the server encounters an internal error (HTTP 5xx).
 */
declare class ServerError extends AlluraError {
    constructor(message?: string, statusCode?: number, body?: unknown);
}
/**
 * Thrown when the SDK cannot connect to the Allura server.
 * Network-level errors: DNS failure, connection refused, timeout.
 */
declare class ConnectionError extends AlluraError {
    /** The original cause (if available) */
    readonly cause?: Error;
    constructor(message?: string, cause?: Error);
}
/**
 * Thrown when all retry attempts are exhausted.
 * Wraps the last error that caused the final retry failure.
 */
declare class RetryExhaustedError extends AlluraError {
    /** Number of attempts made */
    readonly attempts: number;
    /** The last error that caused the final retry failure */
    readonly lastError: Error;
    constructor(attempts: number, lastError: Error);
}
/**
 * Create an appropriate AlluraError from an HTTP response.
 *
 * @internal
 */
declare function createErrorFromResponse(statusCode: number, body: unknown): AlluraError;

/**
 * @allura/sdk — Auth helpers
 *
 * Bearer token management for Allura Memory authentication.
 */
/**
 * Resolve an auth token from multiple sources.
 *
 * Priority:
 * 1. Explicit token passed to AlluraClient
 * 2. ALLURA_AUTH_TOKEN environment variable
 * 3. ALLURA_MCP_AUTH_TOKEN environment variable
 * 4. No auth (development mode — server will accept requests without token)
 *
 * @param explicitToken - Token passed directly to the client
 * @returns The resolved token, or undefined if no auth is configured
 */
declare function resolveAuthToken(explicitToken?: string): string | undefined;
/**
 * Validate that an auth token is present when required.
 *
 * @param token - The resolved token
 * @param required - Whether auth is required
 * @throws {Error} if auth is required but no token is available
 */
declare function requireAuthToken(token: string | undefined, required: boolean): void;
/**
 * Create an Authorization header value from a token.
 *
 * @param token - The auth token
 * @returns "Bearer <token>" header value, or undefined if no token
 */
declare function createAuthHeader(token?: string): string | undefined;

/**
 * @allura/sdk — Internal utilities
 *
 * Retry with exponential backoff, group_id validation,
 * and request/response helpers.
 */
/** Default request timeout in milliseconds */
declare const DEFAULT_TIMEOUT = 5000;
/** Default number of retry attempts */
declare const DEFAULT_RETRIES = 3;
/**
 * Validate a group_id against the Allura naming convention.
 * Must match ^allura-[a-z0-9-]+$ (ARCH-001 tenant isolation).
 *
 * @throws {import("./errors.js").ValidationError} if group_id is invalid
 */
declare function validateGroupId(groupId: string): void;
/**
 * Calculate backoff delay with jitter.
 *
 * Formula: min(BASE_BACKOFF * 2^attempt + random_jitter, MAX_BACKOFF)
 *
 * @param attempt - Zero-indexed attempt number
 * @returns Delay in milliseconds
 */
declare function calculateBackoff(attempt: number): number;
/**
 * Determine if an error is retryable.
 *
 * Retryable: ConnectionError, 429 RateLimitError, 5xx ServerError.
 * Not retryable: 400 ValidationError, 401 AuthenticationError, 404 NotFoundError.
 */
declare function isRetryable(error: unknown): boolean;
/**
 * Execute a function with retry and exponential backoff.
 *
 * @param fn - The async function to execute
 * @param retries - Number of retries AFTER the first attempt (0 = single
 *   attempt, no retries). Must be a finite non-negative integer.
 * @returns The result of the function
 * @throws {RetryExhaustedError} if all retries are exhausted
 */
declare function withRetry<T>(fn: () => Promise<T>, retries?: number): Promise<T>;
/**
 * Build request headers with optional Bearer token.
 */
declare function buildHeaders(authToken?: string, contentType?: string): Record<string, string>;
/**
 * Normalize a base URL by removing trailing slashes.
 */
declare function normalizeBaseUrl(url: string): string;

export { AlluraClient, type AlluraClientConfig, AlluraError, AuthenticationError, type ConfidenceScore, ConfidenceScoreSchema, ConnectionError, DEFAULT_RETRIES, DEFAULT_TIMEOUT, type EvalRunParams, type EvalRunResponse, type EvidenceInspectParams, type EvidenceInspectResponse, type GroupId, GroupIdSchema, HarnessOperations, type HealthResponse, HealthResponseSchema, type MemoryAddParams, type MemoryAddResponse, MemoryAddResponseSchema, type MemoryContent, type MemoryDeleteParams, type MemoryDeleteResponse, MemoryDeleteResponseSchema, type MemoryGetParams, type MemoryGetResponse, MemoryGetResponseSchema, type MemoryId, MemoryIdSchema, type MemoryListParams, type MemoryListResponse, MemoryListResponseSchema, MemoryOperations, type MemoryProvenance, type MemoryResponseMeta, type MemoryRetrievalStore, type MemorySearchParams, type MemorySearchResponse, MemorySearchResponseSchema, type MemorySearchResult, type MemorySortOrder, type MemoryStatus, NotFoundError, type PromotionMode, RateLimitError, type RequestFn, RetryExhaustedError, type ScenarioReplayParams, type ScenarioReplayResponse, type ScenarioRunParams, type ScenarioRunResponse, ServerError, type StorageLocation, type UserId, ValidationError, buildHeaders, calculateBackoff, createAuthHeader, createErrorFromResponse, isRetryable, normalizeBaseUrl, requireAuthToken, resolveAuthToken, validateGroupId, withRetry };
