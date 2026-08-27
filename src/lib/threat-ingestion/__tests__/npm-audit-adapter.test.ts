/**
 * Story 26.4 Slice B — npm bulk-advisories adapter.
 *
 * Mocks safe-fetch's HTTP layer with a response shape captured from a real
 * call to https://registry.npmjs.org/-/npm/v1/security/advisories/bulk
 * during development (2026-08-27).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const { safeFetchJson } = vi.hoisted(() => ({ safeFetchJson: vi.fn() }))
vi.mock("../safe-fetch", async () => {
  const actual = await vi.importActual<typeof import("../safe-fetch")>("../safe-fetch")
  return { ...actual, safeFetchJson }
})

beforeEach(() => {
  safeFetchJson.mockReset()
})

const { queryNpmAudit } = await import("../npm-audit-adapter")

const REAL_NPM_RESPONSE = {
  lodash: [
    {
      id: 1108258,
      url: "https://github.com/advisories/GHSA-29mw-wpgm-hmr9",
      title: "Regular Expression Denial of Service (ReDoS) in lodash", // untrusted, never read
      severity: "moderate",
      vulnerable_versions: ">=4.0.0 <4.17.21", // informational only, never parsed locally
    },
  ],
}

describe("Story 26.4 Slice B — queryNpmAudit", () => {
  it("maps a real npm bulk-advisories response into a valid ThreatAdvisory", async () => {
    safeFetchJson.mockResolvedValue(REAL_NPM_RESPONSE)
    const [advisory] = await queryNpmAudit([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])

    expect(advisory).toBeDefined()
    expect(advisory!.severity).toBe("medium") // moderate -> medium
    expect(advisory!.indicators).toEqual([
      { type: "package", value: "lodash" },
      { type: "version", value: "4.17.15" },
    ])
  })

  it("never includes the untrusted title text anywhere in the mapped advisory", async () => {
    safeFetchJson.mockResolvedValue(REAL_NPM_RESPONSE)
    const [advisory] = await queryNpmAudit([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])
    expect(JSON.stringify(advisory)).not.toContain("ReDoS")
  })

  it("skips non-npm ecosystem targets entirely (no request made)", async () => {
    const result = await queryNpmAudit([{ ecosystem: "pypi", package: "requests", version: "2.0.0" }])
    expect(result).toEqual([])
    expect(safeFetchJson).not.toHaveBeenCalled()
  })

  it("returns [] on a fetch failure rather than throwing (fail-soft)", async () => {
    safeFetchJson.mockRejectedValue(new Error("network error"))
    const result = await queryNpmAudit([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])
    expect(result).toEqual([])
  })

  it("drops an entry with no recognizable severity label", async () => {
    safeFetchJson.mockResolvedValue({ lodash: [{ id: 1, url: "https://x", severity: "unknown-label" }] })
    const result = await queryNpmAudit([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])
    expect(result).toEqual([])
  })

  it("produces one advisory per queried version when a package has multiple inventory versions", async () => {
    safeFetchJson.mockResolvedValue(REAL_NPM_RESPONSE)
    const result = await queryNpmAudit([
      { ecosystem: "npm", package: "lodash", version: "4.17.15" },
      { ecosystem: "npm", package: "lodash", version: "4.16.0" },
    ])
    expect(result).toHaveLength(2)
    expect(result.map((a) => a.indicators.find((i) => i.type === "version")?.value).sort()).toEqual([
      "4.16.0",
      "4.17.15",
    ])
  })
})
