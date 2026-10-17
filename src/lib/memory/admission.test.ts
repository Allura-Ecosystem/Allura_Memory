import { describe, expect, it } from "vitest"

import { evaluateMemoryAdmission } from "@/lib/memory/admission"

describe("evaluateMemoryAdmission", () => {
  const echo = "OUTCOME — intent: fix the export path"
  const bg =
    "Background command 'bun run test:unit' completed (exit code 0). Read the output file to retrieve the result."

  it("rejects auto-captured OUTCOME intent echo", () => {
    const r = evaluateMemoryAdmission({ content: echo, source: "conversation" })
    expect(r.admitted).toBe(false)
    if (!r.admitted) expect(r.reason).toBe("conversational_echo")
  })

  it("rejects the hyphen-minus variant of the echo", () => {
    expect(
      evaluateMemoryAdmission({ content: "OUTCOME - intent: ship it", source: "conversation" }).admitted
    ).toBe(false)
  })

  it("rejects background-process status notices", () => {
    const r = evaluateMemoryAdmission({ content: bg, source: "conversation" })
    expect(r.admitted).toBe(false)
    if (!r.admitted) expect(r.reason).toBe("status_notice")
  })

  it("rejects when source is unspecified (defaults to automatic capture)", () => {
    expect(evaluateMemoryAdmission({ content: echo }).admitted).toBe(false)
  })

  it("admits echo-shaped content only when explicitly manual and meaningful", () => {
    const meaningful =
      "OUTCOME — intent: fix export routing. Result: canonical_only now uses the semantic adapter; verified by memory-export-contract test."
    expect(evaluateMemoryAdmission({ content: meaningful, source: "manual" }).admitted).toBe(true)
  })

  it("still rejects a manual echo that carries no result", () => {
    expect(evaluateMemoryAdmission({ content: echo, source: "manual" }).admitted).toBe(false)
  })

  it("preserves concise structured outcome traces", () => {
    const structured =
      "OUTCOME — task: memory_export routing | result: success | evidence: 2 tests green | files: src/mcp/canonical-tools.ts"
    expect(evaluateMemoryAdmission({ content: structured, source: "conversation" }).admitted).toBe(true)
  })

  it("admits ordinary memories", () => {
    expect(
      evaluateMemoryAdmission({ content: "User prefers dark theme in the editor", source: "conversation" }).admitted
    ).toBe(true)
  })
})
