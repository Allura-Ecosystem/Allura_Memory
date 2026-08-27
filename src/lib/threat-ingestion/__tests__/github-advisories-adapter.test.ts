/**
 * Story 26.4 Slice B — GitHub Security Advisories adapter.
 *
 * Mocks safe-fetch's HTTP layer with a response shape captured from a real
 * call to https://api.github.com/advisories?affects=lodash during
 * development (2026-08-27). This source is the one that requires local
 * semver range checking (vulnerable_version_range), unlike OSV.dev/npm
 * which resolve exact-version matches server-side.
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

const { queryGithubAdvisories } = await import("../github-advisories-adapter")

const REAL_GITHUB_RESPONSE = [
  {
    ghsa_id: "GHSA-r5fr-rjxr-66jc",
    html_url: "https://github.com/advisories/GHSA-r5fr-rjxr-66jc",
    summary: "lodash vulnerable to Code Injection via `_.template` imports key names", // untrusted, never read
    description: "### Impact\n\nAn attacker can inject default-parameter expressions...", // untrusted, never read
    severity: "high",
    published_at: "2026-04-01T23:51:12Z",
    vulnerabilities: [
      { package: { ecosystem: "npm", name: "lodash" }, vulnerable_version_range: ">= 4.0.0, <= 4.17.23", first_patched_version: "4.18.0" },
      { package: { ecosystem: "npm", name: "lodash-es" }, vulnerable_version_range: ">= 4.0.0, <= 4.17.23", first_patched_version: "4.18.0" },
    ],
  },
]

describe("Story 26.4 Slice B — queryGithubAdvisories", () => {
  it("maps a real GitHub Advisories response into a valid ThreatAdvisory for a version inside the range", async () => {
    safeFetchJson.mockResolvedValue(REAL_GITHUB_RESPONSE)
    const [advisory] = await queryGithubAdvisories([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])

    expect(advisory).toBeDefined()
    expect(advisory!.severity).toBe("high")
    expect(advisory!.indicators).toEqual([
      { type: "package", value: "lodash" },
      { type: "version", value: "4.17.15" },
    ])
  })

  it("does NOT match a version outside the vulnerable range (the patched version)", async () => {
    safeFetchJson.mockResolvedValue(REAL_GITHUB_RESPONSE)
    const result = await queryGithubAdvisories([{ ecosystem: "npm", package: "lodash", version: "4.18.0" }])
    expect(result).toEqual([])
  })

  it("does NOT match a version below the range's introduced bound", async () => {
    safeFetchJson.mockResolvedValue(REAL_GITHUB_RESPONSE)
    const result = await queryGithubAdvisories([{ ecosystem: "npm", package: "lodash", version: "3.9.0" }])
    expect(result).toEqual([])
  })

  it("never includes the untrusted summary/description text anywhere in the mapped advisory", async () => {
    safeFetchJson.mockResolvedValue(REAL_GITHUB_RESPONSE)
    const [advisory] = await queryGithubAdvisories([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])
    expect(JSON.stringify(advisory)).not.toContain("Code Injection")
    expect(JSON.stringify(advisory)).not.toContain("Impact")
  })

  it("only matches the package the query was actually for, not sibling packages in the same advisory", async () => {
    safeFetchJson.mockResolvedValue(REAL_GITHUB_RESPONSE)
    const result = await queryGithubAdvisories([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])
    // lodash-es is a distinct package in the advisory's vulnerabilities[] but was not queried
    expect(result.every((a) => a.indicators.find((i) => i.type === "package")?.value === "lodash")).toBe(true)
  })

  it("caps distinct packages queried per cycle at MAX_PACKAGES_PER_CYCLE", async () => {
    const { MAX_PACKAGES_PER_CYCLE } = await import("../github-advisories-adapter")
    safeFetchJson.mockResolvedValue([])
    const targets = Array.from({ length: MAX_PACKAGES_PER_CYCLE + 10 }, (_, i) => ({
      ecosystem: "npm",
      package: `pkg-${i}`,
      version: "1.0.0",
    }))
    await queryGithubAdvisories(targets)
    expect(safeFetchJson).toHaveBeenCalledTimes(MAX_PACKAGES_PER_CYCLE)
  })

  it("returns [] on a fetch failure for one package without aborting the whole cycle", async () => {
    safeFetchJson.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce(REAL_GITHUB_RESPONSE)
    const result = await queryGithubAdvisories([
      { ecosystem: "npm", package: "broken-pkg", version: "1.0.0" },
      { ecosystem: "npm", package: "lodash", version: "4.17.15" },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.indicators.find((i) => i.type === "package")?.value).toBe("lodash")
  })

  it("drops an advisory with no recognizable severity label", async () => {
    safeFetchJson.mockResolvedValue([{ ...REAL_GITHUB_RESPONSE[0], severity: "unknown-label" }])
    const result = await queryGithubAdvisories([{ ecosystem: "npm", package: "lodash", version: "4.17.15" }])
    expect(result).toEqual([])
  })
})
