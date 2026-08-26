import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";

export const PROPOSAL_PROJECTION_VERSION = "proposal-semantic-projection/v1";
export const PROJECTION_REDACTION_POLICY_VERSION = "governed-markdown/v1";
type Queryable = Pick<PoolClient, "query">;
type Row = Record<string, unknown>;
export interface ProposalProjectionSources {
  proposal: Row;
  events: Row[];
  evidenceRequests: Row[];
  receipts: Row[];
}
export interface CanonicalSourceRef {
  table: "canonical_proposals" | "events" | "evidence_requests" | "governance_receipts";
  id: string;
  group_id: string;
  workspace_id: string;
}
export interface BuiltProposalProjection {
  sourceKind: "proposal";
  sourceId: string;
  projectionVersion: typeof PROPOSAL_PROJECTION_VERSION;
  sourceRevisionHash: string;
  contentHash: string;
  sourceRefs: CanonicalSourceRef[];
  redactionPolicyVersion: typeof PROJECTION_REDACTION_POLICY_VERSION;
  buildState: "pending_embedding";
  embedding?: never;
  embeddingModel?: never;
  embeddingModelVersion?: never;
  markdown: string;
}
export interface ProjectionEmbeddingResult {
  vector: number[];
  model: string;
  version: string;
}
export type PersistedProposalProjection = Omit<BuiltProposalProjection, "buildState" | "embedding" | "embeddingModel" | "embeddingModelVersion"> & {
  buildState: "pending_embedding" | "ready";
  embeddingModel?: string;
  embeddingModelVersion?: string;
};

export function redactGovernedProjectionText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED:EMAIL]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~-]+/gi, "$1[REDACTED:TOKEN]")
    .replace(/("(?:api[_-]?key|token|secret)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED:SECRET]"')
    .replace(/\b(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED:SECRET]");
}

function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString("hex"));
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function text(value: unknown): string {
  if (value == null) return "none";
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  return redactGovernedProjectionText(String(value).replaceAll("\r\n", "\n").trim());
}
function rowId(row: Row): string { return text(row.id); }
function sorted(rows: Row[]): Row[] { return [...rows].sort((a, b) => rowId(a).localeCompare(rowId(b))); }

export function buildProposalSemanticProjection(scope: ResolvedWorkspaceScope, input: ProposalProjectionSources): BuiltProposalProjection {
  const proposalId = rowId(input.proposal);
  const everySource = [input.proposal, ...input.events, ...input.evidenceRequests, ...input.receipts];
  if (everySource.some((row) => row.group_id !== scope.tenantId || row.workspace_id !== scope.workspaceId)) {
    throw new Error("SemanticProjection sources must belong to the same authenticated scope");
  }
  const families: Array<[CanonicalSourceRef["table"], Row[]]> = [
    ["canonical_proposals", [input.proposal]], ["events", sorted(input.events)],
    ["evidence_requests", sorted(input.evidenceRequests)], ["governance_receipts", sorted(input.receipts)],
  ];
  const sourceRefs = families.flatMap(([table, rows]) => rows.map((row) => ({
    table, id: rowId(row), group_id: scope.tenantId, workspace_id: scope.workspaceId,
  })));
  const evidence = sorted(input.evidenceRequests);
  const receipts = sorted(input.receipts);
  const events = sorted(input.events);
  const markdown = [
    `# Proposal ${proposalId}`,
    `Scope: ${scope.tenantId}/${scope.workspaceId}`,
    `Status: ${text(input.proposal.status)}`,
    `Tier: ${text(input.proposal.tier)}`,
    `Score: ${text(input.proposal.score)}`,
    `Reasoning: ${text(input.proposal.reasoning)}`,
    `Trace identity: ${text(input.proposal.trace_ref)}`,
    "", "## Governed proposal", text(input.proposal.content),
    "", "## Trace and event evidence",
    ...(events.length ? events.map((row) => `- ${rowId(row)} | ${text(row.event_type)} | ${text(row.status)} | actor ${text(row.agent_id)} | ${text(row.created_at)} | metadata ${text(stable(row.metadata ?? {}))} | evidence ${text(stable(row.evidence_references ?? row.evidence ?? []))}`) : ["- none"]),
    "", "## Evidence requests",
    ...(evidence.length ? evidence.map((row) => `- ${rowId(row)} | Evidence request state: ${text(row.state)} | ${text(row.reason)} | requested by ${text(row.requested_by)}`) : ["- Evidence request state: none"]),
    "", "## Decision receipts",
    ...(receipts.length ? receipts.map((row) => `- ${rowId(row)} | ${text(row.action)} | actor ${text(row.actor_id)} (${text(row.actor_role)}) | outbox ${text(row.outbox_state)} | policy ${text(row.policy_reference)}@${text(row.policy_version)} | rationale ${text(row.rationale)} | evidence ${text(stable(row.evidence_references ?? []))}`) : ["- none"]),
    "", `Redaction classification: ${PROJECTION_REDACTION_POLICY_VERSION}`,
  ].join("\n");
  const sourceRevisionHash = hash(stable({ proposal: input.proposal, events, evidenceRequests: evidence, receipts }));
  return {
    sourceKind: "proposal", sourceId: proposalId, projectionVersion: PROPOSAL_PROJECTION_VERSION,
    sourceRevisionHash, contentHash: hash(markdown), sourceRefs,
    redactionPolicyVersion: PROJECTION_REDACTION_POLICY_VERSION,
    buildState: "pending_embedding", markdown,
  };
}

export async function writeProposalSemanticProjection(
  scope: ResolvedWorkspaceScope,
  sources: ProposalProjectionSources,
  db: Queryable,
  embedding?: ProjectionEmbeddingResult,
): Promise<PersistedProposalProjection> {
  const projection = buildProposalSemanticProjection(scope, sources);
  if (embedding && (!embedding.vector.length || !embedding.model.trim() || !embedding.version.trim() || embedding.vector.some((value) => !Number.isFinite(value)))) {
    throw new Error("Embedding result requires a non-empty finite vector and exact nonblank model/version");
  }
  const buildState = embedding ? "ready" : "pending_embedding";
  const vector = embedding ? JSON.stringify(embedding.vector) : null;
  const result = await db.query(
    `INSERT INTO semantic_projections (
       group_id, workspace_id, source_kind, source_id, projection_version,
       source_revision_hash, content_hash, source_refs, redaction_policy_version,
       markdown, embedding, embedding_model, embedding_model_version, build_state
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::vector,$12,$13,$14)
     ON CONFLICT ON CONSTRAINT semantic_projections_idempotency_key DO UPDATE SET
       embedding = EXCLUDED.embedding,
       embedding_model = EXCLUDED.embedding_model,
       embedding_model_version = EXCLUDED.embedding_model_version,
       build_state = EXCLUDED.build_state,
       failure_code = NULL
     WHERE semantic_projections.build_state = 'pending_embedding'
       AND EXCLUDED.build_state = 'ready'
     RETURNING build_state, embedding_model, embedding_model_version`,
    [scope.tenantId, scope.workspaceId, projection.sourceKind, projection.sourceId, projection.projectionVersion,
      projection.sourceRevisionHash, projection.contentHash, JSON.stringify(projection.sourceRefs),
      projection.redactionPolicyVersion, projection.markdown, vector, embedding?.model.trim() ?? null,
      embedding?.version.trim() ?? null, buildState],
  );
  const persisted = result.rows[0] ?? (await db.query(
    `SELECT build_state, embedding_model, embedding_model_version
       FROM semantic_projections
      WHERE group_id=$1 AND workspace_id=$2 AND source_kind=$3 AND source_id=$4
        AND projection_version=$5 AND source_revision_hash=$6 AND content_hash=$7
        AND source_refs=$8::jsonb AND redaction_policy_version=$9
      LIMIT 1`,
    [scope.tenantId, scope.workspaceId, projection.sourceKind, projection.sourceId, projection.projectionVersion,
      projection.sourceRevisionHash, projection.contentHash, JSON.stringify(projection.sourceRefs),
      projection.redactionPolicyVersion],
  )).rows[0];
  if (!persisted) throw new Error("Semantic projection conflict did not resolve to a persisted row");
  return {
    ...projection,
    buildState: (persisted?.build_state ?? buildState) as PersistedProposalProjection["buildState"],
    ...(persisted?.embedding_model || embedding ? { embeddingModel: String(persisted?.embedding_model ?? embedding?.model) } : {}),
    ...(persisted?.embedding_model_version || embedding ? { embeddingModelVersion: String(persisted?.embedding_model_version ?? embedding?.version) } : {}),
  };
}

type ProjectionTransactionRunner = typeof withWorkspaceTransaction;

export async function runProposalSemanticProjectionJob(
  scope: ResolvedWorkspaceScope,
  proposalId: string,
  transactionRunner: ProjectionTransactionRunner = withWorkspaceTransaction,
  embedding?: ProjectionEmbeddingResult,
): Promise<PersistedProposalProjection> {
  return transactionRunner(scope, async (db) => {
    const proposal = await db.query(`SELECT *, trace_ref FROM canonical_proposals WHERE group_id=$1 AND workspace_id=$2 AND id=$3`, [scope.tenantId, scope.workspaceId, proposalId]);
    if (!proposal.rows[0]) throw new Error(`Proposal ${proposalId} not found in authenticated scope`);
    const traceRef = proposal.rows[0].trace_ref;
    const events = traceRef == null
      ? { rows: [] }
      : await db.query(`SELECT * FROM events WHERE group_id=$1 AND workspace_id=$2 AND id=$3 ORDER BY id`, [scope.tenantId, scope.workspaceId, traceRef]);
    const evidenceRequests = await db.query(`SELECT * FROM evidence_requests WHERE group_id=$1 AND workspace_id=$2 AND proposal_id=$3 ORDER BY id`, [scope.tenantId, scope.workspaceId, proposalId]);
    const receipts = await db.query(`SELECT * FROM governance_receipts WHERE group_id=$1 AND workspace_id=$2 AND proposal_id=$3 ORDER BY id`, [scope.tenantId, scope.workspaceId, proposalId]);
    return writeProposalSemanticProjection(scope, { proposal: proposal.rows[0], events: events.rows, evidenceRequests: evidenceRequests.rows, receipts: receipts.rows }, db, embedding);
  });
}
