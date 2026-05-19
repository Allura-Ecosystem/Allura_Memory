import { describe, expect, it } from "vitest"

import { scanReleaseSafety } from "@/lib/release/safety-scan"

describe("release safety scan", () => {
  it("finds no high-confidence secrets or private board configs in public release surfaces", () => {
    expect(scanReleaseSafety()).toEqual([])
  })
})

