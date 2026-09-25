import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))

import { GET } from "@/app/api/memory/insights/[id]/history/route"

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost:3100/api/memory/insights/insight-1/history${query}`, {
    headers: {
      "x-allura-user-id": "verified-user",
      "x-allura-role": "viewer",
      "x-allura-group-id": "allura-system",
      "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session",
    },
  })
}

const params = { params: Promise.resolve({ id: "insight-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
  mocks.query.mockResolvedValue({ rows: [] })
})

describe("memory insight history authority", () => {
  it.each(["?group_id=allura-other", "?workspace_id=workspace-other"])(
    "denies forged history scope: %s",
    async (query) => {
      expect((await GET(request(query), params)).status).toBe(403)
      expect(mocks.transaction).not.toHaveBeenCalled()
    }
  )

  it("queries only verified workspace-scoped versions", async () => {
    const response = await GET(request("?group_id=allura-system&workspace_id=workspace-a"), params)
    expect(response.status).toBe(200)
    expect(mocks.transaction).toHaveBeenCalledWith(
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "verified-user" },
      expect.any(Function)
    )
    const [sql, values] = mocks.query.mock.calls[0]
    expect(sql).toContain("m.workspace_id = $3")
    expect(sql).toContain("WITH RECURSIVE lineage")
    expect(sql).toContain("FROM graph_supersedes")
    expect(sql).toContain("workspace_scope_state = 'workspace_scoped'")
    expect(sql).not.toContain("'global'")
    expect(values).toEqual(["insight-1", "allura-system", "workspace-a"])
  })

  it("returns the subject attribution for every history version", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: "insight-1",
          content: "version",
          score: 0.9,
          version: 1,
          created_at: "2026-09-25T00:00:00.000Z",
          deprecated: false,
          provenance: "manual",
          user_id: "subject-user",
        },
      ],
    })
    const response = await GET(request(), params)
    expect(await response.json()).toMatchObject({
      history: [{ insight_id: "insight-1", user_id: "subject-user" }],
    })
  })
})
