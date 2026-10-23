import { describe, expect, it } from "vitest"

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"


import { parseArgs, recordCommand } from "./collect-evidence"
import { readRequiredLane, validateRequiredSuiteReport } from "./required-suites"

const required = [{ file: "src/critical.test.ts", requiredAssertions: ["scope denies foreign actor"] }]

function report(file = resolve(required[0].file)) {
  return {
    success: true, startTime: 100, numFailedTestSuites: 0,
    numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ name: file, status: "passed", assertionResults: [{ fullName: required[0].requiredAssertions[0], status: "passed" }] }],
  }
}

describe("critical suite execution contract", () => {
  it("accepts execution of exact required files and assertions", () => {
    expect(validateRequiredSuiteReport(report(), required, process.cwd(), 90, 110)).toBeNull()
  })

  it("rejects a missing critical file while an unrelated file passes", () => {
    expect(validateRequiredSuiteReport(report(resolve("src/other.test.ts")), required, process.cwd(), 90, 110)).toContain("missing or empty")
  })

  it.each(["skipped", "pending", "todo", "failed", "unknown"])("rejects a required %s assertion", (status) => {
    const value = report()
    value.testResults[0].assertionResults[0].status = status
    value.numPassedTests = 0
    if (status === "skipped" || status === "pending") value.numPendingTests = 1
    if (status === "todo") value.numTodoTests = 1
    if (status === "failed") value.numFailedTests = 1
    expect(validateRequiredSuiteReport(value, required, process.cwd(), 90, 110)).not.toBeNull()
  })

  it("rejects a removed required assertion despite an unrelated passing assertion", () => {
    const value = report()
    value.testResults[0].assertionResults[0].fullName = "unrelated"
    expect(validateRequiredSuiteReport(value, required, process.cwd(), 90, 110)).toContain("required assertions missing")
  })

  it.each([0, 120])("rejects report timestamp %s outside this command's execution", (timestamp) => {
    const value = report()
    value.startTime = timestamp
    expect(validateRequiredSuiteReport(value, required, process.cwd(), 90, 110)).toContain("stale")
  })

  it("rejects file import failure even with positive aggregate passing counts", () => {
    const value = report()
    value.numFailedTestSuites = 1
    expect(validateRequiredSuiteReport(value, required, process.cwd(), 90, 110)).toContain("unsuccessful")
  })

  it("rejects duplicate and outside-root files", () => {
    const value = report()
    value.testResults.push(value.testResults[0])
    expect(validateRequiredSuiteReport(value, required, process.cwd(), 90, 110)).toContain("duplicate")
    expect(validateRequiredSuiteReport(report("/outside.test.ts"), required, process.cwd(), 90, 110)).toContain("outside-root")
  })

  it("rejects empty files, duplicate assertion identities, malformed assertions and inconsistent totals", () => {
    const empty = report()
    empty.testResults[0].assertionResults = []
    empty.numTotalTests = empty.numPassedTests = 0
    expect(validateRequiredSuiteReport(empty, required, process.cwd(), 90, 110)).toContain("missing or empty")
    const duplicate = report()
    duplicate.testResults[0].assertionResults.push(duplicate.testResults[0].assertionResults[0])
    duplicate.numTotalTests = duplicate.numPassedTests = 2
    expect(validateRequiredSuiteReport(duplicate, required, process.cwd(), 90, 110)).toContain("duplicate assertion")
    const invalid = report()
    invalid.testResults[0].assertionResults[0].fullName = ""
    expect(validateRequiredSuiteReport(invalid, required, process.cwd(), 90, 110)).toContain("malformed")
    expect(validateRequiredSuiteReport({ ...report(), numTotalTests: 7 }, required, process.cwd(), 90, 110)).toContain("counters")
  })

  it("permits separately reported noncritical skips and todos without claiming critical coverage from them", () => {
    const value = report()
    value.testResults.push({ name: resolve("src/optional.test.ts"), status: "passed", assertionResults: [
      { fullName: "optional skip", status: "skipped" }, { fullName: "optional todo", status: "todo" },
    ] })
    value.numTotalTests = 3
    value.numPendingTests = value.numTodoTests = 1
    expect(validateRequiredSuiteReport(value, required, process.cwd(), 90, 110)).toBeNull()
  })

  it("requires an explicit, nonempty, contained, unique manifest", () => {
    const manifest = { version: 1, lanes: { unit: { config: "vitest.config.unit.ts", suites: required } } }
    expect(readRequiredLane(manifest, "unit").suites).toEqual(required)
    expect(() => readRequiredLane(manifest, "missing")).toThrow("nonempty lane")
    for (const suites of [[], [required[0], required[0]], [{ ...required[0], file: "../outside.ts" }], [{ ...required[0], requiredAssertions: [] }]]) {
      expect(() => readRequiredLane({ version: 1, lanes: { unit: { config: "vitest.config.unit.ts", suites } } }, "unit")).toThrow()
    }
  })
})

describe("collector required-suite process boundary", () => {
  it.each(["valid", "missing-source", "missing-file", "skipped", "todo", "stale", "existing-report", "malformed", "failed-child", "changed-source", "changed-manifest"])(
    "records the actual %s outcome without accepting stale or missing execution", async (mode) => {
      const root = `artifacts/ci/required-suite-test-${randomUUID()}`
      const output = `${root}/tests.json`
      const source = `${root}/required.test.ts`
      try {
        await mkdir(root, { recursive: true })
        if (mode !== "missing-source") await writeFile(source, "// synthetic report-validation fixture; never executed\n")
        const manifest = { version: 1, lanes: { unit: { config: "vitest.config.unit.ts", suites: [{ file: source, requiredAssertions: required[0].requiredAssertions }] } } }
        const manifestPath = `${root}/required.json`
        await writeFile(manifestPath, JSON.stringify(manifest))
        const value = report(resolve(mode === "missing-file" ? `${root}/other.test.ts` : source))
        if (mode === "skipped" || mode === "todo") {
          value.numPassedTests = 0
          value.numPendingTests = mode === "skipped" ? 1 : 0
          value.numTodoTests = mode === "todo" ? 1 : 0
          value.testResults[0].assertionResults[0].status = mode
        }
        if (mode === "existing-report") await writeFile(output, JSON.stringify(value))
        const script = `const fs=require('node:fs'); const report=${JSON.stringify(value)}; report.startTime=${mode === "stale" ? "0" : "Date.now()"}; fs.writeFileSync(${JSON.stringify(output)}, ${mode === "malformed" ? "'{broken'" : "JSON.stringify(report)"}); ${mode === "changed-source" ? `fs.appendFileSync(${JSON.stringify(source)}, 'changed');` : ""} ${mode === "changed-manifest" ? `fs.appendFileSync(${JSON.stringify(manifestPath)}, ' ');` : ""} process.exit(${mode === "failed-child" ? 7 : 0});`
        const exit = await recordCommand(parseArgs([
          "run", "--lane=unit", "--name=critical", `--artifact-dir=${root}`,
          `--artifact=${output}`, `--require-vitest-results=${output}`, `--required-suites=${manifestPath}`,
          "--", "node", "-e", script,
        ]))
        expect(exit).toBe(mode === "valid" ? 0 : mode === "failed-child" ? 7 : 66)
        const evidence = JSON.parse(await readFile(`${root}/critical-required-suites.json`, "utf8"))
        expect(evidence.status).toBe(mode === "valid" ? "passed" : "failed")
        if (mode === "valid") {
          expect(evidence.source.commit_sha).toMatch(/^[0-9a-f]{40}$/)
          expect(evidence.manifest_sha256).toMatch(/^[0-9a-f]{64}$/)
          expect(evidence.report_sha256).toMatch(/^[0-9a-f]{64}$/)
          const priorEvidence = await readFile(`${root}/critical-required-suites.json`, "utf8")
          const priorFragment = await readFile(`${root}/evidence-fragment.json`, "utf8")
          const priorReport = await readFile(output, "utf8")
          await expect(recordCommand(parseArgs([
            "run", "--lane=unit", "--name=critical", `--artifact-dir=${root}`,
            `--require-vitest-results=${output}`, `--required-suites=${manifestPath}`,
            "--", "node", "-e", `require('node:fs').writeFileSync(${JSON.stringify(output)}, 'overwritten')`,
          ]))).rejects.toThrow("duplicate command")
          expect(await readFile(`${root}/critical-required-suites.json`, "utf8")).toBe(priorEvidence)
          expect(await readFile(`${root}/evidence-fragment.json`, "utf8")).toBe(priorFragment)
          expect(await readFile(output, "utf8")).toBe(priorReport)
        }
        if (mode === "missing-source") expect(evidence.errors.join(" ")).toContain("preflight")
        if (mode === "existing-report") expect(evidence.errors.join(" ")).toContain("already exists")
        const fragment = JSON.parse(await readFile(`${root}/evidence-fragment.json`, "utf8"))
        expect(fragment.status).toBe(mode === "valid" ? "passed" : "failed")
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )
})
