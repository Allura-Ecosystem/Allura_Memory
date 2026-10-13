import type { PoolClient } from "pg"
import type { z } from "zod/v4"
import {
  type NormalizedSubgraphQuery,
  type QualifiedNodeKey,
  type SubgraphEdge,
  type SubgraphNode,
  type SubgraphOrderingBoundarySchema,
} from "./contract"

type Boundary = z.infer<typeof SubgraphOrderingBoundarySchema>

export interface SubgraphReadScope { tenantId: string; workspaceId: string }
export interface FocusedSubgraphRepositoryPage {
  nodes: SubgraphNode[]
  edges: SubgraphEdge[]
  inspection?: {
    nodeKey: QualifiedNodeKey
    scope: { tenantId: string; workspaceId: string }
    content?: string
    summary?: string
    provenance: SubgraphNode["source"]
    evidence: SubgraphNode["evidence"]
    lineage: Array<{ newerNodeKey: QualifiedNodeKey; supersededNodeKey: QualifiedNodeKey; relationshipKey: string }>
    relationshipKeys: string[]
  }
  ambiguous: boolean
  hasMoreNodes: boolean
  hasMoreEdges: boolean
  boundary: Boundary | null
}

export class FocusedSubgraphRepositoryError extends Error {
  constructor(readonly kind: "malformed") {
    super("Focused subgraph repository query is not representable within the requested closure budget")
    this.name = "FocusedSubgraphRepositoryError"
  }
}

type NodeRow = {
  entity_type: "memory" | "structural"; record_id: string; record_kind: string; label: string
  summary: string | null; content: string | null; version: number | null; deprecated: boolean | null
  created_at: Date | string; updated_at: Date | string | null; evidence_refs: unknown
}
type EdgeRow = {
  edge_id: string; from_id: string; from_kind: "memory" | "structural"; to_id: string
  to_kind: "memory" | "structural"; rel_type: string; created_at: Date | string
  source_table: "graph_structural_edges" | "graph_supersedes"; edge_depth: number | string
  traversal_direction: "incoming" | "outgoing"; from_distance: number | string; to_distance: number | string
}
type RootRow = {
  entity_type: "memory" | "structural"; record_id: string; kind_rank: number | string
  freshness_at: Date | string; node_key: string
}

const PRODUCT_KIND = new Set(["Agent", "Team", "Project"])
const STRUCTURAL_KIND_ALLOWLIST = new Set([
  "Agent", "AgentGroup", "Context", "Decision", "Event", "Insight", "Lesson", "Person",
  "Project", "Session", "Task", "Team", "Tool",
])
const CANONICAL_RELATIONSHIPS = new Set(["AUTHORED_BY", "RELATES_TO", "MEMBER_OF", "CONTRIBUTES_TO", "SUPERSEDES"])
const RELATIONSHIP_ALIASES: Readonly<Record<string, string>> = {
  CONTRIBUTED: "CONTRIBUTES_TO", BELONGS_TO: "MEMBER_OF", PART_OF: "MEMBER_OF", INFORMED_BY: "RELATES_TO",
}
const RELATIONSHIP_ALIAS_RULE = { ruleId: "relationship-alias-canonicalization", ruleVersion: 1 } as const

function compareCodepoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!)
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index]! - rightPoints[index]!
  }
  return leftPoints.length - rightPoints.length
}
function iso(value: Date | string | null): string {
  const date = value instanceof Date ? value : new Date(value ?? 0)
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString()
}
function safeKind(value: string): string { return /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value) ? value : "Unknown" }
function key(kind: "memory" | "structural", id: string): QualifiedNodeKey { return `${kind}:${id}` as QualifiedNodeKey }
function splitKey(nodeKey: QualifiedNodeKey): ["memory" | "structural", string] {
  const separator = nodeKey.indexOf(":")
  return [nodeKey.slice(0, separator) as "memory" | "structural", nodeKey.slice(separator + 1)]
}
function kindRank(node: Pick<SubgraphNode, "entityType" | "kind">): number {
  if (node.kind.classification === "product") return ["Memory", "Agent", "Team", "Project"].indexOf(node.kind.name)
  return node.entityType === "structural" ? 10 : 20
}
function evidence(value: unknown): SubgraphNode["evidence"] {
  const references = Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))].sort(compareCodepoints)
    : []
  return references.length > 0 ? { state: "available", references } : { state: "absent" }
}
function mapNode(row: NodeRow, distance: number): SubgraphNode {
  const observedAt = iso(row.updated_at ?? row.created_at)
  const recordKind = safeKind(row.record_kind)
  const isAgentGroup = row.entity_type === "structural" && recordKind === "AgentGroup"
  const isAllowedStructural = row.entity_type === "structural" && STRUCTURAL_KIND_ALLOWLIST.has(recordKind)
  const nodeKind: SubgraphNode["kind"] = row.entity_type === "memory"
    ? { classification: "product", name: "Memory" }
    : isAgentGroup ? { classification: "product", name: "Team" }
      : PRODUCT_KIND.has(recordKind) ? { classification: "product", name: recordKind as "Agent" | "Team" | "Project" }
        : { classification: isAllowedStructural ? "structural" : "unknown", name: recordKind }
  const source: SubgraphNode["source"] = isAgentGroup
    ? { kind: "derivation", ruleId: "agent-group-to-team", ruleVersion: 1, sourceRecordKeys: [`graph_structural_nodes:${row.record_id}`] }
    : { kind: "record", recordType: row.entity_type === "memory" ? "graph_memories" : "graph_structural_nodes", recordKey: row.record_id }
  const mapped: SubgraphNode = {
    key: key(row.entity_type, row.record_id), entityType: row.entity_type, kind: nodeKind,
    label: row.label.slice(0, 512) || `${recordKind} ${row.record_id.slice(0, 12)}`,
    ...(row.summary?.trim() ? { summary: row.summary.slice(0, 2_000) } : {}),
    source, freshness: { state: "current", observedAt },
    evidence: row.entity_type === "memory" ? evidence(row.evidence_refs) : { state: "absent" },
    ...(row.entity_type === "memory" && row.version !== null ? { version: { version: row.version, deprecated: Boolean(row.deprecated) } } : {}),
    order: { distance, kindRank: 0 },
  }
  mapped.order.kindRank = kindRank(mapped)
  return mapped
}
function relationshipKind(value: string): SubgraphEdge["kind"] {
  const normalized = safeKind(value.toUpperCase())
  const canonical = RELATIONSHIP_ALIASES[normalized] ?? normalized
  return CANONICAL_RELATIONSHIPS.has(canonical)
    ? { classification: "canonical", name: canonical as "AUTHORED_BY" | "RELATES_TO" | "MEMBER_OF" | "CONTRIBUTES_TO" | "SUPERSEDES" }
    : { classification: "unknown", name: canonical }
}
function mapEdge(row: EdgeRow): SubgraphEdge {
  const normalized = safeKind(row.rel_type.toUpperCase())
  const sourceRecordKey = `${row.source_table}:${row.edge_id}`
  return {
    key: `edge:${sourceRecordKey}`, sourceNodeKey: key(row.from_kind, row.from_id), targetNodeKey: key(row.to_kind, row.to_id),
    kind: relationshipKind(row.rel_type), label: row.rel_type.slice(0, 256),
    source: RELATIONSHIP_ALIASES[normalized]
      ? { kind: "derivation", ...RELATIONSHIP_ALIAS_RULE, sourceRecordKeys: [sourceRecordKey] }
      : { kind: "record", recordType: row.source_table, recordKey: row.edge_id },
    freshness: { state: "current", observedAt: iso(row.created_at) }, evidence: { state: "absent" },
    order: { depth: Number(row.edge_depth), direction: row.traversal_direction },
  }
}
function compareNodes(left: SubgraphNode, right: SubgraphNode): number {
  return left.order.distance - right.order.distance || left.order.kindRank - right.order.kindRank ||
    Date.parse(right.freshness.observedAt) - Date.parse(left.freshness.observedAt) || compareCodepoints(left.key, right.key)
}
function compareEdges(left: SubgraphEdge, right: SubgraphEdge): number {
  return left.order.depth - right.order.depth || compareCodepoints(left.kind.name, right.kind.name) ||
    compareCodepoints(left.order.direction, right.order.direction) || compareCodepoints(left.sourceNodeKey, right.sourceNodeKey) ||
    compareCodepoints(left.targetNodeKey, right.targetNodeKey) || compareCodepoints(left.key, right.key)
}

const STRUCTURAL_OUTPUT_KIND_SQL = `CASE WHEN n.label='AgentGroup' THEN 'Team'
  WHEN n.label ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,127}$' THEN n.label ELSE 'Unknown' END`
const STRUCTURAL_KIND_RANK_SQL = `CASE WHEN n.label='Agent' THEN 1 WHEN n.label IN ('AgentGroup','Team') THEN 2
  WHEN n.label='Project' THEN 3 ELSE 10 END`
const CANONICAL_RELATIONSHIP_SQL = `CASE upper(e.rel_type)
  WHEN 'CONTRIBUTED' THEN 'CONTRIBUTES_TO' WHEN 'BELONGS_TO' THEN 'MEMBER_OF'
  WHEN 'PART_OF' THEN 'MEMBER_OF' WHEN 'INFORMED_BY' THEN 'RELATES_TO'
  ELSE CASE WHEN upper(e.rel_type) ~ '^[A-Z][A-Z0-9_.:-]{0,127}$' THEN upper(e.rel_type) ELSE 'Unknown' END END`
const FOCUS_NODE_CATALOG_SQL = `
  SELECT 'memory'::text AS entity_type,m.id AS record_id,'Memory'::text AS output_kind FROM graph_memories m
  WHERE m.group_id=$1 AND m.workspace_id=$2 AND m.workspace_scope_state='workspace_scoped'
    AND m.deleted_at IS NULL AND (m.deprecated=false OR $6::boolean)
  UNION ALL
  SELECT 'structural',n.node_id,${STRUCTURAL_OUTPUT_KIND_SQL} FROM graph_structural_nodes n
  WHERE n.group_id=$1 AND n.workspace_id=$2 AND n.workspace_scope_state='workspace_scoped'`
const OVERVIEW_NODE_CATALOG_SQL = `
  SELECT 'memory'::text AS entity_type,m.id AS record_id,'Memory'::text AS output_kind FROM graph_memories m
  WHERE m.group_id=$1 AND m.workspace_id=$2 AND m.workspace_scope_state='workspace_scoped'
    AND m.deleted_at IS NULL AND m.deprecated=false
  UNION ALL
  SELECT 'structural',n.node_id,${STRUCTURAL_OUTPUT_KIND_SQL} FROM graph_structural_nodes n
  WHERE n.group_id=$1 AND n.workspace_id=$2 AND n.workspace_scope_state='workspace_scoped'`

const NODE_SQL = `
  WITH requested(entity_type, record_id) AS (SELECT * FROM unnest($3::text[], $4::text[]))
  SELECT 'memory'::text AS entity_type,m.id AS record_id,'Memory'::text AS record_kind,
         left(regexp_replace(m.content,E'\\s+',' ','g'),120) AS label,
         left(regexp_replace(m.content,E'\\s+',' ','g'),280) AS summary,m.content,
         m.version,m.deprecated,m.created_at,NULL::timestamptz AS updated_at,
         COALESCE((SELECT jsonb_agg(DISTINCT ref.value ORDER BY ref.value)
                   FROM canonical_proposals p
                   JOIN governance_receipts r ON r.group_id=p.group_id AND r.workspace_id=p.workspace_id AND r.proposal_id=p.id
                   CROSS JOIN LATERAL jsonb_array_elements_text(r.evidence_references) ref(value)
                   WHERE p.group_id=m.group_id AND p.workspace_id=m.workspace_id AND p.approved_memory_id=m.id),'[]'::jsonb) AS evidence_refs
  FROM graph_memories m JOIN requested q ON q.entity_type='memory' AND q.record_id=m.id
  WHERE m.group_id=$1 AND m.workspace_id=$2 AND m.workspace_scope_state='workspace_scoped'
    AND m.deleted_at IS NULL AND (m.deprecated=false OR $5::boolean)
  UNION ALL
  SELECT 'structural',n.node_id,n.label,
         left(COALESCE(NULLIF(n.props->>'name',''),NULLIF(n.props->>'title',''),NULLIF(n.props->>'summary',''),n.label),512),
         left(NULLIF(n.props->>'summary',''),2000),NULL::text,NULL::integer,NULL::boolean,n.created_at,n.updated_at,'[]'::jsonb
  FROM graph_structural_nodes n JOIN requested q ON q.entity_type='structural' AND q.record_id=n.node_id
  WHERE n.group_id=$1 AND n.workspace_id=$2 AND n.workspace_scope_state='workspace_scoped'`

export const FOCUSED_SUBGRAPH_OVERVIEW_EDGE_SQL = `
WITH node_catalog AS (${OVERVIEW_NODE_CATALOG_SQL}), eligible AS (
  SELECT encode(digest(concat_ws(E'\\x1f',e.from_kind,e.from_id,e.to_kind,e.to_id,e.rel_type),'sha256'),'hex') AS edge_id,
         e.from_id,e.from_kind,e.to_id,e.to_kind,e.rel_type,e.created_at,'graph_structural_edges'::text AS source_table,
         0::integer AS edge_depth,'outgoing'::text AS traversal_direction,0::integer AS from_distance,0::integer AS to_distance,
         ${CANONICAL_RELATIONSHIP_SQL} AS relationship_kind,e.from_kind||':'||e.from_id AS source_node_key,
         e.to_kind||':'||e.to_id AS target_node_key,
         'edge:graph_structural_edges:'||encode(digest(concat_ws(E'\\x1f',e.from_kind,e.from_id,e.to_kind,e.to_id,e.rel_type),'sha256'),'hex') AS edge_key
  FROM graph_structural_edges e
  JOIN node_catalog source ON source.entity_type=e.from_kind AND source.record_id=e.from_id
  JOIN node_catalog target ON target.entity_type=e.to_kind AND target.record_id=e.to_id
  WHERE e.group_id=$1 AND e.workspace_id=$2 AND e.workspace_scope_state='workspace_scoped' AND e.endpoint_state='resolved'
    AND (cardinality($3::text[])=0 OR ${CANONICAL_RELATIONSHIP_SQL}=ANY($3::text[]))
    AND (cardinality($4::text[])=0 OR (source.output_kind=ANY($4::text[]) AND target.output_kind=ANY($4::text[])))
)
SELECT edge_id,from_id,from_kind,to_id,to_kind,rel_type,created_at,source_table,edge_depth,traversal_direction,from_distance,to_distance
FROM eligible WHERE $5::text IS NULL OR
  (relationship_kind COLLATE "C",traversal_direction COLLATE "C",source_node_key COLLATE "C",target_node_key COLLATE "C",edge_key COLLATE "C") >
  ($5::text COLLATE "C",$6::text COLLATE "C",$7::text COLLATE "C",$8::text COLLATE "C",$9::text COLLATE "C")
ORDER BY relationship_kind COLLATE "C",traversal_direction COLLATE "C",source_node_key COLLATE "C",target_node_key COLLATE "C",edge_key COLLATE "C" LIMIT $10`

export const FOCUSED_SUBGRAPH_FOCUS_EDGE_SQL = `
WITH RECURSIVE node_catalog AS (${FOCUS_NODE_CATALOG_SQL}),
walk(node_kind,node_id,distance,path,edge_id,from_id,from_kind,to_id,to_kind,rel_type,created_at,source_table,traversal_direction) AS (
  SELECT $3::text,$4::text,0,ARRAY[$3::text||':'||$4::text],NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::timestamptz,NULL::text,NULL::text
  UNION ALL
  SELECT adjacent.next_kind,adjacent.next_id,walk.distance+1,walk.path||(adjacent.next_kind||':'||adjacent.next_id),
         adjacent.edge_id,adjacent.from_id,adjacent.from_kind,adjacent.to_id,adjacent.to_kind,
         adjacent.rel_type,adjacent.created_at,adjacent.source_table,adjacent.traversal_direction
  FROM walk CROSS JOIN LATERAL (
    SELECT encode(digest(concat_ws(E'\\x1f',e.from_kind,e.from_id,e.to_kind,e.to_id,e.rel_type),'sha256'),'hex') AS edge_id,
           e.from_id,e.from_kind,e.to_id,e.to_kind,e.rel_type,e.created_at,'graph_structural_edges'::text AS source_table,
           'outgoing'::text AS traversal_direction,e.to_kind AS next_kind,e.to_id AS next_id
    FROM LATERAL (
      SELECT candidate.* FROM graph_structural_edges candidate
      WHERE candidate.group_id=$1 AND candidate.workspace_id=$2
        AND candidate.workspace_scope_state='workspace_scoped' AND candidate.endpoint_state='resolved'
        AND candidate.from_kind=walk.node_kind AND candidate.from_id=walk.node_id
        AND (cardinality($8::text[])=0 OR ${CANONICAL_RELATIONSHIP_SQL.replaceAll("e.", "candidate.")}=ANY($8::text[]))
      OFFSET 0
    ) e
    JOIN node_catalog source ON source.entity_type=e.from_kind AND source.record_id=e.from_id
    JOIN node_catalog target ON target.entity_type=e.to_kind AND target.record_id=e.to_id
    WHERE $5::text IN ('outgoing','both')
    UNION ALL
    SELECT encode(digest(concat_ws(E'\\x1f',e.from_kind,e.from_id,e.to_kind,e.to_id,e.rel_type),'sha256'),'hex'),
           e.from_id,e.from_kind,e.to_id,e.to_kind,e.rel_type,e.created_at,'graph_structural_edges','incoming',e.from_kind,e.from_id
    FROM LATERAL (
      SELECT candidate.* FROM graph_structural_edges candidate
      WHERE candidate.group_id=$1 AND candidate.workspace_id=$2
        AND candidate.workspace_scope_state='workspace_scoped' AND candidate.endpoint_state='resolved'
        AND candidate.to_kind=walk.node_kind AND candidate.to_id=walk.node_id
        AND (cardinality($8::text[])=0 OR ${CANONICAL_RELATIONSHIP_SQL.replaceAll("e.", "candidate.")}=ANY($8::text[]))
      OFFSET 0
    ) e
    JOIN node_catalog source ON source.entity_type=e.from_kind AND source.record_id=e.from_id
    JOIN node_catalog target ON target.entity_type=e.to_kind AND target.record_id=e.to_id
    WHERE $5::text IN ('incoming','both')
    UNION ALL
    SELECT encode(digest(concat_ws(E'\\x1f','memory',s.newer_id,'memory',s.superseded_id,'SUPERSEDES'),'sha256'),'hex'),
           s.newer_id,'memory',s.superseded_id,'memory','SUPERSEDES',s.created_at,'graph_supersedes','outgoing','memory',s.superseded_id
    FROM graph_supersedes s
    JOIN node_catalog source ON source.entity_type='memory' AND source.record_id=s.newer_id
    JOIN node_catalog target ON target.entity_type='memory' AND target.record_id=s.superseded_id
    WHERE $6::boolean AND $5::text IN ('outgoing','both') AND s.group_id=$1 AND s.workspace_id=$2
      AND s.workspace_scope_state='workspace_scoped' AND walk.node_kind='memory' AND s.newer_id=walk.node_id
      AND (cardinality($8::text[])=0 OR 'SUPERSEDES'=ANY($8::text[]))
    UNION ALL
    SELECT encode(digest(concat_ws(E'\\x1f','memory',s.newer_id,'memory',s.superseded_id,'SUPERSEDES'),'sha256'),'hex'),
           s.newer_id,'memory',s.superseded_id,'memory','SUPERSEDES',s.created_at,'graph_supersedes','incoming','memory',s.newer_id
    FROM graph_supersedes s
    JOIN node_catalog source ON source.entity_type='memory' AND source.record_id=s.newer_id
    JOIN node_catalog target ON target.entity_type='memory' AND target.record_id=s.superseded_id
    WHERE $6::boolean AND $5::text IN ('incoming','both') AND s.group_id=$1 AND s.workspace_id=$2
      AND s.workspace_scope_state='workspace_scoped' AND walk.node_kind='memory' AND s.superseded_id=walk.node_id
      AND (cardinality($8::text[])=0 OR 'SUPERSEDES'=ANY($8::text[]))
  ) adjacent
  WHERE walk.distance<$7::integer AND NOT (adjacent.next_kind||':'||adjacent.next_id)=ANY(walk.path)
), node_distances AS (
  SELECT node_kind,node_id,min(distance)::integer AS distance FROM walk GROUP BY node_kind,node_id
), walk_edges AS (
  SELECT edge_id,from_id,from_kind,to_id,to_kind,rel_type,created_at,source_table,
         walk.distance::integer AS edge_depth,traversal_direction,source.distance AS from_distance,target.distance AS to_distance,
         CASE upper(rel_type) WHEN 'CONTRIBUTED' THEN 'CONTRIBUTES_TO' WHEN 'BELONGS_TO' THEN 'MEMBER_OF'
           WHEN 'PART_OF' THEN 'MEMBER_OF' WHEN 'INFORMED_BY' THEN 'RELATES_TO'
           ELSE CASE WHEN upper(rel_type) ~ '^[A-Z][A-Z0-9_.:-]{0,127}$' THEN upper(rel_type) ELSE 'Unknown' END END AS relationship_kind,
         from_kind||':'||from_id AS source_node_key,to_kind||':'||to_id AS target_node_key,'edge:'||source_table||':'||edge_id AS edge_key
  FROM walk JOIN node_distances source ON source.node_kind=from_kind AND source.node_id=from_id
  JOIN node_distances target ON target.node_kind=to_kind AND target.node_id=to_id
  WHERE edge_id IS NOT NULL
), traversed AS (
  SELECT DISTINCT ON (edge_key COLLATE "C") * FROM walk_edges
  ORDER BY edge_key COLLATE "C",edge_depth,traversal_direction COLLATE "C"
), eligible AS (
  SELECT traversed.* FROM traversed
  JOIN node_catalog source ON source.entity_type=from_kind AND source.record_id=from_id
  JOIN node_catalog target ON target.entity_type=to_kind AND target.record_id=to_id
  WHERE cardinality($9::text[])=0 OR (source.output_kind=ANY($9::text[]) AND target.output_kind=ANY($9::text[]))
)
SELECT edge_id,from_id,from_kind,to_id,to_kind,rel_type,created_at,source_table,edge_depth,traversal_direction,from_distance,to_distance
FROM eligible WHERE $10::integer IS NULL OR edge_depth>$10::integer OR (edge_depth=$10::integer AND
  (relationship_kind COLLATE "C",traversal_direction COLLATE "C",source_node_key COLLATE "C",target_node_key COLLATE "C",edge_key COLLATE "C") >
  ($11::text COLLATE "C",$12::text COLLATE "C",$13::text COLLATE "C",$14::text COLLATE "C",$15::text COLLATE "C"))
ORDER BY edge_depth,relationship_kind COLLATE "C",traversal_direction COLLATE "C",source_node_key COLLATE "C",target_node_key COLLATE "C",edge_key COLLATE "C" LIMIT $16`

const OVERVIEW_ROOT_SQL = `
WITH roots AS (
  SELECT 'memory'::text AS entity_type,m.id AS record_id,0::integer AS kind_rank,m.created_at AS freshness_at,
         'memory:'||m.id AS node_key,'Memory'::text AS output_kind
  FROM graph_memories m WHERE m.group_id=$1 AND m.workspace_id=$2 AND m.workspace_scope_state='workspace_scoped'
    AND m.deprecated=false AND m.deleted_at IS NULL
  UNION ALL
  SELECT 'structural',n.node_id,${STRUCTURAL_KIND_RANK_SQL},COALESCE(n.updated_at,n.created_at),
         'structural:'||n.node_id,${STRUCTURAL_OUTPUT_KIND_SQL}
  FROM graph_structural_nodes n WHERE n.group_id=$1 AND n.workspace_id=$2 AND n.workspace_scope_state='workspace_scoped'
), eligible AS (SELECT * FROM roots WHERE cardinality($3::text[])=0 OR output_kind=ANY($3::text[]))
SELECT entity_type,record_id,kind_rank,freshness_at,node_key FROM eligible
WHERE $4::integer IS NULL OR kind_rank>$4::integer OR (kind_rank=$4::integer AND freshness_at<$5::timestamptz) OR
  (kind_rank=$4::integer AND freshness_at=$5::timestamptz AND node_key COLLATE "C">$6::text COLLATE "C")
ORDER BY kind_rank,freshness_at DESC,node_key COLLATE "C" LIMIT $7`

export class FocusedSubgraphReadRepository {
  constructor(private readonly client: PoolClient) {}

  private async ambiguous(scope: SubgraphReadScope): Promise<boolean> {
    const result = await this.client.query<{ present: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM graph_structural_edges WHERE group_id=$1 AND workspace_id=$2
        AND workspace_scope_state='workspace_scoped' AND endpoint_state IN ('ambiguous','orphan')) AS present`,
      [scope.tenantId, scope.workspaceId],
    )
    return Boolean(result.rows[0]?.present)
  }

  private async nodes(scope: SubgraphReadScope, requested: Map<QualifiedNodeKey, number>, includeDeprecated: boolean) {
    if (requested.size === 0) return new Map<QualifiedNodeKey, { node: SubgraphNode; content: string | null }>()
    const entries = [...requested.keys()].sort(compareCodepoints)
    const loaded = new Map<QualifiedNodeKey, { node: SubgraphNode; content: string | null }>()
    for (let offset = 0; offset < entries.length; offset += 500) {
      const kinds: string[] = []; const ids: string[] = []
      for (const requestedKey of entries.slice(offset, offset + 500)) {
        const [entityType, id] = splitKey(requestedKey); kinds.push(entityType); ids.push(id)
      }
      const result = await this.client.query<NodeRow>(NODE_SQL, [scope.tenantId, scope.workspaceId, kinds, ids, includeDeprecated])
      for (const row of result.rows) {
        const node = mapNode(row, requested.get(key(row.entity_type, row.record_id)) ?? 0)
        loaded.set(node.key, { node, content: row.content })
      }
    }
    return loaded
  }

  private async edgeRows(scope: SubgraphReadScope, query: NormalizedSubgraphQuery, resume: Boundary | null): Promise<EdgeRow[]> {
    const boundary = resume?.edge
    if (query.kind === "overview") {
      return (await this.client.query<EdgeRow>(FOCUSED_SUBGRAPH_OVERVIEW_EDGE_SQL, [
        scope.tenantId, scope.workspaceId, query.relationshipKinds, query.nodeKinds,
        boundary?.relationshipKind ?? null, boundary?.direction ?? null, boundary?.sourceNodeKey ?? null,
        boundary?.targetNodeKey ?? null, boundary?.edgeKey ?? null, query.effectiveBudgets.edgeLimit + 1,
      ])).rows
    }
    const [focusKind, focusId] = splitKey(query.focusNodeKey)
    return (await this.client.query<EdgeRow>(FOCUSED_SUBGRAPH_FOCUS_EDGE_SQL, [
      scope.tenantId, scope.workspaceId, focusKind, focusId, query.direction, query.includeLineage,
      query.effectiveBudgets.depth, query.relationshipKinds, query.nodeKinds,boundary?.depth ?? null,
      boundary?.relationshipKind ?? null, boundary?.direction ?? null,boundary?.sourceNodeKey ?? null,
      boundary?.targetNodeKey ?? null,boundary?.edgeKey ?? null,query.effectiveBudgets.edgeLimit + 1,
    ])).rows
  }

  private async overviewRoots(scope: SubgraphReadScope, query: NormalizedSubgraphQuery & { kind: "overview" }, resume: Boundary | null) {
    const boundary = resume?.node
    return (await this.client.query<RootRow>(OVERVIEW_ROOT_SQL, [
      scope.tenantId, scope.workspaceId, query.nodeKinds,boundary?.kindRank ?? null,
      boundary?.freshnessAt ?? null,boundary?.nodeKey ?? null,query.effectiveBudgets.nodeLimit + 1,
    ])).rows
  }

  async read(scope: SubgraphReadScope, query: NormalizedSubgraphQuery, resume: Boundary | null = null): Promise<FocusedSubgraphRepositoryPage> {
    if (await this.ambiguous(scope)) return { nodes: [], edges: [], ambiguous: true, hasMoreNodes: false, hasMoreEdges: false, boundary: null }
    const candidateRows = await this.edgeRows(scope, query, resume)
    if (candidateRows.length > 0 && query.effectiveBudgets.nodeLimit < 2) throw new FocusedSubgraphRepositoryError("malformed")

    const requested = new Map<QualifiedNodeKey, number>(); const selectedRows: EdgeRow[] = []
    for (const row of candidateRows.slice(0, query.effectiveBudgets.edgeLimit)) {
      const sourceKey = key(row.from_kind, row.from_id); const targetKey = key(row.to_kind, row.to_id)
      const additions = Number(!requested.has(sourceKey)) + Number(!requested.has(targetKey))
      if (requested.size + additions > query.effectiveBudgets.nodeLimit) break
      requested.set(sourceKey, Math.min(requested.get(sourceKey) ?? Number.MAX_SAFE_INTEGER, Number(row.from_distance)))
      requested.set(targetKey, Math.min(requested.get(targetKey) ?? Number.MAX_SAFE_INTEGER, Number(row.to_distance)))
      selectedRows.push(row)
    }
    const hasMoreEdges = selectedRows.length < candidateRows.length

    let lastRoot: RootRow | undefined; let hasMoreNodes = false
    if (query.kind === "overview") {
      const roots = await this.overviewRoots(scope, query, resume); let consumed = 0
      for (const root of roots) {
        const rootKey = key(root.entity_type, root.record_id)
        if (!requested.has(rootKey) && requested.size === query.effectiveBudgets.nodeLimit) break
        if (!requested.has(rootKey)) requested.set(rootKey, 0)
        lastRoot = root; consumed += 1
      }
      hasMoreNodes = consumed < roots.length
    } else if (selectedRows.length === 0 || requested.size < query.effectiveBudgets.nodeLimit) {
      requested.set(query.focusNodeKey, 0)
    }

    const loaded = await this.nodes(scope, requested, query.kind === "focus" && query.includeLineage)
    if ([...requested.keys()].some((requestedKey) => !loaded.has(requestedKey))) {
      throw new Error("Focused subgraph endpoint disappeared inside the read snapshot")
    }
    const edges = selectedRows.map(mapEdge).sort(compareEdges)
    const nodes = [...loaded.values()].map((item) => item.node).sort(compareNodes)
    const lastEdge = edges.at(-1)
    const boundary: Boundary | null = !lastRoot && !lastEdge && !resume ? null : {
      node: lastRoot ? { distance: 0,kindRank: Number(lastRoot.kind_rank),freshnessAt: iso(lastRoot.freshness_at),
        nodeKey: key(lastRoot.entity_type,lastRoot.record_id) } : (resume?.node ?? null),
      edge: lastEdge ? { depth: lastEdge.order.depth,relationshipKind: lastEdge.kind.name,direction: lastEdge.order.direction,
        sourceNodeKey: lastEdge.sourceNodeKey,targetNodeKey: lastEdge.targetNodeKey,edgeKey: lastEdge.key } : (resume?.edge ?? null),
    }

    const focus = query.kind === "focus" ? loaded.get(query.focusNodeKey) : undefined
    const lineage = query.kind === "focus" && query.includeLineage
      ? edges.filter((edge) => edge.kind.name === "SUPERSEDES")
        .map((edge) => ({ newerNodeKey: edge.sourceNodeKey,supersededNodeKey: edge.targetNodeKey,relationshipKey: edge.key }))
        .sort((left,right) => compareCodepoints(left.newerNodeKey,right.newerNodeKey) ||
          compareCodepoints(left.supersededNodeKey,right.supersededNodeKey) || compareCodepoints(left.relationshipKey,right.relationshipKey)) : []
    const focusedRelationships = query.kind === "focus"
      ? [...new Set([
          ...edges
            .filter((edge) => edge.sourceNodeKey === query.focusNodeKey || edge.targetNodeKey === query.focusNodeKey)
            .map((edge) => edge.key),
          ...lineage.map((item) => item.relationshipKey),
        ])].sort(compareCodepoints)
      : []
    return {
      nodes,edges,
      ...(query.kind === "focus" && focus ? { inspection: { nodeKey: focus.node.key,
        scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        ...(focus.content ? { content: focus.content.slice(0,20_000) } : {}),
        ...(focus.node.summary ? { summary: focus.node.summary.slice(0,4_000) } : {}),
        provenance: focus.node.source,evidence: focus.node.evidence,lineage,relationshipKeys: focusedRelationships } } : {}),
      ambiguous: false,hasMoreNodes,hasMoreEdges,boundary,
    }
  }
}
