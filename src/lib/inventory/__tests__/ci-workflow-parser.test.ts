/**
 * Bumblebee Guard — GitHub Actions workflow inventory source.
 *
 * The fixture below is a trimmed excerpt of real `uses:` lines from this
 * repository's own .github/workflows/*.yml files (public repo config, not
 * fabricated data), deliberately including the real mix of SHA-pinned and
 * mutable-tag references that exists in this repo today.
 */

import { describe, expect, it } from "vitest"
import { extractActionReferences, parseGithubWorkflow, parseGithubWorkflows } from "../ci-workflow-parser"

const REAL_EXCERPT = `
name: Check
on: [push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - name: Cache
        uses: actions/cache@v3
      - name: Scan
        uses: gitleaks/gitleaks-action@v2
      # - uses: some/disabled-action@v1
      - uses: ./.github/actions/local-composite
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
`

describe("Bumblebee Guard — extractActionReferences", () => {
  it("extracts every third-party uses: reference with its line number", () => {
    const refs = extractActionReferences(REAL_EXCERPT)
    expect(refs.map((r) => r.reference)).toEqual([
      "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
      "oven-sh/setup-bun@v2",
      "actions/cache@v3",
      "gitleaks/gitleaks-action@v2",
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    ])
  })

  it("strips the trailing `# v4.2.2` comment from a SHA-pinned reference", () => {
    const refs = extractActionReferences(REAL_EXCERPT)
    const checkout = refs.find((r) => r.repository === "actions/checkout")
    expect(checkout?.ref).toBe("11bd71901bbe5b1630ceea73d27597364c9af683")
    expect(checkout?.reference).not.toContain("#")
  })

  it("classifies SHA-pinned versus mutable-tag references correctly", () => {
    const refs = extractActionReferences(REAL_EXCERPT)
    const pinned = refs.filter((r) => r.pinnedToSha).map((r) => r.repository)
    const mutable = refs.filter((r) => !r.pinnedToSha).map((r) => r.repository)

    expect(pinned).toEqual(["actions/checkout", "actions/upload-artifact"])
    expect(mutable).toEqual(["oven-sh/setup-bun", "actions/cache", "gitleaks/gitleaks-action"])
  })

  it("treats a short SHA as mutable — only a full 40-char SHA is immutable", () => {
    // An abbreviated SHA is not a valid `uses:` pin and must not be mistaken
    // for one.
    const refs = extractActionReferences("      - uses: actions/checkout@11bd719\n")
    expect(refs[0]?.pinnedToSha).toBe(false)
  })

  it("skips commented-out steps", () => {
    const refs = extractActionReferences(REAL_EXCERPT)
    expect(refs.some((r) => r.repository === "some/disabled-action")).toBe(false)
  })

  it("skips local composite actions (not a third-party supply-chain artifact)", () => {
    const refs = extractActionReferences(REAL_EXCERPT)
    expect(refs.some((r) => r.reference.startsWith("./"))).toBe(false)
  })

  it("skips docker:// references (covered by container_metadata, not this type)", () => {
    const refs = extractActionReferences("      - uses: docker://alpine@sha256:abc\n")
    expect(refs).toEqual([])
  })

  it("skips an unversioned reference with no @ref to pin", () => {
    const refs = extractActionReferences("      - uses: actions/checkout\n")
    expect(refs).toEqual([])
  })

  it("handles a subpath reference (owner/repo/subpath@ref)", () => {
    const refs = extractActionReferences("      - uses: github/codeql-action/analyze@v3\n")
    expect(refs[0]?.repository).toBe("github/codeql-action/analyze")
    expect(refs[0]?.ref).toBe("v3")
  })

  it("returns no records for empty or malformed content instead of throwing", () => {
    expect(extractActionReferences("")).toEqual([])
    expect(extractActionReferences("::: not yaml at all :::")).toEqual([])
    expect(extractActionReferences("uses:")).toEqual([])
  })
})

describe("Bumblebee Guard — parseGithubWorkflow", () => {
  it("normalizes references into ci_workflow inventory records", () => {
    const records = parseGithubWorkflow(REAL_EXCERPT, ".github/workflows/check.yml", "2026-08-27T00:00:00.000Z")
    const cache = records.find((r) => r.package === "actions/cache")

    expect(cache).toMatchObject({
      id: "ghaction:actions/cache@v3",
      artifact_type: "ci_workflow",
      ecosystem: "github-actions",
      package: "actions/cache",
      version: "v3",
      publisher: "actions",
      workflow_reference: "actions/cache@v3",
      freshness_state: "fresh",
    })
  })

  it("populates workflow_reference for real — the field the exposure matcher matches on", () => {
    const records = parseGithubWorkflow(REAL_EXCERPT, ".github/workflows/check.yml")
    // Every record's workflow_reference is its actual action reference, not a
    // sentinel placeholder like the lockfile source is forced to use.
    for (const record of records) {
      expect(record.workflow_reference).toBe(record.id.replace(/^ghaction:/, ""))
    }
  })

  it("carries the SHA as the hash for a pinned reference", () => {
    const records = parseGithubWorkflow(REAL_EXCERPT, ".github/workflows/check.yml")
    const checkout = records.find((r) => r.package === "actions/checkout")

    expect(checkout?.hash).toBe("11bd71901bbe5b1630ceea73d27597364c9af683")
  })

  it("carries the 'unpinned' sentinel hash for a mutable-tag reference", () => {
    const records = parseGithubWorkflow(REAL_EXCERPT, ".github/workflows/check.yml")
    const gitleaks = records.find((r) => r.package === "gitleaks/gitleaks-action")

    expect(gitleaks?.hash).toBe("unpinned")
  })

  it("keeps mutable-tag references verified+fresh so they remain MATCHABLE", () => {
    // Regression guard for a real design trap: trust_state means "provenance
    // confirmed", not "artifact is safe". Story 26.3's matcher only produces
    // exposures for verified+fresh records, so downgrading unpinned tags here
    // would silently exempt the most attackable references from ever matching
    // an advisory -- the exact opposite of this source's purpose.
    const records = parseGithubWorkflow(REAL_EXCERPT, ".github/workflows/check.yml")
    const mutable = records.filter((r) => r.hash === "unpinned")

    expect(mutable.length).toBeGreaterThan(0)
    for (const record of mutable) {
      expect(record.trust_state).toBe("verified")
      expect(record.freshness_state).toBe("fresh")
    }
  })

  it("records the file and line the reference came from", () => {
    const records = parseGithubWorkflow(REAL_EXCERPT, ".github/workflows/check.yml")
    const cache = records.find((r) => r.package === "actions/cache")
    expect(cache?.source_ref).toMatch(/^\.github\/workflows\/check\.yml#L\d+$/)
  })

  it("deduplicates a reference repeated across jobs in one file", () => {
    const repeated = `
      - uses: actions/cache@v3
      - uses: actions/cache@v3
`
    expect(parseGithubWorkflow(repeated, "a.yml")).toHaveLength(1)
  })
})

describe("Bumblebee Guard — parseGithubWorkflows", () => {
  it("deduplicates a reference appearing in more than one file, first file wins", () => {
    const records = parseGithubWorkflows([
      { path: "first.yml", content: "      - uses: actions/cache@v3\n" },
      { path: "second.yml", content: "      - uses: actions/cache@v3\n" },
    ])

    expect(records).toHaveLength(1)
    expect(records[0]?.source_ref).toMatch(/^first\.yml/)
  })

  it("merges distinct references across files", () => {
    const records = parseGithubWorkflows([
      { path: "a.yml", content: "      - uses: actions/cache@v3\n" },
      { path: "b.yml", content: "      - uses: oven-sh/setup-bun@v2\n" },
    ])
    expect(records.map((r) => r.package).sort()).toEqual(["actions/cache", "oven-sh/setup-bun"])
  })
})
