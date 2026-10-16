import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { getGraphBackend } from "@/lib/graph-adapter/factory"
import { MemoryNotFoundError, MemoryNotDeletedError } from "./canonical-contracts"
import type { GroupId, MemoryId } from "./canonical-contracts"
import type { PoolClient } from "pg"

type LifecycleParams = {
  id: MemoryId; groupId: GroupId; workspaceId: string; principalId: string;
  operation: "delete" | "restore"; at: string;
}

async function appendLifecycleEvent(db: PoolClient, params: LifecycleParams): Promise<void> {
  await db.query(
    `INSERT INTO events (group_id,workspace_id,event_type,agent_id,status,metadata,created_at)
     VALUES ($1,$2,$3,$4,'completed',$5,$6)`,
    [params.groupId, params.workspaceId, `memory_${params.operation}`, params.principalId,
      JSON.stringify({ memory_id: params.id, user_id: params.principalId }), params.at],
  )
}

/** Restricted app-role mutation. Restoration never deletes version lineage. */
export async function mutateWorkspaceMemory(params: LifecycleParams): Promise<void> {
  if (getGraphBackend() !== "ruvector") {
    throw new Error("Configured graph backend does not support workspace lifecycle mutations")
  }
  await withWorkspaceTransaction(
    { tenantId: params.groupId, workspaceId: params.workspaceId, principalId: params.principalId },
    async (db) => {
      const keys = [params.id, params.groupId, params.workspaceId]
      const result = await db.query<{ id: string; deprecated: boolean; deleted_at: string | null }>(
        `SELECT id, deprecated, deleted_at FROM graph_memories
         WHERE id=$1 AND group_id=$2 AND workspace_id=$3 AND workspace_scope_state='workspace_scoped'
         FOR UPDATE`, keys,
      )
      if (result.rows.length === 0) {
        const episodic = await db.query(
          `SELECT id FROM events WHERE metadata->>'memory_id'=$1 AND group_id=$2
           AND workspace_id=$3 AND event_type='memory_add' LIMIT 1`, keys,
        )
        if (!episodic.rows.length) throw new MemoryNotFoundError(params.id)
        await appendLifecycleEvent(db, params)
        return
      }
      if (params.operation === "restore") {
        const lineage = await db.query(
          `SELECT newer_id FROM graph_supersedes WHERE superseded_id=$1 AND group_id=$2
           AND workspace_id=$3 AND workspace_scope_state='workspace_scoped' LIMIT 1`, keys,
        )
        if (lineage.rows.length) throw new Error("A superseded version cannot be restored; create an approved new version")
        if (!result.rows[0].deleted_at) throw new MemoryNotDeletedError(params.id)
      }
      const changed = await db.query(
        params.operation === "delete"
          ? `UPDATE graph_memories SET deprecated=true, deleted_at=$4::timestamptz
             WHERE id=$1 AND group_id=$2 AND workspace_id=$3 AND workspace_scope_state='workspace_scoped'`
          : `UPDATE graph_memories SET deprecated=false, deleted_at=NULL, restored_at=$4::timestamptz
             WHERE id=$1 AND group_id=$2 AND workspace_id=$3 AND workspace_scope_state='workspace_scoped'
               AND deleted_at >= NOW() - INTERVAL '30 days'`,
        [...keys, params.at],
      )
      if (changed.rowCount !== 1) throw new Error("Memory lifecycle mutation did not affect exactly one scoped row")
      await appendLifecycleEvent(db, params)
    },
  )
}
