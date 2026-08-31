/** Typed SDK operations for the authenticated governed-lane MCP workflow. */

import { z } from "zod";
import type { RequestFn } from "./memory.js";

const LaneDiffSchema = z.object({
  added: z.array(z.record(z.unknown())),
  overridden: z.array(z.record(z.unknown())),
  deleted: z.array(z.string()),
});
const LaneOpenParamsSchema = z.object({
  group_id: z.string().min(1),
  lane_id: z.string().min(1),
  base_revision: z.string().min(1),
});
const LaneSnapshotParamsSchema = LaneOpenParamsSchema.extend({
  diff: LaneDiffSchema,
  evidence_refs: z.array(z.string().min(1)),
});
const LaneReviewParamsSchema = z.object({
  group_id: z.string().min(1),
  lane_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  verdict: z.enum(["approved", "rejected", "quarantined"]),
  reason: z.string().min(1),
  retention_expires_at: z.string().datetime().optional(),
});
const LaneOpenResponseSchema = z.object({
  lane_id: z.string(), branch_id: z.string(), writer_id: z.string(),
  reviewer_ids: z.array(z.string()), base_revision: z.string(), status: z.literal("active"),
});
const LaneSnapshotResponseSchema = z.object({
  lane_id: z.string(), branch_id: z.string(), snapshot_id: z.string(),
  snapshot_hash: z.string(), status: z.literal("active"),
});
const LaneReviewResponseSchema = z.record(z.unknown());

export interface LaneDiff {
  added: Array<Record<string, unknown>>;
  overridden: Array<Record<string, unknown>>;
  deleted: string[];
}

export interface LaneOpenParams {
  group_id: string;
  lane_id: string;
  base_revision: string;
}

export interface LaneSnapshotParams extends LaneOpenParams {
  diff: LaneDiff;
  evidence_refs: string[];
}

export interface LaneReviewParams {
  group_id: string;
  lane_id: string;
  snapshot_id: string;
  verdict: "approved" | "rejected" | "quarantined";
  reason: string;
  retention_expires_at?: string;
}

export interface LaneOpenResponse {
  lane_id: string;
  branch_id: string;
  writer_id: string;
  reviewer_ids: string[];
  base_revision: string;
  status: "active";
}

export interface LaneSnapshotResponse {
  lane_id: string;
  branch_id: string;
  snapshot_id: string;
  snapshot_hash: string;
  status: "active";
}

/** Gateway result is intentionally opaque because approval creates a policy-owned proposal. */
export type LaneReviewResponse = Record<string, unknown>;

/**
 * Governed-lane operations use the same authenticated MCP tools/call transport
 * as memory and harness operations. Authority remains wholly gateway-derived.
 */
export class LaneOperations {
  constructor(private readonly request: RequestFn) {}

  /**
   * group_id is only a resource selector. Workspace and actor authority are
   * derived by the authenticated gateway principal, never from this payload.
   */
  async open(params: LaneOpenParams): Promise<LaneOpenResponse> {
    const validated = LaneOpenParamsSchema.parse(params);
    return this.request("governed_lane_open", validated, LaneOpenResponseSchema);
  }

  async snapshot(params: LaneSnapshotParams): Promise<LaneSnapshotResponse> {
    const validated = LaneSnapshotParamsSchema.parse(params);
    return this.request("governed_lane_snapshot", validated, LaneSnapshotResponseSchema);
  }

  async review(params: LaneReviewParams): Promise<LaneReviewResponse> {
    const validated = LaneReviewParamsSchema.parse(params);
    return this.request("governed_lane_review", validated, LaneReviewResponseSchema);
  }
}
