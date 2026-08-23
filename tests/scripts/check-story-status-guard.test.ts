/**
 * Tests for the CA-24-02 story status guard (`scripts/check-story-status-guard.ts`).
 *
 * Every check has a PAIR of tests: one fixture that trips it and one that does not.
 * A guard is only worth having if it can fail, so each violation test asserts the
 * non-zero exit code AND the specific check name, and each clean counterpart proves
 * the finding came from the mutation rather than from the fixture being broken.
 *
 * Fixtures are written to a temp directory and the guard is pointed at them with
 * STORY_STATUS_GUARD_ROOT. The real `_bmad/` tree is never read or mutated by these
 * tests.
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const repoRoot = resolve(__dirname, "../..")
const scratch: string[] = []

interface StorySpec {
  /** Story key as it appears in sprint-status.yaml, e.g. "24.11a". */
  key: string
  /** Status declared in sprint-status.yaml. */
  status: string
  /** Status written into the story file header. Defaults to `status`. */
  fileStatus?: string
  /** Extra header-region lines (above the first `##` heading). */
  headerExtra?: string
  /** Acceptance criteria lines. `null` omits the section entirely. */
  acceptanceCriteria?: string[] | null
  /** Emit a `## Dev Agent Record` / `### Completion Notes` section. Default true. */
  devAgentRecord?: boolean
  /** Extra body text appended after the Dev Agent Record. */
  bodyExtra?: string
  /** Skip writing the story file at all. */
  omitFile?: boolean
  /** Extra filenames that also match this key's `NN-M-*.md` pattern. */
  decoyFiles?: { suffix: string; content: string }[]
}

function fileNameFor(key: string): string {
  return `${key.replace(".", "-")}-fixture.md`
}

function storyMarkdown(spec: StorySpec): string {
  const parts: string[] = [`# Story ${spec.key} - fixture`, ""]
  parts.push(`**Status:** ${spec.fileStatus ?? spec.status}`)
  parts.push(`**Owner:** Fixture`)
  if (spec.headerExtra !== undefined) parts.push(spec.headerExtra)
  parts.push("", "## Outcome", "", "A fixture story used only by the guard tests.", "")

  if (spec.acceptanceCriteria !== null) {
    parts.push("## Acceptance Criteria", "")
    const criteria = spec.acceptanceCriteria ?? ["- [x] AC-1: the thing was built."]
    parts.push(...criteria)
    parts.push("")
  }

  if (spec.devAgentRecord !== false) {
    parts.push("## Dev Agent Record", "")
    parts.push("### Completion Notes", "")
    parts.push("Agent: Fixture Agent", "Date: 2026-08-23", "Files changed: fixture.md", "Commands/evidence: bun test (exit 0)", "Remaining gaps: none", "")
  }

  if (spec.bodyExtra !== undefined) parts.push(spec.bodyExtra, "")
  return parts.join("\n")
}

function sprintYaml(specs: StorySpec[]): string {
  const byEpic = new Map<string, StorySpec[]>()
  for (const spec of specs) {
    const epic = `epic_${spec.key.split(".")[0] ?? "0"}`
    const bucket = byEpic.get(epic)
    if (bucket === undefined) byEpic.set(epic, [spec])
    else bucket.push(spec)
  }

  const blocks: string[] = []
  for (const [epic, stories] of byEpic) {
    const rows = stories.map(
      (s) =>
        `    - key: "${s.key}"\n` +
        `      title: "Fixture story ${s.key}"\n` +
        `      status: "${s.status}"`
    )
    blocks.push(`${epic}:\n  name: "Fixture epic"\n  stories:\n${rows.join("\n")}`)
  }
  return `${blocks.join("\n\n")}\n`
}

interface FixtureOptions {
  /** Raw sprint-status.yaml content, replacing the generated one. */
  sprintOverride?: string
  /** Skip writing sprint-status.yaml entirely. */
  omitSprintStatus?: boolean
  /** Extra files to create anywhere under the fixture root (relative paths). */
  extraFiles?: { path: string; content: string }[]
}

function fixture(specs: StorySpec[], options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "story-status-guard-"))
  scratch.push(root)
  const stories = join(root, "_bmad/bmm/stories")
  mkdirSync(stories, { recursive: true })

  for (const spec of specs) {
    if (spec.omitFile !== true) {
      writeFileSync(join(stories, fileNameFor(spec.key)), storyMarkdown(spec))
    }
    for (const decoy of spec.decoyFiles ?? []) {
      writeFileSync(join(stories, `${spec.key.replace(".", "-")}-${decoy.suffix}.md`), decoy.content)
    }
  }

  if (options.omitSprintStatus !== true) {
    writeFileSync(
      join(stories, "sprint-status.yaml"),
      options.sprintOverride ?? sprintYaml(specs)
    )
  }

  for (const extra of options.extraFiles ?? []) {
    const target = join(root, extra.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, extra.content)
  }

  return root
}

function run(root: string): { exitCode: number; output: string } {
  const result = spawnSync("bun", ["scripts/check-story-status-guard.ts"], {
    cwd: repoRoot,
    env: { ...process.env, STORY_STATUS_GUARD_ROOT: root },
    encoding: "utf8",
  })
  return {
    exitCode: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  }
}

/** A story that satisfies every check. Used as the clean baseline everywhere. */
function cleanDoneStory(key = "20.1"): StorySpec {
  return {
    key,
    status: "done",
    acceptanceCriteria: ["- [x] AC-1: shipped.", "- [x] AC-2: evidenced."],
  }
}

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("check-story-status-guard - baseline", () => {
  it("exits 0 on a done story whose evidence supports the status", () => {
    const result = run(fixture([cleanDoneStory()]))
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("PASS -")
  })

  it("counts the stories it actually inspected", () => {
    const result = run(fixture([cleanDoneStory("20.1"), cleanDoneStory("20.2")]))
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("2 stories")
    expect(result.output).toContain("marked done        : 2")
  })
})

describe("check-story-status-guard - unchecked acceptance criteria", () => {
  it("FAILS a done story with an unchecked acceptance criterion", () => {
    const result = run(
      fixture([
        {
          key: "20.1",
          status: "done",
          acceptanceCriteria: ["- [x] AC-1: shipped.", "- [ ] AC-2: never started."],
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[20.1] unchecked-acceptance-criterion")
    expect(result.output).toContain("AC-2: never started")
  })

  it("reports the count and does not stop at the first unchecked box", () => {
    const result = run(
      fixture([
        {
          key: "20.1",
          status: "done",
          acceptanceCriteria: [
            "- [ ] AC-1",
            "- [ ] AC-2",
            "- [ ] AC-3",
            "- [ ] AC-4",
          ],
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("still has 4 unchecked acceptance")
    expect(result.output).toContain("+1 more")
  })

  it("does NOT fire when the same unchecked criteria sit on a non-done story", () => {
    const result = run(
      fixture([
        {
          key: "20.1",
          status: "ready-for-dev",
          acceptanceCriteria: ["- [ ] AC-1: not started."],
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("does NOT read an unchecked box outside the acceptance criteria section as an AC", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          bodyExtra: "## Follow-up backlog\n\n- [ ] Someone should tidy the logs later.",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("FAILS a done story that has no acceptance criteria section at all", () => {
    const result = run(fixture([{ key: "20.1", status: "done", acceptanceCriteria: null }]))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[20.1] missing-acceptance-criteria")
  })
})

describe("check-story-status-guard - explicit incompleteness markers", () => {
  const markers = [
    "NOT COMPLETE. See Completion Notes AC-6.",
    "AC-6 is not satisfied.",
    "AC-4 remains incomplete pending a human decision.",
    "The manifest wiring does not satisfy the stated criterion.",
    "AC-2 is partially satisfied.",
  ]

  for (const marker of markers) {
    it(`FAILS a done story whose file says: ${marker}`, () => {
      const result = run(
        fixture([{ ...cleanDoneStory(), bodyExtra: `## Notes\n\n${marker}` }])
      )
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("[20.1] incompleteness-marker")
    })
  }

  it("does NOT fire on a done story with no incompleteness language", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          bodyExtra: "## Notes\n\nAll acceptance criteria are satisfied and evidenced.",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("does NOT fire when the same marker sits on a non-done story", () => {
    const result = run(
      fixture([
        {
          key: "20.1",
          status: "review",
          bodyExtra: "## Notes\n\nNOT COMPLETE. See Completion Notes AC-6.",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })
})

describe("check-story-status-guard - Dev Agent Record", () => {
  it("FAILS a done story with no Dev Agent Record and no Completion Notes", () => {
    const result = run(fixture([{ ...cleanDoneStory(), devAgentRecord: false }]))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[20.1] missing-dev-agent-record")
  })

  it("accepts a Completion Notes section without a Dev Agent Record wrapper", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          devAgentRecord: false,
          bodyExtra: "## Completion Notes\n\nAgent: Fixture Agent\nDate: 2026-08-23\nFiles changed: fixture.md\nCommands/evidence: bun test (exit 0)\nRemaining gaps: none",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("FAILS a headed but incomplete Dev Agent Record with accurate missing fields", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          devAgentRecord: false,
          bodyExtra: "## Dev Agent Record\n\nAgent: Fixture Agent\nDate: 2026-08-23\n",
        },
      ]),
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[20.1] incomplete-dev-agent-record")
    expect(result.output).toContain("files changed, commands/evidence with exit code, remaining gaps")
  })

  it("does NOT require a Dev Agent Record on a story that is not done", () => {
    const result = run(
      fixture([{ key: "20.1", status: "blocked", devAgentRecord: false }])
    )
    expect(result.exitCode).toBe(0)
  })
})

describe("check-story-status-guard - story file resolution", () => {
  it("FAILS a done story that has no story file at all", () => {
    const result = run(fixture([{ ...cleanDoneStory(), omitFile: true }]))
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[20.1] missing-story-file")
  })

  it("does NOT fail a non-done story with no story file", () => {
    const result = run(fixture([{ key: "20.1", status: "planned", omitFile: true }]))
    expect(result.exitCode).toBe(0)
  })

  it("ignores a same-numbered sibling document that declares no Status field", () => {
    // This is the real `24-1-ci-benchmarks.md` vs `24-1-code-review.md` shape.
    const result = run(
      fixture([
        {
          ...cleanDoneStory("24.1"),
          decoyFiles: [
            {
              suffix: "code-review",
              content: "# Story 24.1 - Adversarial Code Review\n\n**Final Gate:** PASS\n",
            },
          ],
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("FAILS rather than guessing when two candidates both declare a Status field", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory("24.1"),
          decoyFiles: [
            {
              suffix: "other",
              content: "# Story 24.1 - other\n\n**Status:** done\n\n## Acceptance Criteria\n\n- [x] ok\n",
            },
          ],
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[24.1] ambiguous-story-file")
  })
})

describe("check-story-status-guard - review verdict claims", () => {
  it("FAILS a header claiming an approved review with no evidence artifact", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          headerExtra: "**Review:** independent Pike/Fowler review approved 2026-08-23.",
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[20.1] unverified-review-claim")
  })

  it("FAILS the exact historical shape: done status line asserting review approval", () => {
    const result = run(
      fixture([
        {
          key: "25.1",
          status: "done",
          fileStatus: "Done - independent Pike/Fowler review approved 2026-08-23",
          acceptanceCriteria: ["- [x] AC-1: shipped."],
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[25.1] unverified-review-claim")
  })

  it("FAILS a sign-off claim", () => {
    const result = run(
      fixture([
        { ...cleanDoneStory(), headerExtra: "**Sign-off:** reviewer sign-off recorded." },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("unverified-review-claim")
  })

  it("FAILS a gate PASS claim", () => {
    const result = run(
      fixture([{ ...cleanDoneStory(), headerExtra: "**Final Gate:** PASS (reviewers agreed)." }])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("unverified-review-claim")
  })

  it("FAILS when the named evidence artifact does not exist on disk", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          headerExtra: "**Review:** approved; verdict at scratchpad/pike-20-1-verdict.md.",
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("unverified-review-claim")
  })

  it("passes, with a note, when the named evidence artifact exists", () => {
    const result = run(
      fixture(
        [
          {
            ...cleanDoneStory(),
            headerExtra: "**Review:** approved; verdict at scratchpad/pike-20-1-verdict.md.",
          },
        ],
        {
          extraFiles: [
            { path: "scratchpad/pike-20-1-verdict.md", content: "# Pike verdict\n\nAPPROVE\n" },
          ],
        }
      )
    )
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("evidenced-review-claim")
    expect(result.output).toContain("does not and cannot confirm what the artifact says")
  })

  it("does not accept an unrelated existing file as review evidence", () => {
    const result = run(
      fixture(
        [
          {
            ...cleanDoneStory(),
            headerExtra: "**Review:** approved; see docs/allura/BLUEPRINT.md.",
          },
        ],
        { extraFiles: [{ path: "docs/allura/BLUEPRINT.md", content: "# Blueprint\n" }] }
      )
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("unverified-review-claim")
  })

  it("treats a retracted claim as a note, not a violation", () => {
    const result = run(
      fixture([
        {
          key: "25.1",
          status: "review",
          fileStatus: "review - 8 of 8 acceptance criteria met; independent review not yet passed",
          headerExtra:
            '> This line previously read "Done - independent Pike/Fowler review approved".\n' +
            "> That claim was false and is retracted. Neither reviewer approved.",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("retracted-or-negated-review-claim")
  })

  it("only reads the header region, not review prose lower in the file", () => {
    const result = run(
      fixture([
        {
          ...cleanDoneStory(),
          bodyExtra: "## Notes\n\nThe reviewer approved the adjacent story, not this one.",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("checks review claims on non-done stories too", () => {
    const result = run(
      fixture([
        {
          key: "20.1",
          status: "blocked",
          headerExtra: "**Review:** reviewer sign-off obtained.",
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("unverified-review-claim")
  })
})

describe("check-story-status-guard - status vocabulary", () => {
  it("does not read 'review - 8 of 8 acceptance criteria met' as done", () => {
    const result = run(
      fixture([
        {
          key: "25.1",
          status: "review - 8 of 8 acceptance criteria met; independent review not yet passed",
          acceptanceCriteria: ["- [ ] AC-1: still open."],
          devAgentRecord: false,
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("does not read 'superseded' as done", () => {
    const result = run(
      fixture([{ key: "24.11", status: "superseded", omitFile: true }])
    )
    expect(result.exitCode).toBe(0)
  })

  it("does not read 'changes-requested' as done", () => {
    const result = run(
      fixture([
        { key: "24.4", status: "changes-requested", acceptanceCriteria: ["- [ ] AC-1"] },
      ])
    )
    expect(result.exitCode).toBe(0)
  })

  it("reads 'Done' with different casing and trailing prose as done", () => {
    const result = run(
      fixture([
        {
          key: "19.5",
          status: "DONE (2026-07-12, Woz)",
          acceptanceCriteria: ["- [ ] AC-1: still open."],
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[19.5] unchecked-acceptance-criterion")
  })
})

describe("check-story-status-guard - malformed input exits 2", () => {
  it("exits 2 when sprint-status.yaml is absent", () => {
    const result = run(fixture([cleanDoneStory()], { omitSprintStatus: true }))
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain("FATAL")
  })

  it("exits 2 on unparseable YAML", () => {
    const result = run(
      fixture([cleanDoneStory()], { sprintOverride: "epic_20:\n  stories:\n   - key: [unclosed\n" })
    )
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain("FATAL")
  })

  it("exits 2 when there is no epic block", () => {
    const result = run(
      fixture([cleanDoneStory()], { sprintOverride: 'last_updated: "2026-08-23"\nowner: brooks\n' })
    )
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('no "epic_NN:" blocks')
  })

  it("exits 2 when stories is not a list", () => {
    const result = run(
      fixture([cleanDoneStory()], { sprintOverride: 'epic_20:\n  stories: "none"\n' })
    )
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain("is not a list")
  })

  it("exits 2 when a story entry has no status field", () => {
    const result = run(
      fixture([cleanDoneStory()], {
        sprintOverride: 'epic_20:\n  stories:\n    - key: "20.1"\n      title: "No status"\n',
      })
    )
    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('has no string "status" field')
  })

  it("exits 2 rather than 1 even when a real violation is also present", () => {
    // Malformed input must never be reported as a clean pass OR as a policy
    // violation: the guard has not actually inspected anything yet.
    const result = run(
      fixture(
        [
          {
            key: "20.1",
            status: "done",
            acceptanceCriteria: ["- [ ] AC-1: open."],
            devAgentRecord: false,
          },
        ],
        {
          sprintOverride:
            'epic_20:\n  stories:\n    - key: "20.1"\n      title: "Missing status"\n',
        }
      )
    )
    expect(result.exitCode).toBe(2)
  })
})

describe("check-story-status-guard - the pathology it was built for", () => {
  it("catches all four signals of the 2026-08-23 false-done at once", () => {
    const result = run(
      fixture([
        {
          key: "25.1",
          status: "done",
          fileStatus: "Done - independent Pike/Fowler review approved 2026-08-23",
          acceptanceCriteria: [
            "- [x] AC-1: scope statement written.",
            "- [ ] AC-6: the dangling reference is resolved.",
          ],
          devAgentRecord: false,
          bodyExtra: "## Notes\n\nAC-6 is NOT COMPLETE. See Completion Notes AC-6.",
        },
      ])
    )
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("[25.1] unchecked-acceptance-criterion")
    expect(result.output).toContain("[25.1] incompleteness-marker")
    expect(result.output).toContain("[25.1] missing-dev-agent-record")
    expect(result.output).toContain("[25.1] unverified-review-claim")
    expect(result.output).toContain("4 status/evidence violation(s)")
  })

  it("passes the same story once the status is moved back to review", () => {
    const result = run(
      fixture([
        {
          key: "25.1",
          status: "review",
          fileStatus: "review - independent review not yet passed",
          acceptanceCriteria: [
            "- [x] AC-1: scope statement written.",
            "- [ ] AC-6: the dangling reference is resolved.",
          ],
          devAgentRecord: false,
          bodyExtra: "## Notes\n\nAC-6 is NOT COMPLETE. See Completion Notes AC-6.",
        },
      ])
    )
    expect(result.exitCode).toBe(0)
  })
})
