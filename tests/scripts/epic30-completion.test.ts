import { describe, expect, it } from "vitest"

import {
  auditEpic30Checklist,
  type Epic30CompletionChecklist,
  loadEpic30Checklist,
} from "../../scripts/epic30/check-completion"

const root = process.cwd()

function cloneChecklist(): Epic30CompletionChecklist {
  return structuredClone(loadEpic30Checklist(root))
}

describe("Epic 30 completion checklist", () => {
  it("validates the canonical 13-story manifest while refusing a false completion claim", () => {
    const audit = auditEpic30Checklist(cloneChecklist(), root)
    expect(audit.valid).toBe(true)
    expect(audit.complete).toBe(false)
    expect(audit.pendingGateCount).toBeGreaterThan(0)
    expect(audit.notImplementedStories).toEqual([])
    expect(cloneChecklist().stories.find(({ id }) => id === "30.10")?.localState).toBe("partial")
  })

  it("rejects a missing or reordered story", () => {
    const checklist = cloneChecklist()
    checklist.stories.splice(4, 1)
    expect(auditEpic30Checklist(checklist, root).errors).toContain(
      "stories must contain 30.1 through 30.13 exactly once and in order",
    )
  })

  it("rejects completion while a story still has remaining gates", () => {
    const checklist = cloneChecklist()
    checklist.stories[0].localState = "complete"
    expect(auditEpic30Checklist(checklist, root).errors).toContain(
      "30.1: complete stories cannot have remaining gates",
    )
  })

  it("rejects missing or unsafe evidence paths", () => {
    const checklist = cloneChecklist()
    checklist.stories[0].evidence = ["../outside"]
    expect(auditEpic30Checklist(checklist, root).errors).toContain(
      "30.1: missing or unsafe evidence path ../outside",
    )
  })

  it("requires the overall state to match evidence-derived completion", () => {
    const checklist = cloneChecklist()
    checklist.overallState = "complete"
    expect(auditEpic30Checklist(checklist, root).errors).toContain(
      "overallState must equal the evidence-derived completion state",
    )
  })

  it("keeps every incomplete story out of BMAD done status", () => {
    const checklist = cloneChecklist()
    const audit = auditEpic30Checklist(checklist, root)
    expect(audit.errors.filter((error) => error.includes("BMAD status done"))).toEqual([])
  })

  it("requires the exact four verification commands", () => {
    const checklist = cloneChecklist()
    checklist.verificationCommands = ["true", "true", "true", "true"]
    expect(auditEpic30Checklist(checklist, root).errors).toContain("all four verification commands are required")
  })

  it("fails closed instead of throwing when remaining gates are malformed", () => {
    const checklist = cloneChecklist()
    checklist.stories[0].remaining = undefined as never
    const audit = auditEpic30Checklist(checklist, root)
    expect(audit.errors).toContain("30.1: remaining must be an array")
    expect(audit.errors).toContain("30.1: incomplete stories require at least one remaining gate")
  })
})
