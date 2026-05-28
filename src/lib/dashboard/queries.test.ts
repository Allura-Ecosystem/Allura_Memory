/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import * as postgresConnection from "@/lib/postgres/connection"
import { loadProjectSummaries } from "@/lib/dashboard/project-queries"

const queryMock = vi.fn()
const getPoolSpy = vi.spyOn(postgresConnection, "getPool")

beforeEach(() => {
  queryMock.mockReset()
  getPoolSpy.mockReturnValue({ query: queryMock } as unknown as ReturnType<typeof postgresConnection.getPool>)
})

describe("loadProjectSummaries", () => {
  it("scopes the projects summary query to allura-system", async () => {
    queryMock.mockResolvedValue({
      rows: [
        { project: "Phase 1", event_count: "3" },
        { project: "Dashboard", event_count: 2 },
      ],
    })

    const result = await loadProjectSummaries()

    expect(result).toEqual([
      { project: "Phase 1", eventCount: 3 },
      { project: "Dashboard", eventCount: 2 },
    ])
    expect(queryMock).toHaveBeenCalledTimes(1)
    const [sql, params] = queryMock.mock.calls[0]
    expect(String(sql)).toContain("group_id = $1")
    expect(String(sql)).toContain("metadata->>'project'")
    expect(String(sql)).toContain("project IS NOT NULL")
    expect(params).toEqual(["allura-system"])
  })
})
