/**
 * memory_add rejects echo/status auto-capture before any budget check or
 * database access — nothing is written and no stored memory is touched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getConnections = vi.fn()
vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: (...a: unknown[]) => getConnections(...a),
  resetConnections: vi.fn(),
}))
const checkBudget = vi.fn()
vi.mock("@/mcp/canonical-tools/budget-circuit", async (orig) => ({
  ...((await orig()) as object),
  checkBudget: (...a: unknown[]) => checkBudget(...a),
}))

import { authenticateServiceTransport } from "@/lib/auth/mcp-authenticator"
import { memory_add } from "@/mcp/canonical-tools"
import type { GroupId, MemoryContent } from "@/lib/memory/canonical-contracts"

const GROUP = "allura-test-admission" as GroupId

async function add(content: string, source?: "manual" | "conversation") {
  process.env.ALLURA_MCP_SERVICE_PRINCIPAL_ID = "admission-test-agent"
  process.env.ALLURA_MCP_SERVICE_WORKSPACE_ID = `ws-${GROUP}`
  process.env.ALLURA_MCP_SERVICE_TENANTS = GROUP
  process.env.ALLURA_MCP_SERVICE_SCOPES = "memory:write"
  const principal = await authenticateServiceTransport("admission-test")
  return memory_add(
    principal.prepareMemoryAdd({
      group_id: GROUP,
      user_id: "admission-test-agent",
      content: content as MemoryContent,
      ...(source ? { metadata: { source } } : {}),
    } as never).request
  )
}

describe("memory_add admission", () => {
  beforeEach(() => {
    getConnections.mockReset()
    checkBudget.mockReset()
  })

  it("rejects conversational echo without touching budget or database", async () => {
    await expect(add("OUTCOME — intent: fix the export path", "conversation")).rejects.toThrow(
      /admission.*conversational_echo/i
    )
    expect(checkBudget).not.toHaveBeenCalled()
    expect(getConnections).not.toHaveBeenCalled()
  })
})
