import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = resolve(__dirname, "../..")
const fixtures: string[] = []
const keys = ["25.1", "25.2a", "25.2b", "25.3", "25.4", "25.5", "25.6", "25.7"]
const deps: Record<string, string[]> = {
  "25.1": [],
  "25.2a": ["25.1"],
  "25.2b": ["25.1"],
  "25.3": ["25.1", "25.2a", "25.2b"],
  "25.4": ["25.3"],
  "25.5": ["25.4"],
  "25.6": ["25.5"],
  "25.7": ["25.6"],
}

function blocksFor(key: string): string[] {
  const result = new Set<string>()
  const pending = keys.filter((candidate) => deps[candidate]?.includes(key))
  while (pending.length > 0) {
    const candidate = pending.pop()
    if (!candidate || result.has(candidate)) continue
    result.add(candidate)
    pending.push(...keys.filter((next) => deps[next]?.includes(candidate)))
  }
  return keys.filter((candidate) => result.has(candidate))
}

function fixture(
  options: {
    omitStory?: string
    planDeps?: Partial<Record<string, string[]>>
    planBlockedRaw?: Partial<Record<string, string>>
    storyStatus?: Partial<Record<string, string>>
    sprintStatus?: Partial<Record<string, string>>
    storyBlocks?: Partial<Record<string, string[]>>
    omitStoryHeader?: string
    omitStoriesHeading?: boolean
  } = {}
): string {
  const root = mkdtempSync(join(tmpdir(), "epic25-drift-"))
  fixtures.push(root)
  const planning = join(root, "_bmad/bmm/planning")
  const stories = join(root, "_bmad/bmm/stories")
  mkdirSync(planning, { recursive: true })
  mkdirSync(stories, { recursive: true })

  const table = keys.map((key) => {
    const blockedBy = options.planDeps?.[key] ?? deps[key] ?? []
    const blockedByCell = options.planBlockedRaw?.[key] ?? (blockedBy.join(", ") || "—")
    return `| ${key} | Story ${key} | blocked | ${blockedByCell} |`
  })
  writeFileSync(
    join(planning, "epic-25-governed-curator-review-console.md"),
    `${options.omitStoriesHeading ? "## Elsewhere" : "## Stories"}\n\n| Key | Title | Status | Blocked by |\n|---|---|---|---|\n${table.join("\n")}\n`
  )

  for (const key of keys) {
    if (key === options.omitStory) continue
    const filename = key.replace(".", "-")
    const blocks = options.storyBlocks?.[key] ?? blocksFor(key)
    const headers =
      key === options.omitStoryHeader
        ? `**Status:** blocked\n**Depends on:** ${(deps[key] ?? []).join(", ") || "—"}`
        : `**Status:** ${options.storyStatus?.[key] ?? "blocked"}\n**Depends on:** ${(deps[key] ?? []).join(", ") || "—"}\n**Blocks:** ${blocks.join(", ") || "—"}`
    writeFileSync(join(stories, `${filename}-fixture.md`), `# Story ${key}\n\n${headers}\n`)
  }

  const sprint = keys.map(
    (key) =>
      `  - key: "${key}"\n    title: "Story ${key}"\n    status: "${options.sprintStatus?.[key] ?? "blocked"}"\n    depends_on: [${(deps[key] ?? []).map((dep) => `"${dep}"`).join(", ")}]`
  )
  writeFileSync(join(stories, "sprint-status.yaml"), `epic_25:\n${sprint.join("\n")}`)
  return root
}

function run(root: string): { exitCode: number; output: string } {
  const result = spawnSync("bun", ["scripts/check-epic25-drift.ts"], {
    cwd: repoRoot,
    env: { ...process.env, EPIC25_DRIFT_ROOT: root },
    encoding: "utf8",
  })
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  }
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("check-epic25-drift", () => {
  it("passes a fully aligned Epic 25 fixture", () => {
    const result = run(fixture())
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("PASS - no drift")
  })

  it("reports missing story membership", () => {
    const result = run(fixture({ omitStory: "25.6" }))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[25.6] membership")
  })

  it("reports the known 25.3 omission of dependency 25.2a", () => {
    const result = run(fixture({ planDeps: { "25.3": ["25.1", "25.2b"] } }))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[25.3] Depends-on")
    expect(result.output).toContain("25.2a")
  })

  it("reports status and Blocks mismatches", () => {
    const result = run(
      fixture({
        sprintStatus: { "25.5": "done" },
        storyBlocks: { "25.4": ["25.5"] },
      })
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[25.5] status")
    expect(result.output).toContain("[25.4] Blocks")
  })

  it("expands story-key ranges before comparing dependencies", () => {
    const result = run(
      fixture({
        planBlockedRaw: { "25.3": "25.1–25.2b" },
      })
    )
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("PASS - no drift")
  })

  it("fails malformed story headers and missing planning input", () => {
    const malformed = run(fixture({ omitStoryHeader: "25.4" }))
    expect(malformed.exitCode).toBe(1)
    expect(malformed.output).toContain("[25.4] story-file header")

    const missing = run(fixture({ omitStoriesHeading: true }))
    expect(missing.exitCode).toBe(2)
    expect(missing.output).toContain('FATAL: no "## Stories" heading')
  })
})
