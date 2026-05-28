import { describe, expect, it, vi } from "vitest"

import {
  formatCuratorProposalQueue,
  getScopedCuratorProposalQueue,
} from "@/lib/memory/curator-proposal-queue"

describe("curator proposal queue", () => {
  it("formats pending proposals with review evidence and no action affordance", () => {
    const queue = formatCuratorProposalQueue([
      {
        id: "prop-001",
        group_id: "allura-system",
        content: "Promote this durable insight into semantic memory because it explains the queue contract.",
        score: 0.92,
        reasoning: "High confidence and well evidenced",
        tier: "mainstream",
        status: "pending",
        trace_ref: "trace-123",
        created_at: "2026-05-24T09:00:00.000Z",
      },
    ], "allura-system")

    expect(queue).toEqual([
      {
        proposalId: "prop-001",
        groupId: "allura-system",
        contentPreview: "Promote this durable insight into semantic memory because it explains the queue contract.",
        score: 0.92,
        reasoning: "High confidence and well evidenced",
        tier: "mainstream",
        status: "pending",
        traceRef: "trace-123",
        createdAt: "2026-05-24T09:00:00.000Z",
        readOnly: true,
      },
    ])
  })

  it("rejects unscoped or mismatched group IDs before queue rendering", () => {
    expect(() => formatCuratorProposalQueue([], "legacy-system")).toThrow(/group_id/i)
    expect(() => formatCuratorProposalQueue([{ id: "prop-002", group_id: "allura-other" }], "allura-system")).toThrow(/scope mismatch/i)
  })

  it("fails closed instead of inventing missing proposal evidence", () => {
    expect(() => formatCuratorProposalQueue([{ id: "prop-incomplete", group_id: "allura-system" }], "allura-system")).toThrow(/content/i)
  })

  it("accepts an explicit zero score as valid proposal evidence", () => {
    const [item] = formatCuratorProposalQueue([
      {
        id: "prop-zero",
        group_id: "allura-system",
        content: "Low-confidence but reviewable proposal",
        score: 0,
        reasoning: "Still visible for curator review",
        tier: "emerging",
        status: "pending",
        trace_ref: "trace-zero",
        created_at: "2026-05-24T11:00:00.000Z",
      },
    ], "allura-system")

    expect(item?.score).toBe(0)
  })

  it("queries pending proposals by validated group_id without promotion side effects", async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => ({
      rows: [
        {
          id: "prop-003",
          group_id: "allura-system",
          content: "Queue-only proposal",
          score: 0.7,
          reasoning: "Needs curator review",
          tier: "emerging",
          status: "pending",
          trace_ref: "trace-queue",
          created_at: "2026-05-24T10:00:00.000Z",
        },
      ],
    }))

    const queue = await getScopedCuratorProposalQueue("allura-system", { query }, 10)

    expect(queue[0]?.proposalId).toBe("prop-003")
    expect(queue[0]?.readOnly).toBe(true)
    expect(query).toHaveBeenCalledOnce()
    const [sql, params] = query.mock.calls[0]!
    expect(String(sql)).toContain("FROM canonical_proposals")
    expect(String(sql)).toContain("group_id = $1")
    expect(String(sql)).toContain("status = $2")
    expect(String(sql)).not.toMatch(/UPDATE|INSERT|DELETE|promote/i)
    expect(params).toEqual(["allura-system", "pending", 10])
  })
})
