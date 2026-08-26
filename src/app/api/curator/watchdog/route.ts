/**
 * Curator Watchdog API
 *
 * POST /api/curator/watchdog — Run one scan cycle for a group
 * GET  /api/curator/watchdog — Return watchdog status + pending count
 *
 * Designed for cron-style invocation (e.g. Vercel Cron, systemd timer).
 * Does NOT auto-approve — proposals go to canonical_proposals for HITL review.
 */

if (typeof window !== "undefined") {
  throw new Error("This module can only be used server-side");
}

import { NextRequest, NextResponse } from "next/server";
import { scanAndPropose } from "@/curator/watchdog";
import { validateToken } from "@/lib/guard/validate-token";
import { resolveWorkspaceScope } from "@/lib/db/workspace-scope";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";

const DEFAULT_GROUP_ID = process.env.ALLURA_GROUP_ID ?? "allura-system";
const DEFAULT_THRESHOLD = parseFloat(process.env.CURATOR_SCORE_THRESHOLD ?? "0.7");

export async function POST(req: NextRequest): Promise<NextResponse> {
  // The credential row is validated server-side. Browser headers/body are not
  // workspace authority and cannot select a tenant or workspace.
  const validation = await validateToken(req.headers.get("authorization"));
  if (!validation.ok) {
    return NextResponse.json({ error: "Valid watchdog credential required" }, { status: 401 });
  }
  if (!validation.token.scopes.includes("review:read")) {
    return NextResponse.json({ error: "Watchdog credential lacks curator permission" }, { status: 403 });
  }
  const scope = resolveWorkspaceScope(validation.token);

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[watchdog:POST] start requestId=${requestId}`);

  const groupId = scope.tenantId;
  let scoreThreshold = DEFAULT_THRESHOLD;

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.score_threshold === "number") {
      scoreThreshold = body.score_threshold;
    }
  } catch {
    // malformed body — use default threshold
  }

  const start = Date.now();
  const proposed = await scanAndPropose({ groupId, scope, scoreThreshold });
  const duration_ms = Date.now() - start;

  console.log(`[watchdog:POST] done requestId=${requestId} group=${groupId} proposed=${proposed} duration=${duration_ms}ms`);

  return NextResponse.json({
    ok: true,
    group_id: groupId,
    score_threshold: scoreThreshold,
    proposals_created: proposed,
    duration_ms,
    scanned_at: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // GET has exactly the same server-authenticated scope boundary as POST.
  // Request query/body values can never select the queue being counted.
  const validation = await validateToken(req.headers.get("authorization"));
  if (!validation.ok) {
    return NextResponse.json({ error: "Valid watchdog credential required" }, { status: 401 });
  }
  if (!validation.token.scopes.includes("review:read")) {
    return NextResponse.json({ error: "Watchdog credential lacks curator permission" }, { status: 403 });
  }
  const scope = resolveWorkspaceScope(validation.token);

  console.log(`[watchdog:GET] status check group=${scope.tenantId} workspace=${scope.workspaceId}`);
  const { pending, total } = await withWorkspaceTransaction(scope, async (client) => {
    const pendingResult = await client.query(
      "SELECT COUNT(*) AS cnt FROM canonical_proposals WHERE group_id = $1 AND workspace_id = $2 AND status = 'pending'",
      [scope.tenantId, scope.workspaceId],
    );
    const totalResult = await client.query(
      "SELECT COUNT(*) AS cnt FROM canonical_proposals WHERE group_id = $1 AND workspace_id = $2",
      [scope.tenantId, scope.workspaceId],
    );
    return { pending: pendingResult, total: totalResult };
  });

  const pendingCount = Number(pending.rows[0].cnt);
  const totalCount = Number(total.rows[0].cnt);

  console.log(`[watchdog:GET] group=${scope.tenantId} workspace=${scope.workspaceId} pending=${pendingCount} total=${totalCount}`);

  return NextResponse.json({
    ok: true,
    pending: pendingCount,
    total: totalCount,
    group_id: scope.tenantId,
    score_threshold: DEFAULT_THRESHOLD,
    checked_at: new Date().toISOString(),
  });
}
