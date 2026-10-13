/**
 * memory() — Allura Memory Write Wrapper (Story 1.7, Slice C migration)
 *
 * The single interface the MemoryOrchestrator uses for all POST-WRITE operations.
 * Routes writes through the controlPlane syscall layer (default) or the adapter
 * backend (GRAPH_BACKEND=ruvector fallback for testing).
 *
 * Usage:
 *   const { node_id } = await memory().createEntity({ label: 'Task', props: { ... } })
 *   await memory().createRelationship({ fromId, fromLabel, toId, toLabel, type })
 *   const rows = await memory().query(cypher, params)
 *   const results = await memory().search({ label: 'Task', props: { status: 'complete' } })
 *
 * Auto group_id injection: All write operations require group_id and auto-inject it
 * into props if not present.
 *
 * ADR: AD-029 — Graph Adapter Pattern for Neo4j → RuVector Migration
 */

if (typeof window !== "undefined") {
  throw new Error("memory() can only be used server-side");
}

import type { Pool } from "pg";
import { randomUUID } from "crypto";
import { syscall_mutate, syscall_query } from "@/control-plane/syscalls";
import type { SyscallContext } from "@/control-plane/syscalls";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";
import { createGraphAdapter } from "@/lib/graph-adapter";
import type { IGraphAdapter } from "@/lib/graph-adapter";
import { validateGroupId } from "@/lib/validation/group-id";

// ── Types ──────────────────────────────────────────────────────────────────

export type MemoryLabel =
  | "Task"
  | "Decision"
  | "Lesson"
  | "Person"
  | "Project"
  | "Tool"
  | "Context"
  | "Agent"
  | "AgentGroup"
  | "Insight"
  | "Event"
  | "Session"
  | "Memory";

export type RelationshipType =
  | "CONTRIBUTED"
  | "LEARNED"
  | "DECIDED"
  | "COLLABORATED_WITH"
  | "SUPERSEDES"
  | "INFORMED_BY"
  | "APPLIES_TO"
  | "PART_OF"
  | "USES"
  | "INCLUDES"
  | "KNOWS"
  | "PERFORMED"
  | "BELONGS_TO";

export interface CreateRelationshipInput {
  type: RelationshipType;
  targetId: string;
  targetLabel: MemoryLabel;
  targetKey?: string;
  props?: Record<string, unknown>;
  direction?: "out" | "in";
}

export interface VerifiedGraphWriteScope {
  group_id: string;
  workspace_id: string;
  principal_id: string;
}

export interface CreateEntityInput extends VerifiedGraphWriteScope {
  label: MemoryLabel;
  props: Record<string, unknown>;
  /** Server-verified scope; never inferred from a default. */
  relationships?: CreateRelationshipInput[];
}

export interface CreateEntityResult {
  node_id: string;
}

export interface CreateRelationshipCallInput extends VerifiedGraphWriteScope {
  fromId: string;
  fromLabel: MemoryLabel;
  toId: string;
  toLabel: MemoryLabel;
  type: RelationshipType;
  props?: Record<string, unknown>;
}

export interface SearchInput {
  label: MemoryLabel;
  group_id: string;
  workspace_id: string;
  principal_id: string;
  props?: Record<string, unknown>;
  textMatch?: Record<string, string>;
  limit?: number;
}

export interface MemoryAPI {
  createEntity(input: CreateEntityInput): Promise<CreateEntityResult>;
  createRelationship(input: CreateRelationshipCallInput): Promise<void>;
  query<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>
  ): Promise<T[]>;
  search<T = Record<string, unknown>>(input: SearchInput): Promise<T[]>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveNodeId(props: Record<string, unknown>): string {
  return (
    (props.node_id as string | undefined) ??
    (props.task_id as string | undefined) ??
    (props.decision_id as string | undefined) ??
    (props.lesson_id as string | undefined) ??
    (props.agent_id as string | undefined) ??
    (props.session_id as string | undefined) ??
    (props.event_id as string | undefined) ??
    (props.insight_id as string | undefined) ??
    randomUUID()
  );
}

function endpointKind(label: MemoryLabel): "memory" | "structural" {
  return label === "Memory" || label === "Insight" ? "memory" : "structural";
}

function verifiedScope(input: {
  group_id: string;
  workspace_id: string;
  principal_id: string;
}): { groupId: string; workspaceId: string; principalId: string } {
  const groupId = validateGroupId(input.group_id);
  const workspaceId = typeof input.workspace_id === "string" ? input.workspace_id.trim() : "";
  const principalId = typeof input.principal_id === "string" ? input.principal_id.trim() : "";
  if (!workspaceId || !principalId) throw new Error("verified workspace_id and principal_id are required for graph writes");
  return { groupId, workspaceId, principalId };
}

// ── PG Pool singleton (for GRAPH_BACKEND=ruvector) ─────────────────────────

let pgPoolInstance: Pool | null = null;

function getPgPool(): Pool {
  if (!pgPoolInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool: PgPool } = require("pg") as { Pool: new (config: Record<string, unknown>) => Pool };
    const password = process.env.POSTGRES_PASSWORD;
    if (!password) {
      throw new Error("POSTGRES_PASSWORD environment variable is required for GRAPH_BACKEND=ruvector");
    }
    pgPoolInstance = new PgPool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      database: process.env.POSTGRES_DB || "allura",
      user: process.env.POSTGRES_USER || "allura",
      password,
      connectionTimeoutMillis: 10000,
      max: 10,
    });
  }
  return pgPoolInstance!;
}

let adapterInstance: IGraphAdapter | null = null;

function getAdapter(): IGraphAdapter {
  if (!adapterInstance) {
    const pool = getPgPool();
    adapterInstance = createGraphAdapter({ pg: pool });
  }
  return adapterInstance;
}

// ── Adapter Backend (GRAPH_BACKEND=ruvector) ───────────────────────────────

function _buildAdapterBackend(): MemoryAPI {
  return {
    async createEntity({
      label,
      props,
      group_id,
      workspace_id,
      principal_id,
      relationships,
    }: CreateEntityInput): Promise<CreateEntityResult> {
      const { groupId: validatedGroupId, workspaceId, principalId } = verifiedScope({ group_id, workspace_id, principal_id });
      const node_id = resolveNodeId(props);
      const createdAt = (props.created_at as string) ?? new Date().toISOString();

      if (label === "Insight" || label === "Memory") {
        const adapter = getAdapter();
        const content = (props.content as string) ?? (props.summary as string) ?? "";
        const score = (props.score as number) ?? (props.confidence as number) ?? 0.5;
        const provenance = (props.provenance as "conversation" | "manual") ?? "conversation";
        await adapter.createMemory({
          id: node_id as import("@/lib/memory/canonical-contracts").MemoryId,
          group_id: validatedGroupId as import("@/lib/memory/canonical-contracts").GroupId,
          workspace_id: workspaceId,
          principal_id: principalId,
          user_id: (props.user_id as string | null) ?? null,
          content,
          score: score as import("@/lib/memory/canonical-contracts").ConfidenceScore,
          provenance,
          created_at: createdAt,
        });
      } else {
        await withWorkspaceTransaction({ tenantId: validatedGroupId, workspaceId, principalId }, async (db) => {
          await db.query(
            `INSERT INTO graph_structural_nodes (node_id,label,group_id,workspace_id,workspace_scope_state,props,created_at)
             VALUES ($1,$2,$3,$4,'workspace_scoped',$5,$6::timestamptz)
             ON CONFLICT ON CONSTRAINT graph_structural_nodes_scope_identity_key
             DO UPDATE SET props=EXCLUDED.props,updated_at=NOW()`,
            [node_id, label, validatedGroupId, workspaceId, JSON.stringify({ ...props, node_id }), createdAt],
          );
          for (const rel of relationships ?? []) {
            const incoming = rel.direction === "in";
            await db.query(
              `INSERT INTO graph_structural_edges
                 (from_id,from_kind,to_id,to_kind,rel_type,group_id,workspace_id,workspace_scope_state,endpoint_state,props,created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'workspace_scoped','resolved',$8,NOW())
               ON CONFLICT ON CONSTRAINT graph_structural_edges_scope_identity_key DO NOTHING`,
              [incoming ? rel.targetId : node_id, incoming ? endpointKind(rel.targetLabel) : endpointKind(label),
               incoming ? node_id : rel.targetId, incoming ? endpointKind(label) : endpointKind(rel.targetLabel),
               rel.type, validatedGroupId, workspaceId, rel.props ? JSON.stringify(rel.props) : null],
            );
          }
        });
      }

      return { node_id };
    },

    async createRelationship({
      fromId,
      fromLabel,
      toId,
      toLabel,
      type,
      group_id,
      workspace_id,
      principal_id,
      props,
    }: CreateRelationshipCallInput): Promise<void> {
      const { workspaceId, principalId, groupId: validatedGroupId } = verifiedScope({ group_id, workspace_id, principal_id });
      await withWorkspaceTransaction({ tenantId: validatedGroupId, workspaceId, principalId }, (db) => db.query(
        `INSERT INTO graph_structural_edges
           (from_id,from_kind,to_id,to_kind,rel_type,group_id,workspace_id,workspace_scope_state,endpoint_state,props,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'workspace_scoped','resolved',$8,NOW())
         ON CONFLICT ON CONSTRAINT graph_structural_edges_scope_identity_key DO NOTHING`,
        [fromId, endpointKind(fromLabel), toId, endpointKind(toLabel), type,
         validatedGroupId, workspaceId, props ? JSON.stringify(props) : null],
      ));
    },

    async query<T = Record<string, unknown>>(
      _cypher: string,
      _params?: Record<string, unknown>
    ): Promise<T[]> {
      throw new Error(
        "Raw Cypher queries are not supported with GRAPH_BACKEND=ruvector. " +
        "Use adapter search methods or migrate to PG queries."
      );
    },

    async search<T = Record<string, unknown>>({
      label,
      group_id,
      workspace_id,
      principal_id,
      props,
      textMatch,
      limit = 10,
    }: SearchInput): Promise<T[]> {
      const validatedGroupId = validateGroupId(group_id);

      if (label === "Insight" || label === "Memory") {
        const adapter = getAdapter();
        const query = textMatch
          ? Object.values(textMatch).join(" ")
          : props
            ? Object.values(props).filter((v): v is string => typeof v === "string").join(" ")
            : "";
        if (!query) return [];
        const results = await adapter.searchMemories({
          query,
          group_id: validatedGroupId as import("@/lib/memory/canonical-contracts").GroupId,
          workspace_id,
          principal_id,
          limit,
        });
        return results.map((r) => ({
          node_id: r.id,
          content: r.content,
          score: r.score,
          provenance: r.provenance,
          created_at: r.created_at,
          tags: r.tags,
        })) as unknown as T[];
      }

      const pool = getPgPool();
      const conditions: string[] = ["label = $1", "group_id = $2", "workspace_id = $3", "workspace_scope_state = 'workspace_scoped'"];
      const params: unknown[] = [label, validatedGroupId, workspace_id];
      let paramIdx = 4;

      if (props) {
        for (const [key, value] of Object.entries(props)) {
          conditions.push(`props @> $${paramIdx}::jsonb`);
          params.push(JSON.stringify({ [key]: value }));
          paramIdx++;
        }
      }

      if (textMatch) {
        for (const [key, value] of Object.entries(textMatch)) {
          conditions.push(`props->>$${paramIdx} ILIKE $${paramIdx + 1}`);
          params.push(key, `%${value}%`);
          paramIdx += 2;
        }
      }

      params.push(limit);
      const result = await pool.query(
        `SELECT node_id, label, props FROM graph_structural_nodes
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        params
      );

      return result.rows.map((row) => ({
        ...(row.props as Record<string, unknown>),
        node_id: row.node_id,
        label: row.label,
      })) as unknown as T[];
    },
  };
}

// ── ControlPlane Backend (default, MEMORY_BYPASS_CONTROL_PLANE != "true") ─────────────────

function buildControlPlaneBackend(): MemoryAPI {
  function ctx(groupId: string, actor = "system"): SyscallContext {
    return { actor, group_id: groupId, permission_tier: "plugin" };
  }

  return {
    async createEntity({ label, props, group_id, workspace_id, principal_id, relationships }: CreateEntityInput): Promise<CreateEntityResult> {
      const { groupId: validatedGroupId, workspaceId, principalId } = verifiedScope({ group_id, workspace_id, principal_id });
      const node_id = resolveNodeId(props);

      const result = await syscall_mutate(
        {
          type: "insert",
          target: "neo4j:Entity",
          data: {
            ...props,
            label,
            node_id,
            group_id: validatedGroupId,
            workspace_id: workspaceId,
            principal_id: principalId,
            created_at: props.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        ctx(validatedGroupId)
      );

      if (!result.success) {
        throw new Error(result.error ?? "ControlPlane mutate failed for createEntity");
      }

      for (const rel of relationships ?? []) {
        const fromId = rel.direction === "in" ? rel.targetId : node_id;
        const toId = rel.direction === "in" ? node_id : rel.targetId;

        await syscall_mutate(
          {
            type: "insert",
            target: "neo4j:Relationship",
            data: {
              ...(rel.props ?? {}),
              label: rel.targetLabel,
              group_id: validatedGroupId,
              workspace_id: workspaceId,
              principal_id: principalId,
              from_id: fromId,
              to_id: toId,
              from_kind: rel.direction === "in" ? endpointKind(rel.targetLabel) : endpointKind(label),
              to_kind: rel.direction === "in" ? endpointKind(label) : endpointKind(rel.targetLabel),
              type: rel.type,
              node_id: fromId,
            },
          },
          ctx(validatedGroupId)
        );
      }

      return { node_id };
    },

    async createRelationship({ fromId, fromLabel, toId, toLabel, type, group_id, workspace_id, principal_id, props }: CreateRelationshipCallInput): Promise<void> {
      const { groupId: validatedGroupId, workspaceId, principalId } = verifiedScope({ group_id, workspace_id, principal_id });

      const result = await syscall_mutate(
        {
          type: "insert",
          target: "neo4j:Relationship",
          data: {
            ...(props ?? {}),
            label: fromLabel,
            group_id: validatedGroupId,
            workspace_id: workspaceId,
            principal_id: principalId,
            from_id: fromId,
            to_id: toId,
            from_label: fromLabel,
            to_label: toLabel,
            from_kind: endpointKind(fromLabel),
            to_kind: endpointKind(toLabel),
            type,
            node_id: fromId,
          },
        },
        ctx(validatedGroupId)
      );

      if (!result.success) {
        throw new Error(result.error ?? "ControlPlane mutate failed for createRelationship");
      }
    },

    async query<T = Record<string, unknown>>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
      const groupId = (params?.group_id as string) ?? process.env.DEFAULT_GROUP_ID ?? "allura-system";

      const result = await syscall_query(
        {
          target: "neo4j:Query",
          query: { group_id: groupId, label: "Memory", cypher, ...params },
          limit: (params?.limit as number) ?? 100,
        },
        ctx(groupId)
      );

      return (result.data ?? []) as T[];
    },

    async search<T = Record<string, unknown>>({ label, group_id, props, textMatch, limit = 10 }: SearchInput): Promise<T[]> {
      const validatedGroupId = validateGroupId(group_id);

      const result = await syscall_query(
        {
          target: "neo4j:Query",
          query: {
            group_id: validatedGroupId,
            label,
            ...(props ?? {}),
            ...(textMatch ? { textMatch } : {}),
          },
          limit,
        },
        ctx(validatedGroupId)
      );

      return (result.data ?? []) as T[];
    },
  };
}

// ── Public export ──────────────────────────────────────────────────────────

/**
 * memory() — returns a MemoryAPI scoped to the current call.
 *
 * Routes through the controlPlane syscall layer by default. When
 * MEMORY_BYPASS_CONTROL_PLANE=true, falls back to the adapter backend
 * (IGraphAdapter + PG structural tables) for testing only.
 *
 * @example
 * const { node_id } = await memory().createEntity({
 *   label: 'Task',
 *   group_id: 'allura-faith-meats',
 *   props: { task_id: randomUUID(), goal: 'Generate schema', status: 'complete' },
 * });
 *
 * await memory().createRelationship({
 *   fromId: 'memory-builder',
 *   fromLabel: 'Person',
 *   toId: node_id,
 *   toLabel: 'Task',
 *   type: 'CONTRIBUTED',
 *   props: { on: new Date().toISOString(), result: 'complete' },
 * });
 *
 * const tasks = await memory().search({
 *   label: 'Task',
 *   group_id: 'allura-faith-meats',
 *   props: { status: 'complete' },
 *   limit: 10,
 * });
 */
export function memory(): MemoryAPI {
  // MEMORY_BYPASS_KERNEL is the pre-rename name, still documented in AD-40.
  // Read it as a fallback: unlike RUVIX_CONTROL_PLANE_SECRET, which fails loudly
  // when unset, a stale boolean flag would fail SILENTLY — an operator mid-migration
  // would lose the bypass and every write would reroute through syscall_mutate,
  // changing which policies apply, with no error to explain it.
  const legacyBypass = process.env.MEMORY_BYPASS_KERNEL;
  if (legacyBypass !== undefined && process.env.MEMORY_BYPASS_CONTROL_PLANE === undefined) {
    console.warn(
      "[deprecated] MEMORY_BYPASS_KERNEL is renamed to MEMORY_BYPASS_CONTROL_PLANE. " +
        "Honouring the old name for now; update your environment before it is removed."
    );
  }
  const bypass = process.env.MEMORY_BYPASS_CONTROL_PLANE ?? legacyBypass;
  const useControlPlane = bypass !== "true";

  if (useControlPlane) {
    return buildControlPlaneBackend();
  }

  throw new Error(
    "direct adapter fallback is retired: workspace-governed memory operations must use the control plane",
  );
}

/**
 * memoryWithAdapter() — explicit adapter-injected MemoryAPI.
 * For callers that already have an IGraphAdapter and Pool instance.
 * Bypasses env-var selection and uses the provided adapter directly.
 */
export function memoryWithAdapter(_adapter: IGraphAdapter, _pool: Pool): MemoryAPI {
  throw new Error(
    "direct adapter fallback is retired: workspace-governed memory operations must use the control plane",
  );
}

// Backward compatibility exports
/** @deprecated Use createEntity instead */
export const write = (...args: Parameters<MemoryAPI["createEntity"]>) =>
  memory().createEntity(...args);
/** @deprecated Use createRelationship instead */
export const relate = (...args: Parameters<MemoryAPI["createRelationship"]>) =>
  memory().createRelationship(...args);
/** @deprecated Use query instead */
export const read = (...args: Parameters<MemoryAPI["query"]>) =>
  memory().query(...args);
