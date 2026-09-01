import { describe, expect, it } from "vitest"

import { canonicalJson } from "../canonical-json"

describe("canonicalJson", () => {
  it("orders object keys by UTF-16 code units independent of locale", () => {
    const value = { "\u00e4": 1, z: 2, A: 3, "\ud83d\ude00": 4 }

    expect(canonicalJson(value)).toBe('{"A":3,"z":2,"\u00e4":1,"\ud83d\ude00":4}')
  })

  it("canonicalizes nested objects while preserving array order", () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }, 3], a: true }))
      .toBe('{"a":true,"z":[{"a":1,"b":2},3]}')
  })

  it.each([
    ["undefined", undefined],
    ["function", () => undefined],
    ["symbol", Symbol("x")],
    ["bigint", 1n],
    ["non-finite number", Number.NaN],
    ["date", new Date("2026-08-31T00:00:00.000Z")],
    ["undefined property", { value: undefined }],
    ["undefined array item", [undefined]],
  ])("rejects %s instead of emitting an ambiguous encoding", (_label, value) => {
    expect(() => canonicalJson(value)).toThrow(/canonical JSON/i)
  })

  it("rejects sparse arrays", () => {
    const sparse = Array(1)
    expect(() => canonicalJson(sparse)).toThrow(/sparse/i)
  })

  it("rejects cyclic objects", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => canonicalJson(cyclic)).toThrow(/cyclic/i)
  })
})
