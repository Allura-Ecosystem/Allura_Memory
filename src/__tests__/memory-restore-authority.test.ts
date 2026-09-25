import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ restore: vi.fn() }))
vi.mock("@/mcp/canonical-tools", () => ({ memory_restore: mocks.restore }))

import { POST } from "@/app/api/memory/[id]/restore/route"

function request(query = "", role = "admin"): NextRequest {
  return new NextRequest(`http://localhost:3100/api/memory/memory-1/restore${query}`, {
    method: "POST",
    headers: {
      "x-allura-user-id": "verified-user",
      "x-allura-role": role,
      "x-allura-group-id": "allura-system",
      "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session",
    },
  })
}

const params = { params: Promise.resolve({ id: "memory-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.restore.mockResolvedValue({ id: "memory-1", restored: true, restored_at: "now" })
})

describe("memory restore authority", () => {
  it("requires administrator authority", async () => {
    expect((await POST(request("", "curator"), params)).status).toBe(403)
    expect(mocks.restore).not.toHaveBeenCalled()
  })

  it.each(["?group_id=allura-other", "?workspace_id=workspace-other", "?user_id=forged-user"])(
    "denies forged restore authority: %s",
    async (query) => {
      expect((await POST(request(query), params)).status).toBe(403)
      expect(mocks.restore).not.toHaveBeenCalled()
    }
  )

  it("binds the restore to verified tenant, workspace, actor, and session", async () => {
    const response = await POST(
      request("?group_id=allura-system&workspace_id=workspace-a&user_id=verified-user"),
      params
    )
    expect(response.status).toBe(200)
    expect(mocks.restore).toHaveBeenCalledWith({
      id: "memory-1",
      group_id: "allura-system",
      user_id: "verified-user",
      scope: {
        group_id: "allura-system",
        workspace_id: "workspace-a",
        agent_id: "verified-user",
        session_id: "verified-session",
      },
    })
  })
})
