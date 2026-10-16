import type { PoolClient } from "pg"
import type { KnowledgeInsight } from "./knowledge-promotion"

/** Resolve the product of approveProposal's atomic human decision, never mint another. */
export async function resolveApprovedProjection(db: PoolClient, insight: KnowledgeInsight): Promise<string> {
  const result = await db.query<{
    approved_memory_id: string; content: string; score: number | string; trace_ref: string;
    source: string; semantic_content: string; group_id: string; workspace_id: string;
  }>(
    `SELECT p.approved_memory_id,p.content,p.score,p.trace_ref::text,p.decided_by AS source,
            m.content AS semantic_content,p.group_id,p.workspace_id
     FROM canonical_proposals p
     JOIN events e ON e.id=p.trace_ref AND e.group_id=p.group_id AND e.workspace_id=p.workspace_id
     JOIN graph_memories m ON m.id=p.approved_memory_id AND m.group_id=p.group_id AND m.workspace_id=p.workspace_id
       AND m.workspace_scope_state='workspace_scoped'
     JOIN governance_receipts r ON r.proposal_id=p.id AND r.group_id=p.group_id AND r.workspace_id=p.workspace_id
       AND r.action='approve' AND r.memory_id=p.approved_memory_id AND r.source_event_id=p.trace_ref
       AND r.actor_id=p.decided_by AND r.actor_role IN ('curator','admin')
       AND r.proposal_version=p.proposal_version::text
     WHERE p.id=$1 AND p.group_id=$2 AND p.workspace_id=$3 AND p.status='approved'
       AND p.decided_by IS NOT NULL AND p.decided_by<>e.agent_id
       AND EXISTS (SELECT 1 FROM events a WHERE a.group_id=p.group_id AND a.workspace_id=p.workspace_id
         AND a.event_type='proposal_approved' AND a.metadata->>'proposal_id'=p.id::text)
     FOR SHARE OF p,m`,
    [insight.proposal_id, insight.group_id, insight.workspace_id],
  )
  const approved = result.rows[0]
  if (!approved) throw new Error("Approval required before promotion: complete the atomic human approval flow")
  if (approved.group_id !== insight.group_id || approved.workspace_id !== insight.workspace_id
    || approved.content !== insight.content || approved.semantic_content !== approved.content
    || approved.source !== insight.source || String(approved.trace_ref) !== insight.postgres_trace_id
    || insight.id !== String(approved.trace_ref) || Number(approved.score) !== insight.confidence
    || insight.supersedes_id) {
    throw new Error("Approved proposal payload or scope mismatch")
  }
  return approved.approved_memory_id
}
