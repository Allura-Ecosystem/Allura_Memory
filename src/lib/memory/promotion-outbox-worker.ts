/** Workspace-aware projection delivery for canonical promotion outbox rows. */
import type { Pool } from "pg";
import { getAppPool } from "@/lib/postgres/connection";
import { withTenantTransaction } from "@/lib/db/tenant-transaction";

export interface OutboxDrainResult { delivered: number; failed: number; pending: number }
type OutboxRow = { id:string; group_id:string; workspace_id:string; proposal_id:string; memory_id:string; payload:Record<string,unknown>; attempts:number };

/** Owner/worker authority is used only to discover scopes; every row transition is app-role scoped. */
export async function drainPromotionOutbox(discoveryPool: Pool, opts?: { maxBatch?:number; maxAttempts?:number }): Promise<OutboxDrainResult> {
  const maxBatch=opts?.maxBatch ?? 50;
  const maxAttempts=opts?.maxAttempts ?? 5;
  const pending = await discoveryPool.query<OutboxRow>(
    `SELECT id,group_id,workspace_id,proposal_id,memory_id,payload,attempts FROM promotion_outbox
     WHERE workspace_scope_state='workspace_scoped' AND workspace_id IS NOT NULL
       AND status IN('pending','failed') AND attempts<$1 AND available_at<=NOW()
     ORDER BY available_at,created_at LIMIT $2`,
    [maxAttempts,maxBatch],
  );
  const appPool=getAppPool();
  let delivered=0, failed=0;
  for (const row of pending.rows) {
    const context={ tenantId:row.group_id, workspaceId:row.workspace_id, principalId:"promotion-outbox-worker" };
    const outcome = await withTenantTransaction(context, async (db): Promise<"delivered" | "failed" | "skipped"> => {
      const claim=await db.query(
        `UPDATE promotion_outbox SET status='processing' WHERE id=$1 AND group_id=$2 AND workspace_id=$3
           AND status IN('pending','failed') AND attempts<$4 AND available_at<=NOW()
           RETURNING id`, [row.id,row.group_id,row.workspace_id,maxAttempts],
      );
      if (!claim.rows[0]) return "skipped";
      // Claim before the savepoint: recovery must retain its row lock until
      // failure/backoff commits, so stale concurrent discoveries cannot retry it.
      await db.query("SAVEPOINT promotion_delivery");
      let outcome: "delivered" | "failed" = "delivered";
      try {
        await db.query(
          `INSERT INTO events(group_id,workspace_id,event_type,agent_id,status,metadata,created_at)
           VALUES($1,$2,'canonical_memory_promoted','promotion-outbox-worker','completed',$3,NOW())`,
          [row.group_id,row.workspace_id,JSON.stringify({...row.payload,group_id:row.group_id,workspace_id:row.workspace_id,outbox_id:row.id,delivered:true})],
        );
        const delivery=await db.query(
          `UPDATE promotion_outbox SET status='delivered',delivered_at=NOW() WHERE id=$1 AND group_id=$2 AND workspace_id=$3
           AND status='processing' RETURNING id`,
          [row.id,row.group_id,row.workspace_id],
        );
        if (delivery.rows.length !== 1) throw new Error("Promotion outbox delivery must transition exactly one row");
      } catch (error) {
        await db.query("ROLLBACK TO SAVEPOINT promotion_delivery");
        const failure=await db.query(
          `UPDATE promotion_outbox SET status=CASE WHEN attempts+1 >= $4 THEN 'failed' ELSE 'pending' END,
           attempts=attempts+1,last_error=$5,available_at=NOW()+(INTERVAL '1 minute'*LEAST(attempts+1,10))
           WHERE id=$1 AND group_id=$2 AND workspace_id=$3 AND status='processing' RETURNING id`,
          [row.id,row.group_id,row.workspace_id,maxAttempts,error instanceof Error?error.message.slice(0,500):String(error).slice(0,500)],
        );
        if (failure.rows.length !== 1) throw new Error("Promotion outbox failure must transition exactly one row");
        outcome = "failed";
      }
      // Control failures escape, including RELEASE and ROLLBACK TO failures.
      await db.query("RELEASE SAVEPOINT promotion_delivery");
      return outcome;
    }, appPool);
    // Only acknowledged outer commits contribute counters. COMMIT errors are
    // unknown outcomes: propagate without a second bookkeeping transaction.
    if (outcome === "delivered") delivered++;
    if (outcome === "failed") failed++;
  }
  const remaining=await discoveryPool.query("SELECT count(*)::int FROM promotion_outbox WHERE workspace_scope_state='workspace_scoped' AND status IN('pending','failed','processing')");
  return { delivered,failed,pending:remaining.rows[0].count };
}
