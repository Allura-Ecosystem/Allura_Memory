import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const script = path.resolve("scripts/validate-adaptive-delivery-status.ts")
const canonicalNames = [
  "BLUEPRINT", "DESIGN-ALLURA", "SOLUTION-ARCHITECTURE",
  "REQUIREMENTS-MATRIX", "RISKS-AND-DECISIONS", "DATA-DICTIONARY",
]
let fixture: string

function write(relativePath: string, content = "") {
  const destination = path.join(fixture, relativePath)
  mkdirSync(path.dirname(destination), { recursive: true })
  writeFileSync(destination, content)
}

function append(relativePath: string, content: string) {
  write(relativePath, `${readFileSync(path.join(fixture, relativePath), "utf8")}\n${content}`)
}

function run(cwd: string) {
  return spawnSync("bun", [script], { cwd, encoding: "utf8" })
}

function expectFailure(message: string) {
  const result = run(fixture)
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(message)
  expect(result.stdout).not.toContain("validation passed")
  return result
}

beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), "adaptive-status-"))
  mkdirSync(path.join(fixture, ".opencode/commands"), { recursive: true })
  mkdirSync(path.join(fixture, "docs/archive/bmad-legacy/retired-2026-10-15"), { recursive: true })
  write("guidelines/AI-GUIDELINES.md", [
    "## 10. Allura Adaptive Delivery",
    "read-only historical lineage",
    "Notion syncs and any change to `Done` or `Approved` require action-specific human approval",
  ].join("\n"))
  write(".opencode/context/core/system/documentation-authority.md", "never current planning or status authority")
  for (const name of canonicalNames) write(`docs/allura/${name}.md`)
  write("docs/allura/BLUEPRINT.md", [
    "| F43 | Notion is the human source of truth | Native Kanban is planned |",
    "## Epic 30/31 Planning and Readiness",
    "Planning proposals remain blocked; readiness needs review evidence.",
    "| Epic 30 | Workspace proposal | Acceptance pending |",
    "| Epic 31 | Connected clients proposal | Acceptance pending |",
  ].join("\n"))
  write("docs/allura/DESIGN-ALLURA.md", "| F43 | Notion owns planning/status authority | Native board needs an approved migration |")
  write("docs/allura/REQUIREMENTS-MATRIX.md", Array.from({ length: 6 }, (_, i) =>
    `| REQ-DASH-00${i + 4} | Dashboard requirement | F43 | Planned; no source evidence yet |`
  ).join("\n"))
})

afterEach(() => rmSync(fixture, { recursive: true, force: true }))

describe("Adaptive Delivery status authority validator", () => {
  it("passes against the live repository contract", () => {
    const result = run(process.cwd())
    expect(result.error).toBeUndefined()
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Adaptive Delivery status authority validation passed.")
  })

  it("accepts a concise contract with independently worded authority statements", () => {
    const result = run(fixture)
    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
  })

  it.each(["BLUEPRINT", "DESIGN-ALLURA"])("requires the F43 row itself to name Notion authority in %s", name => {
    write(`docs/allura/${name}.md`, "Notion is the human source of truth.\n| F43 | External boards are optional adapters |")
    expectFailure(`${name}: F43 must identify Notion`)
  })

  it("checks every F43 row instead of accepting one correct row", () => {
    append("docs/allura/BLUEPRINT.md", "| F43 | Native Allura Kanban is the default planning source of truth | Notion sync adapter |")
    expectFailure("BLUEPRINT: F43 must identify Notion")
  })

  it("rejects a negated Notion authority claim", () => {
    write("docs/allura/DESIGN-ALLURA.md", "| F43 | Notion is not the human status authority |")
    expectFailure("DESIGN-ALLURA: F43 must identify Notion")
  })

  it.each(["BLUEPRINT", "DESIGN-ALLURA"])("rejects competing current authority in a valid Notion F43 row in %s", name => {
    append(`docs/allura/${name}.md`, "| F43 | Notion is planning authority | Native Kanban is current status authority |")
    expectFailure("native board cannot be the default or current planning/status authority")
  })

  it("rejects a missing F43 row despite an authority statement elsewhere", () => {
    write("docs/allura/DESIGN-ALLURA.md", "Notion is the human source of truth.")
    expectFailure("DESIGN-ALLURA: F43 requirement row is missing")
  })

  it.each(canonicalNames)("rejects native default authority outside F43 in %s", name => {
    append(`docs/allura/${name}.md`, "Native Allura Kanban is the default planning source of truth.")
    expect(expectFailure(`${name}:`).stderr).toContain("native board cannot be the default")
  })

  it("rejects contradictory native default component rows", () => {
    append("docs/allura/BLUEPRINT.md", "| Native Allura Kanban | Default planning and execution board | Source of truth by default |")
    expectFailure("native board cannot be the default")
  })

  it("does not borrow Epic 31 evidence from outside the planning section", () => {
    write("docs/allura/BLUEPRINT.md", [
      "| F43 | Notion is the human source of truth |",
      "## Epic 30/31 Planning and Readiness",
      "Planning proposals are blocked pending readiness evidence.",
      "| Epic 30 | Workspace |",
      "## Historical material",
      "| Epic 31 | Archived implementation |",
    ].join("\n"))
    expectFailure("Epic 31 planning proposal row is missing")
  })

  it("rejects a planning section that presents readiness as approved", () => {
    write("docs/allura/BLUEPRINT.md", [
      "| F43 | Notion is the human source of truth |",
      "## Epic 30/31 Planning and Readiness",
      "Planning proposals are approved and readiness is complete.",
      "| Epic 30 | Ready |",
      "| Epic 31 | Ready |",
    ].join("\n"))
    expectFailure("blocked planning/readiness section is missing")
  })

  it.each([
    "readiness is approved and complete",
    "**Planning disposition:** approved",
    "Readiness: complete",
    "Board status: Done",
  ])("rejects contradictory Epic 30/31 metadata despite blocked planning: %s", claim => {
    append("docs/allura/BLUEPRINT.md", `Planning proposals remain blocked; ${claim}.`)
    expectFailure("Epic 30/31 planning/readiness metadata contradicts blocked proposals")
  })

  it("accepts explicit denials of native authority and readiness approval", () => {
    append("docs/allura/BLUEPRINT.md", "Native Kanban is not current status authority. Readiness is not approved.")
    expect(run(fixture).status).toBe(0)
  })

  it.each([4, 5, 6, 7, 8, 9])("rejects nonexistent route evidence in REQ-DASH-00%s", number => {
    append("docs/allura/REQUIREMENTS-MATRIX.md", `| REQ-DASH-00${number} | Dashboard | F43 | \`src/app/dashboard/missing/page.tsx\` |`)
    expectFailure(`REQ-DASH-00${number} cites missing source evidence`)
  })

  it("accepts existing source files, including dynamic route segments", () => {
    write("src/app/api/members/[userId]/route.ts")
    write("src/app/dashboard/graph/page.tsx")
    append("docs/allura/REQUIREMENTS-MATRIX.md", "| REQ-DASH-009 | Members | F43 | `src/app/api/members/[userId]/route.ts` · `src/app/dashboard/graph/page.tsx` |")
    expect(run(fixture).status).toBe(0)
  })

  it.each(["src/app/dashboard/graph/", "src/app/dashboard/graph/page.tsx"])("rejects a directory cited as source-file evidence: %s", citation => {
    mkdirSync(path.join(fixture, citation), { recursive: true })
    append("docs/allura/REQUIREMENTS-MATRIX.md", `| REQ-DASH-006 | Graph | F43 | \`${citation}\` |`)
    expect(expectFailure("REQ-DASH-006 cites missing source evidence").stderr).toContain("expected a regular file")
  })

  it("validates source evidence cited as a Markdown link", () => {
    append("docs/allura/REQUIREMENTS-MATRIX.md", "| REQ-DASH-004 | Governance | F43 | [route](src/app/dashboard/governance/page.tsx) |")
    expectFailure("REQ-DASH-004 cites missing source evidence")
  })

  it("validates evidence in a Markdown row without a trailing pipe", () => {
    append("docs/allura/REQUIREMENTS-MATRIX.md", "| REQ-DASH-007 | Sources | F43 | `src/app/dashboard/missing/page.tsx`")
    expectFailure("REQ-DASH-007 cites missing source evidence")
  })

  it.each(["_bmad", "_bmad_output", ".bmad-loop"])("still rejects the retired active root %s", retiredRoot => {
    mkdirSync(path.join(fixture, retiredRoot))
    expectFailure(`retired active root still exists: ${retiredRoot}`)
  })

  it("still rejects retired active commands", () => {
    write(".opencode/commands/bmad-dev.md")
    expectFailure("retired command alias remains active")
  })

  it("reports missing canonical documents as validation failures", () => {
    rmSync(path.join(fixture, "docs/allura/DATA-DICTIONARY.md"))
    expectFailure("required document is missing or unreadable: docs/allura/DATA-DICTIONARY.md")
  })
})
