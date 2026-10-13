import "server-only"

import type { PoolClient } from "pg"
import type { AuthUser } from "@/lib/auth/types"
import { withRestrictedWorkspaceReadTransaction } from "@/lib/db/tenant-transaction"
import {
  assertSubgraphContinuationBindings,
  continuationTimes,
  createSubgraphContinuation,
  decodeSubgraphContinuation,
  hashSubgraphBinding,
  queryWithoutContinuation,
  SubgraphContinuationError,
} from "./continuation"
import {
  FOCUSED_SUBGRAPH_CONTRACT_VERSION,
  normalizeSubgraphQuery,
  serializeNormalizedSubgraphQuery,
  type SubgraphContinuationClaims,
  type SubgraphQuery,
  type SubgraphResponse,
  SubgraphResponseSchema,
} from "./contract"
import {
  FocusedSubgraphReadRepository,
  FocusedSubgraphRepositoryError,
  type FocusedSubgraphRepositoryPage,
  type SubgraphReadScope,
} from "./read-repository"
import { graphV2RolloutState } from "./rollout"

export const FOCUSED_SUBGRAPH_ROUTE_POLICY_VERSION = "focused-subgraph-read-v1"
// Bounds every authority/revision/repository statement in the governed read
// transaction. PostgreSQL cancels over-budget work and the service maps it to
// the sanitized, observable UNAVAILABLE contract.
export const FOCUSED_SUBGRAPH_STATEMENT_TIMEOUT_MS = 5_000

const AUTHORITY_SQL = `
  SELECT workspace_membership.policy_epoch, tenant_membership.role
  FROM brain_workspace_memberships AS workspace_membership
  JOIN memberships AS tenant_membership
    ON tenant_membership.group_id=workspace_membership.group_id
   AND tenant_membership.user_id=workspace_membership.user_id
  JOIN brain_membership_approvals AS approval
    ON approval.approval_id=workspace_membership.approval_id
   AND approval.group_id=workspace_membership.group_id
   AND approval.workspace_id=workspace_membership.workspace_id
   AND approval.subject_user_id=workspace_membership.user_id
   AND approval.policy_epoch=workspace_membership.policy_epoch
  WHERE workspace_membership.group_id=$1 AND workspace_membership.workspace_id=$2
    AND workspace_membership.user_id=$3 AND workspace_membership.revoked_at IS NULL
    AND workspace_membership.approval_id IS NOT NULL
    AND approval.action='grant' AND approval.approver_role='workspace_membership_admin'
    AND approval.verified_at IS NOT NULL AND approval.revoked_at IS NULL AND approval.consumed_at IS NOT NULL
    AND tenant_membership.removed_at IS NULL`

type ReadTransaction = <T>(
  scope: { tenantId: string; workspaceId: string; principalId: string },
  callback: (client: PoolClient) => Promise<T>,
) => Promise<T>

export interface FocusedSubgraphReadServiceOptions {
  continuationSecret: Buffer
  keyVersion?: number
  now?: () => Date
  transaction?: ReadTransaction
  rolloutValue?: () => string | undefined
  repositoryFactory?: (client: PoolClient) => {
    read(scope: SubgraphReadScope, query: ReturnType<typeof normalizeSubgraphQuery>, boundary: SubgraphContinuationClaims["boundary"] | null): Promise<FocusedSubgraphRepositoryPage>
  }
  onUnavailable?: (error: unknown, context: { queryKind: "overview" | "focus"; continuation: boolean }) => void
}

export class FocusedSubgraphServiceError extends Error {
  constructor(readonly kind: "denied" | "malformed" | "authority" | "conflict" | "snapshot" | "unavailable") {
    super(`Focused subgraph ${kind}`)
    this.name = "FocusedSubgraphServiceError"
  }
}

function validRole(value: unknown): value is AuthUser["role"] {
  return value === "viewer" || value === "curator" || value === "admin"
}

function principalScope(principal: AuthUser) {
  if (!principal.id?.trim() || !principal.groupId?.trim() || !principal.workspaceId?.trim() ||
      !principal.sessionId?.trim() || !validRole(principal.role)) {
    throw new FocusedSubgraphServiceError("denied")
  }
  return { tenantId: principal.groupId, workspaceId: principal.workspaceId, principalId: principal.id }
}

export class FocusedSubgraphReadService {
  private readonly secret: Buffer
  private readonly keyVersion: number
  private readonly now: () => Date
  private readonly transaction: ReadTransaction
  private readonly rolloutValue: () => string | undefined
  private readonly repositoryFactory: NonNullable<FocusedSubgraphReadServiceOptions["repositoryFactory"]>
  private readonly onUnavailable: NonNullable<FocusedSubgraphReadServiceOptions["onUnavailable"]>

  constructor(options: FocusedSubgraphReadServiceOptions) {
    if (!Buffer.isBuffer(options.continuationSecret) || options.continuationSecret.length < 32) {
      throw new Error("Focused subgraph continuation secret is unavailable")
    }
    this.secret = Buffer.from(options.continuationSecret)
    this.keyVersion = options.keyVersion ?? 1
    this.now = options.now ?? (() => new Date())
    this.transaction = options.transaction ?? withRestrictedWorkspaceReadTransaction
    this.rolloutValue = options.rolloutValue ?? (() => process.env.ALLURA_GRAPH_V2_ENABLED)
    this.repositoryFactory = options.repositoryFactory ?? ((client) => new FocusedSubgraphReadRepository(client))
    this.onUnavailable = options.onUnavailable ?? (() => undefined)
  }

  async read(principal: AuthUser, rawQuery: SubgraphQuery | unknown): Promise<SubgraphResponse> {
    const rollout = graphV2RolloutState(this.rolloutValue())
    if (!rollout.enabled) return rollout.unavailable

    let query
    try {
      query = normalizeSubgraphQuery(rawQuery)
    } catch {
      return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code: "MALFORMED_QUERY", retryable: false, action: "none" }
    }
    try {
      const scope = principalScope(principal)
      const semanticQuery = queryWithoutContinuation(query)
      const normalizedQueryHash = hashSubgraphBinding(serializeNormalizedSubgraphQuery(semanticQuery))
      const sessionHash = hashSubgraphBinding(principal.sessionId!)

      let continuation: SubgraphContinuationClaims | undefined
      if (query.continuation) {
        try {
          continuation = decodeSubgraphContinuation(query.continuation, this.secret, { now: this.now(), acceptedKeyVersions: [this.keyVersion] })
        } catch {
          return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code: "MALFORMED_CONTINUATION", retryable: false, action: "restart" }
        }
        if (continuation.tenantId !== scope.tenantId || continuation.workspaceId !== scope.workspaceId ||
            continuation.principalId !== scope.principalId || continuation.role !== principal.role ||
            continuation.sessionHash !== sessionHash) {
          return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "denied", reasonCode: "CONTINUATION_AUTHORITY_MISMATCH", action: "restart" }
        }
      }

      return await this.transaction(scope, async (client) => {
        await client.query("SELECT set_config('statement_timeout',$1,true)", [`${FOCUSED_SUBGRAPH_STATEMENT_TIMEOUT_MS}ms`])
        const authority = await client.query<{ policy_epoch: string | number; role: string }>(AUTHORITY_SQL, [scope.tenantId, scope.workspaceId, scope.principalId])
        const authorityRow = authority.rows[0]
        const policyEpoch = Number(authorityRow?.policy_epoch)
        if (!authorityRow || !validRole(authorityRow.role) || authorityRow.role !== principal.role ||
            !Number.isSafeInteger(policyEpoch) || policyEpoch < 1) {
          throw new FocusedSubgraphServiceError("authority")
        }

        const revisionResult = await client.query<{ graph_revision: string | number }>(
          `SELECT graph_revision FROM graph_scope_revisions WHERE group_id=$1 AND workspace_id=$2`,
          [scope.tenantId, scope.workspaceId],
        )
        const graphRevision = Number(revisionResult.rows[0]?.graph_revision ?? 0)
        if (!Number.isSafeInteger(graphRevision) || graphRevision < 0) throw new FocusedSubgraphServiceError("unavailable")

        if (continuation) {
          try {
            assertSubgraphContinuationBindings(continuation, {
              ...scope,
              sessionHash,
              role: authorityRow.role,
              policyEpoch,
              routePolicyVersion: FOCUSED_SUBGRAPH_ROUTE_POLICY_VERSION,
              normalizedQueryHash,
              effectiveBudgets: query.effectiveBudgets,
              graphRevision,
            })
          } catch (error) {
            if (error instanceof SubgraphContinuationError && error.reason === "authority") throw new FocusedSubgraphServiceError("authority")
            if (continuation.graphRevision !== graphRevision) throw new FocusedSubgraphServiceError("snapshot")
            throw new FocusedSubgraphServiceError("conflict")
          }
        }

        const repository = this.repositoryFactory(client)
        const page = await repository.read(scope, query, continuation?.boundary ?? null)
        if (page.ambiguous) {
          return SubgraphResponseSchema.parse({
            contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
            state: "degraded",
            reasonCode: "AMBIGUOUS_ENDPOINTS",
            retryable: false,
            action: "none",
            warnings: ["AMBIGUOUS_ENDPOINTS"],
          })
        }

        const common = {
          contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
          snapshot: { policyEpoch, graphRevision, capturedAt: this.now().toISOString() },
          budgets: { requested: query.requestedBudgets, applied: query.effectiveBudgets },
          nodes: page.nodes,
          edges: page.edges,
          warnings: [] as string[],
          ...(page.inspection ? { inspection: page.inspection } : {}),
        }
        if (page.nodes.length === 0) return SubgraphResponseSchema.parse({ ...common, state: "empty" })

        const moreNodes = page.hasMoreNodes
        const moreEdges = page.hasMoreEdges
        if ((moreNodes || moreEdges) && page.boundary) {
          const nodeBudgetReached = page.nodes.length === query.effectiveBudgets.nodeLimit
          const edgeBudgetReached = page.edges.length === query.effectiveBudgets.edgeLimit
          if (!nodeBudgetReached && !edgeBudgetReached) throw new FocusedSubgraphServiceError("unavailable")
          const times = continuationTimes(this.now())
          const token = createSubgraphContinuation({
            contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION,
            ...scope,
            sessionHash,
            role: authorityRow.role,
            policyEpoch,
            routePolicyVersion: FOCUSED_SUBGRAPH_ROUTE_POLICY_VERSION,
            normalizedQueryHash,
            effectiveBudgets: query.effectiveBudgets,
            graphRevision,
            boundary: page.boundary,
            ...times,
            keyVersion: this.keyVersion,
          }, this.secret)
          return SubgraphResponseSchema.parse({
            ...common,
            state: "partial",
            exhausted: nodeBudgetReached && edgeBudgetReached ? "nodes_and_edges" : nodeBudgetReached ? "nodes" : "edges",
            continuation: token,
          })
        }
        return SubgraphResponseSchema.parse({ ...common, state: "complete" })
      })
    } catch (error) {
      if (error instanceof FocusedSubgraphRepositoryError && error.kind === "malformed") {
        return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code: "MALFORMED_QUERY", retryable: false, action: "none" }
      }
      if (error instanceof FocusedSubgraphServiceError) {
        if (error.kind === "authority" || error.kind === "denied") {
          return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "denied", reasonCode: "INSUFFICIENT_ROLE", action: "request_access" }
        }
        if (error.kind === "snapshot") return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code: "SNAPSHOT_CONFLICT", retryable: false, action: "restart" }
        if (error.kind === "conflict") return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code: "CONTINUATION_CONFLICT", retryable: false, action: "restart" }
      }
      this.onUnavailable(error, { queryKind: query.kind, continuation: Boolean(query.continuation) })
      return { contractVersion: FOCUSED_SUBGRAPH_CONTRACT_VERSION, state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" }
    }
  }
}

export function focusedSubgraphContinuationSecret(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.ALLURA_GRAPH_CONTINUATION_SECRET ?? env.AUTHORIZED_READ_CURSOR_KEY
  if (!raw) throw new Error("Focused subgraph continuation secret is unavailable")
  const decoded = raw.startsWith("base64:") ? Buffer.from(raw.slice(7), "base64") : Buffer.from(raw, "utf8")
  if (decoded.length < 32) throw new Error("Focused subgraph continuation secret is too short")
  return decoded
}
