/**
 * Story 26.4 Slice B — OSV.dev adapter.
 *
 * Mocks safe-fetch's HTTP layer with response shapes captured from real
 * calls to https://api.osv.dev/v1/query during development (2026-08-27) --
 * not invented shapes. The real response's free-text `summary`/`details`
 * fields (confirmed to carry raw exploit code in some real advisories) are
 * included here to prove they are never read.
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

const { queryOsv } = await import("../osv-adapter")

const REAL_OSV_RESPONSE = {
  vulns: [
    {
      id: "GHSA-29mw-wpgm-hmr9",
      summary: "Regular Expression Denial of Service (ReDoS) in lodash",
      details: "```js\nvar lo = require('lodash');\nlo.trim(dangerous_payload)\n```", // untrusted, must never be read
      aliases: ["CVE-2020-28500"],
      modified: "2025-09-29T21:12:31.102523Z",
      published: "2022-01-06T20:30:46Z",
      database_specific: { severity: "MODERATE" },
    },
  ],
}

describe("Story 26.4 Slice B — queryOsv", () => {
  it("maps a real OSV response into a valid ThreatAdvisory", async () => {
    safeFetchJson.mockResolvedValue(REAL_OSV_RESPONSE)
    const [advisory] = await queryOsv({ ecosystem: "npm", package: "lodash", version: "4.17.15" })

    expect(advisory).toBeDefined()
    expect(advisory!.severity).toBe("medium") // MODERATE -> medium
    expect(advisory!.indicators).toEqual([
      { type: "package", value: "lodash" },
      { type: "version", value: "4.17.15" },
    ])
    expect(advisory!.trust_state).toBe("verified")
    expect(advisory!.freshness_state).toBe("fresh")
  })

  it("never includes the untrusted summary/details text anywhere in the mapped advisory", async () => {
    safeFetchJson.mockResolvedValue(REAL_OSV_RESPONSE)
    const [advisory] = await queryOsv({ ecosystem: "npm", package: "lodash", version: "4.17.15" })

    const serialized = JSON.stringify(advisory)
    expect(serialized).not.toContain("require('lodash')")
    expect(serialized).not.toContain("ReDoS")
  })

  it("drops an advisory with no recognizable severity label (fails closed, never guesses)", async () => {
    safeFetchJson.mockResolvedValue({
      vulns: [{ id: "GHSA-unknown-severity", database_specific: {} }],
    })
    const result = await queryOsv({ ecosystem: "npm", package: "lodash", version: "4.17.15" })
    expect(result).toEqual([])
  })

  it("returns [] on a fetch failure rather than throwing (fail-soft)", async () => {
    safeFetchJson.mockRejectedValue(new Error("network error"))
    const result = await queryOsv({ ecosystem: "npm", package: "lodash", version: "4.17.15" })
    expect(result).toEqual([])
  })

  it("returns [] on a malformed response shape", async () => {
    safeFetchJson.mockResolvedValue({ not: "the expected shape" })
    const result = await queryOsv({ ecosystem: "npm", package: "lodash", version: "4.17.15" })
    expect(result).toEqual([])
  })

  it("rejects a package name containing characters unsafe for an outbound request", async () => {
    await expect(
      queryOsv({ ecosystem: "npm", package: "lodash\r\nX-Injected: true", version: "1.0.0" }),
    ).rejects.toThrow()
  })
})
