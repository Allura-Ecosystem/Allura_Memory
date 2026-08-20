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
import { createGraphAdapter } from "@/lib/graph-adapter";
import type { IGraphAdapter } from "@/lib/graph-adapter";
import { validateGroupId } from "@/lib/validation/group-id";
import { syscall_mutate, syscall_query } from "@/control-plane/syscalls";
import type { SyscallContext } from "@/control-plane/syscalls";

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

export interface CreateEntityInput {
  label: MemoryLabel;
  props: Record<string, unknown>;
  group_id: string;
  relationships?: CreateRelationshipInput[];
}

export interface CreateEntityResult {
  node_id: string;
}

export interface CreateRelationshipCallInput {
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

function buildAdapterBackend(): MemoryAPI {
  return {
    async createEntity({
      label,
      props,
      group_id,
      relationships,
    }: CreateEntityInput): Promise<CreateEntityResult> {
      const validatedGroupId = validateGroupId(group_id);
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
          user_id: (props.user_id as string | null) ?? null,
          content,
          score: score as import("@/lib/memory/canonical-contracts").ConfidenceScore,
          provenance,
          created_at: createdAt,
        });
      } else {
        const pool = getPgPool();
        await pool.query(
          `INSERT INTO graph_structural_nodes (node_id, label, group_id, props, created_at)
           VALUES ($1, $2, $3, $4, $5::timestamptz)
           ON CONFLICT (node_id, group_id) DO UPDATE SET props = EXCLUDED.props, updated_at = NOW()`,
          [node_id, label, validatedGroupId, JSON.stringify({ ...props, node_id, group_id: validatedGroupId }), createdAt]
        );

        for (const rel of relationships ?? []) {
          const relType = rel.type;
          const relProps = rel.props ? JSON.stringify(rel.props) : null;
          await pool.query(
            `INSERT INTO graph_structural_edges (from_id, to_id, rel_type, group_id, props, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW()::timestamptz)
             ON CONFLICT (from_id, to_id, rel_type, group_id) DO NOTHING`,
            [
              rel.direction === "in" ? rel.targetId : node_id,
              rel.direction === "in" ? node_id : rel.targetId,
              relType,
              validatedGroupId,
              relProps,
            ]
          );
        }
      }

      return { node_id };
    },

    async createRelationship({
      fromId,
      toId,
      type,
      props,
    }: CreateRelationshipCallInput): Promise<void> {
      const pool = getPgPool();
      const relProps = props ? JSON.stringify(props) : null;
      await pool.query(
        `INSERT INTO graph_structural_edges (from_id, to_id, rel_type, group_id, props, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()::timestamptz)
         ON CONFLICT (from_id, to_id, rel_type, group_id) DO NOTHING`,
        [fromId, toId, type, process.env.DEFAULT_GROUP_ID ?? "allura-system", relProps]
      );
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
      const conditions: string[] = ["label = $1", "group_id = $2"];
      const params: unknown[] = [label, validatedGroupId];
      let paramIdx = 3;

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
    async createEntity({ label, props, group_id, relationships }: CreateEntityInput): Promise<CreateEntityResult> {
      const validatedGroupId = validateGroupId(group_id);
      const node_id = resolveNodeId(props);

      const result = await syscall_mutate(
        {
          type: "insert",
          target: "neo4j:Entity",
          data: {
            label,
            node_id,
            group_id: validatedGroupId,
            ...props,
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
              label: rel.targetLabel,
              group_id: validatedGroupId,
              from_id: fromId,
              to_id: toId,
              type: rel.type,
              node_id: fromId,
              ...(rel.props ?? {}),
            },
          },
          ctx(validatedGroupId)
        );
      }

      return { node_id };
    },

    async createRelationship({ fromId, fromLabel, toId, toLabel, type, props }: CreateRelationshipCallInput): Promise<void> {
      const groupId = (props?.group_id as string) ?? process.env.DEFAULT_GROUP_ID ?? "allura-system";
      const validatedGroupId = validateGroupId(groupId);

      const result = await syscall_mutate(
        {
          type: "insert",
          target: "neo4j:Relationship",
          data: {
            label: fromLabel,
            group_id: validatedGroupId,
            from_id: fromId,
            to_id: toId,
            from_label: fromLabel,
            to_label: toLabel,
            type,
            node_id: fromId,
            ...(props ?? {}),
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
  const useControlPlane = process.env.MEMORY_BYPASS_CONTROL_PLANE !== "true";

  if (useControlPlane) {
    return buildControlPlaneBackend();
  }

  // Fallback: direct adapter access (for migration/testing only)
  // Neo4j direct-driver path removed — PostgreSQL + pgvector only.
  return buildAdapterBackend();
}

/**
 * memoryWithAdapter() — explicit adapter-injected MemoryAPI.
 * For callers that already have an IGraphAdapter and Pool instance.
 * Bypasses env-var selection and uses the provided adapter directly.
 */
export function memoryWithAdapter(adapter: IGraphAdapter, pool: Pool): MemoryAPI {
  const adapterBackend = buildAdapterBackend();
  return adapterBackend;
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
