import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))

import { insertWorkspaceEvent, ValidationError } from "@/lib/postgres/queries/insert-trace"
import { queryWorkspaceTraces } from "@/lib/postgres/traces"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
  mocks.query.mockResolvedValue({ rows: [{ id: 1, group_id: "allura-system", workspace_id: "workspace-a" }] })
})

describe("workspace trace storage", () => {
  it("inserts through the restricted workspace transaction with an explicit discriminator", async () => {
    await insertWorkspaceEvent({
      group_id: "allura-system",
      workspace_id: "workspace-a",
      principal_id: "verified-user",
      event_type: "trace.decision",
      agent_id: "verified-user",
      metadata: { confidence: 1 },
    })
    expect(mocks.transaction).toHaveBeenCalledWith(
      {
        tenantId: "allura-system",
        workspaceId: "workspace-a",
        principalId: "verified-user",
      },
      expect.any(Function)
    )
    const [sql, values] = mocks.query.mock.calls[0]
    expect(sql).toContain("group_id, workspace_id, event_type")
    expect(values.slice(0, 4)).toEqual(["allura-system", "workspace-a", "trace.decision", "verified-user"])
  })

  it.each(["workspace_id", "principal_id"])("rejects missing %s before opening a transaction", async (field) => {
    const event = {
      group_id: "allura-system",
      workspace_id: "workspace-a",
      principal_id: "verified-user",
      event_type: "trace.decision",
      agent_id: "verified-user",
      [field]: "",
    }
    await expect(insertWorkspaceEvent(event)).rejects.toBeInstanceOf(ValidationError)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("reads only trace events and round-trips the submitted outcome content", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "7",
          group_id: "allura-system",
          event_type: "trace.decision",
          agent_id: "verified-user",
          created_at: new Date(0),
          metadata: { confidence: 1 },
          outcome: { content: "decision body" },
        },
      ],
    })
    const result = await queryWorkspaceTraces({
      group_id: "allura-system",
      workspace_id: "workspace-a",
      principal_id: "verified-user",
      type: "decision",
      limit: 10,
      offset: 0,
    })
    const [sql, values] = mocks.query.mock.calls[0]
    expect(sql).toContain("event_type LIKE 'trace.%'")
    expect(sql).toContain("outcome")
    expect(values).toEqual(["allura-system", "workspace-a", "trace.decision", 10, 0])
    expect(result[0]).toMatchObject({ type: "decision", content: "decision body" })
  })
})
