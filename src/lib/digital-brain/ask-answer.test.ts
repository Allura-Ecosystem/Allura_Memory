import { describe, expect, it } from "vitest"
import { createGroundedReadOnlyAnswer, type ReadOnlyAskProvider } from "./ask-answer"

const context = { sources: [
  { documentId: "doc-a", title: "Runbook", excerpt: "Authorized detail" },
  { documentId: "doc-b", title: "Checklist", excerpt: "More authorized detail" },
] }
const provider = (result: { answer: string; citationIds: readonly string[] }, policy = { retention: "none" as const, training: "none" as const }): ReadOnlyAskProvider => ({ policy, answer: async () => result })

describe("grounded read-only Ask boundary", () => {
  it("returns the provider answer with only context-bound citations", async () => {
    await expect(createGroundedReadOnlyAnswer("What is authorized?", context, provider({ answer: "See the runbook.", citationIds: ["doc-a"] }))).resolves.toEqual({
      answer: "See the runbook.", citations: [{ documentId: "doc-a", title: "Runbook" }],
    })
  })

  it("fails closed for missing context, invalid questions, or provider policy", async () => {
    const good = provider({ answer: "Answer", citationIds: ["doc-a"] })
    await expect(createGroundedReadOnlyAnswer("", context, good)).resolves.toBeNull()
    await expect(createGroundedReadOnlyAnswer("Question", null, good)).resolves.toBeNull()
    await expect(createGroundedReadOnlyAnswer("Question", context, provider({ answer: "Answer", citationIds: ["doc-a"] }, { retention: "indefinite", training: "none" } as never))).rejects.toThrow(/policy refused/)
  })

  it("rejects fabricated, duplicate, empty, and overlarge citation output", async () => {
    for (const citationIds of [["hidden"], ["doc-a", "doc-a"], [], Array.from({ length: 21 }, () => "doc-a")]) {
      await expect(createGroundedReadOnlyAnswer("Question", context, provider({ answer: "Answer", citationIds }))).resolves.toBeNull()
    }
  })

  it("fails closed without reflecting provider errors or protected context", async () => {
    const protectedFailure = "provider-token=secret; Authorized detail; backend=internal"
    const failingProvider: ReadOnlyAskProvider = {
      policy: { retention: "none", training: "none" },
      answer: async () => { throw new Error(protectedFailure) },
    }

    const result = await createGroundedReadOnlyAnswer("Question", context, failingProvider)
    expect(result).toBeNull()
    expect(JSON.stringify(result)).not.toContain(protectedFailure)
    expect(JSON.stringify(result)).not.toContain("Authorized detail")
  })

  it("does not expose context metadata beyond answer and citations", async () => {
    const result = await createGroundedReadOnlyAnswer("Question", context, provider({ answer: "Answer", citationIds: ["doc-b"] }))
    expect(result).toEqual({ answer: "Answer", citations: [{ documentId: "doc-b", title: "Checklist" }] })
    expect(JSON.stringify(result)).not.toContain("Authorized detail")
  })
})
