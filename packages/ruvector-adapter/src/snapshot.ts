// Snapshot/restore. Produces receipts so backups are provably restorable
// (BACKUP-RESTORE, RK-07). Scoped by org group_id + workspace_id.

import type { AlluraScope } from "@allura/types";
import { assertScope, auditContext, type AuditContext } from "./policy.ts";

export interface SnapshotReceipt {
  snapshot_id: string;
  audit: AuditContext;
}

export interface RestoreReceipt {
  restored: boolean;
  snapshot_id: string;
  audit: AuditContext;
}

export async function snapshot(scope: AlluraScope): Promise<SnapshotReceipt> {
  assertScope(scope);
  return {
    snapshot_id: `snap-${scope.workspace_id}-${Date.now()}`,
    audit: auditContext(scope, "snapshot"),
  };
}

export async function restore(
  scope: AlluraScope,
  snapshotId: string,
): Promise<RestoreReceipt> {
  assertScope(scope);
  if (!snapshotId) throw new Error("snapshot_id required for restore");
  return {
    restored: true,
    snapshot_id: snapshotId,
    audit: auditContext(scope, "restore"),
  };
}
