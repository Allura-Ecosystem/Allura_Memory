import { describe, expect, it } from "vitest"

import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"


function run(command: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; stdout?: string; stderr?: string }) {
  const result = spawnSync(command[0], command.slice(1), { cwd: options.cwd, env: options.env })
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr }
}

const script = "scripts/ci/lint-changed.sh"
const scriptPath = resolve(process.cwd(), script)

describe("changed-file ESLint ratchet", () => {
  it("accepts an explicit valid base when no committed JS/TS files changed", () => {
    const result = run(["bash", script, `--base=${process.env.GITHUB_SHA ?? "HEAD"}`], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("No changed JavaScript or TypeScript files")
  })

  it("fails closed when the base commit is invalid", () => {
    const result = run(["bash", script, "--base=not-a-commit"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(65)
    expect(result.stderr.toString()).toContain("Base commit is not available or invalid")
  })

  it("fails closed when no explicit base is provided", () => {
    const env = { ...process.env }
    delete env.CI_LINT_BASE_SHA
    const result = run(["bash", script], { stdout: "pipe", stderr: "pipe", env })
    expect(result.exitCode).toBe(64)
    expect(result.stderr.toString()).toContain("A base commit is required")
  })

  it("returns non-zero when a changed file introduces an ESLint error", () => {
    const repository = mkdtempSync(join(tmpdir(), "allura-lint-ratchet-"))
    const runGit = (args: string[]) => run(["git", ...args], {
      cwd: repository,
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      expect(runGit(["init", "--quiet"]).exitCode).toBe(0)
      expect(runGit(["config", "user.email", "ci@example.invalid"]).exitCode).toBe(0)
      expect(runGit(["config", "user.name", "CI Test"]).exitCode).toBe(0)
      writeFileSync(join(repository, "README.md"), "baseline\n", "utf8")
      expect(runGit(["add", "README.md"]).exitCode).toBe(0)
      expect(runGit(["commit", "--quiet", "-m", "baseline"]).exitCode).toBe(0)
      const base = runGit(["rev-parse", "HEAD"]).stdout.toString().trim()
      symlinkSync(resolve(process.cwd(), "node_modules"), join(repository, "node_modules"), "dir")

      writeFileSync(
        join(repository, "eslint.config.mjs"),
        'export default [{ files: ["**/*.js"], rules: { "no-undef": "error" } }]\n',
        "utf8",
      )
      writeFileSync(join(repository, "bad.js"), "missingGlobal()\n", "utf8")
      expect(runGit(["add", "eslint.config.mjs", "bad.js"]).exitCode).toBe(0)
      expect(runGit(["commit", "--quiet", "-m", "introduce lint error"]).exitCode).toBe(0)
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "test",
        HOME: process.env.HOME,
        PATH: `${resolve(process.cwd(), "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
      }
      const reportPath = join(repository, "lint-report.json")
      const result = run(["bash", scriptPath, `--base=${base}`, `--report=${reportPath}`], {
        cwd: repository,
        stdout: "pipe",
        stderr: "pipe",
        env,
      })
      expect(result.exitCode).not.toBe(0)
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as Array<{ messages: Array<{ ruleId: string }> }>
      expect(report.flatMap((file) => file.messages)).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "no-undef" })]))
      writeFileSync(join(repository, "bad.js"), "const defined = 1; void defined;\n", "utf8")
      const repaired = run(["bash", scriptPath, `--base=${base}`, `--report=${reportPath}`], { cwd: repository, env })
      expect(repaired.exitCode).toBe(0)
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })
})
