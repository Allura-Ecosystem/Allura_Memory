/**
 * Shared branch validation helpers (epic-27 retro item 11).
 * Pins the extracted requireText/requireDiff/requireEvidenceRefs contract.
 */

import { describe, expect, it } from "vitest"
import { requireDiff, requireEvidenceRefs, requireText } from "../validation"

describe("requireText", () => {
  it("returns the trimmed value for a non-empty string", () => {
    expect(requireText("  abc  ", "field")).toBe("abc")
  })

  it("throws for non-strings", () => {
    expect(() => requireText(42, "field")).toThrow("field is required")
    expect(() => requireText(undefined, "field")).toThrow("field is required")
    expect(() => requireText(null, "field")).toThrow("field is required")
  })

  it("throws for empty or whitespace-only strings", () => {
    expect(() => requireText("", "field")).toThrow("field is required")
    expect(() => requireText("   ", "field")).toThrow("field is required")
  })
})

describe("requireDiff", () => {
  it("accepts a diff with at least one change", () => {
    expect(requireDiff({ added: ["a"] })).toEqual({ added: ["a"], overridden: [], deleted: [] })
    expect(requireDiff({ overridden: ["b"] })).toEqual({ added: [], overridden: ["b"], deleted: [] })
    expect(requireDiff({ deleted: ["c"] })).toEqual({ added: [], overridden: [], deleted: ["c"] })
  })

  it("throws for empty diffs", () => {
    expect(() => requireDiff({})).toThrow("diff must contain at least one")
    expect(() => requireDiff({ added: [], overridden: [], deleted: [] })).toThrow("diff must contain at least one")
  })

  it("throws for non-objects", () => {
    expect(() => requireDiff(null)).toThrow("diff is required")
    expect(() => requireDiff("nope")).toThrow("diff is required")
  })
})

describe("requireEvidenceRefs", () => {
  it("returns trimmed non-empty refs", () => {
    expect(requireEvidenceRefs(["  a  ", "b", ""])).toEqual(["a", "b"])
  })

  it("throws for non-arrays and empty arrays", () => {
    expect(() => requireEvidenceRefs("x")).toThrow("evidence_refs must be an array")
    expect(() => requireEvidenceRefs([])).toThrow("evidence_refs must not be empty")
    expect(() => requireEvidenceRefs(["  "])).toThrow("evidence_refs must not be empty")
  })
})
