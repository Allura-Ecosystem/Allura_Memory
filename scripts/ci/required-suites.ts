import { isAbsolute, relative, resolve } from "node:path"

export interface RequiredSuite {
  file: string
  requiredAssertions: string[]
}

export interface RequiredLane {
  config: string
  suites: RequiredSuite[]
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function repositoryPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !isAbsolute(value)
    && !value.includes("\\") && value.split("/").every((part) => part !== ".." && part !== "." && part !== "")
}

/** Parse an explicit inventory, never infer required coverage from passing output. */
export function readRequiredLane(manifest: unknown, lane: string): RequiredLane {
  const root = object(manifest)
  const selected = object(object(root?.lanes)?.[lane])
  if (root?.version !== 1 || !selected || !repositoryPath(selected.config)
    || !Array.isArray(selected.suites) || selected.suites.length === 0) {
    throw new Error(`required-suite manifest has no valid nonempty lane ${lane}`)
  }
  const paths = new Set<string>()
  const suites = selected.suites.map((entry): RequiredSuite => {
    const suite = object(entry)
    if (!suite || !repositoryPath(suite.file) || paths.has(suite.file)
      || !Array.isArray(suite.requiredAssertions) || suite.requiredAssertions.length === 0
      || suite.requiredAssertions.some((name) => typeof name !== "string" || !name.trim())
      || new Set(suite.requiredAssertions).size !== suite.requiredAssertions.length) {
      throw new Error("required-suite manifest contains an invalid or duplicate file/assertion")
    }
    paths.add(suite.file)
    return { file: suite.file, requiredAssertions: suite.requiredAssertions as string[] }
  })
  return { config: selected.config, suites }
}

/** Vitest 2.1.9: todo is separate from pending; suite counts include nested describes. */
export function validateRequiredSuiteReport(
  report: unknown,
  suites: readonly RequiredSuite[],
  repositoryRoot: string,
  startedAt: number,
  finishedAt: number,
): string | null {
  const data = object(report)
  if (!data || data.success !== true || data.numFailedTestSuites !== 0
    || typeof data.startTime !== "number" || data.startTime < startedAt || data.startTime > finishedAt
    || !Array.isArray(data.testResults) || data.testResults.length === 0) {
    return "required-suite report is malformed, unsuccessful, or stale"
  }
  const counts = { passed: 0, failed: 0, pending: 0, todo: 0 }
  const files = new Map<string, Record<string, unknown>[]>()
  for (const entry of data.testResults) {
    const file = object(entry)
    if (!file || typeof file.name !== "string" || !isAbsolute(file.name)
      || (file.status !== "passed" && file.status !== "failed") || !Array.isArray(file.assertionResults)) {
      return "required-suite report contains a malformed file"
    }
    const name = relative(repositoryRoot, resolve(file.name)).replaceAll("\\", "/")
    if (!repositoryPath(name) || files.has(name)) return "required-suite report contains duplicate or outside-root files"
    const assertions: Record<string, unknown>[] = []
    for (const result of file.assertionResults) {
      const assertion = object(result)
      if (!assertion || typeof assertion.fullName !== "string" || !assertion.fullName.trim()) {
        return `malformed assertion in ${name}`
      }
      switch (assertion.status) {
        case "passed": counts.passed++; break
        case "failed": counts.failed++; break
        case "pending": case "skipped": counts.pending++; break
        case "todo": counts.todo++; break
        default: return `unknown assertion status in ${name}`
      }
      assertions.push(assertion)
    }
    if (file.status !== "passed") return `test file failed: ${name}`
    files.set(name, assertions)
  }
  if (data.numPassedTests !== counts.passed || data.numFailedTests !== counts.failed
    || data.numPendingTests !== counts.pending || data.numTodoTests !== counts.todo
    || data.numTotalTests !== counts.passed + counts.failed + counts.pending + counts.todo || counts.failed > 0) {
    return "required-suite report counters disagree with assertion results"
  }
  for (const required of suites) {
    const assertions = files.get(required.file)
    if (!assertions?.length) return `required test file missing or empty: ${required.file}`
    const names = assertions.map((entry) => entry.fullName)
    if (new Set(names).size !== names.length) return `duplicate assertion identity in ${required.file}`
    if (assertions.some((entry) => entry.status !== "passed")) return `required test file has unexecuted or failed assertions: ${required.file}`
    const missing = required.requiredAssertions.filter((name) => !names.includes(name))
    if (missing.length > 0) return `required assertions missing in ${required.file}: ${missing.join(", ")}`
  }
  return null
}
