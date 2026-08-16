import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

const script = "scripts/ci/lint-changed.sh"
const scriptPath = resolve(process.cwd(), script)

describe("changed-file ESLint ratchet", () => {
  it("accepts an explicit valid base when no committed JS/TS files changed", () => {
    const result = Bun.spawnSync(["bash", script, `--base=${process.env.GITHUB_SHA ?? "HEAD"}`], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toContain("No changed JavaScript or TypeScript files")
  })

  it("fails closed when the base commit is invalid", () => {
    const result = Bun.spawnSync(["bash", script, "--base=not-a-commit"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(65)
    expect(result.stderr.toString()).toContain("Base commit is not available or invalid")
  })

  it("fails closed when no explicit base is provided", () => {
    const env = { ...process.env }
    delete env.CI_LINT_BASE_SHA
    const result = Bun.spawnSync(["bash", script], { stdout: "pipe", stderr: "pipe", env })
    expect(result.exitCode).toBe(64)
    expect(result.stderr.toString()).toContain("A base commit is required")
  })

  it("returns non-zero when a changed file introduces an ESLint error", () => {
    const repository = mkdtempSync(join(tmpdir(), "allura-lint-ratchet-"))
    const runGit = (args: string[]) => Bun.spawnSync(["git", ...args], {
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
      const env = {
        ...process.env,
        PATH: `${resolve(process.cwd(), "node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
      }
      const result = Bun.spawnSync(["bash", scriptPath, `--base=${base}`], {
        cwd: repository,
        stdout: "pipe",
        stderr: "pipe",
        env,
      })
      expect(result.exitCode).not.toBe(0)
      expect(`${result.stdout.toString()}${result.stderr.toString()}`).toContain("no-undef")
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })
})
