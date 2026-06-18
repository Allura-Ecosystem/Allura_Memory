/**
 * Tests for the GIT-EXEC-001 choke point (src/lib/git/exec.ts).
 *
 * We mock node:child_process so no real git process is spawned. The
 * `assertCwdOutsideGitDir` guard is also exercised directly since it is pure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import path from "node:path"

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from "node:child_process"
import { assertCwdOutsideGitDir, gitExec } from "./exec"

const mockExecFileSync = vi.mocked(execFileSync)

/** Make rev-parse return a real work tree (gitdir != worktree). */
function stubRealWorkTree(): void {
  mockExecFileSync.mockImplementation((_cmd, args) => {
    const a = args as string[]
    if (a.includes("--git-dir")) return `${path.sep}repo${path.sep}.git\n`
    if (a.includes("--show-toplevel")) return `${path.sep}repo\n`
    return "stdout\n"
  })
}

describe("assertCwdOutsideGitDir", () => {
  it("throws when cwd is inside a .git directory", () => {
    const inside = path.join(path.sep, "repo", ".git", "hooks")
    expect(() => assertCwdOutsideGitDir(inside)).toThrow(/\.git directory/)
  })

  it("throws when cwd ends with .git", () => {
    const endsWithGit = path.join(path.sep, "repo", ".git")
    expect(() => assertCwdOutsideGitDir(endsWithGit)).toThrow(/\.git directory/)
  })

  it("returns the resolved absolute path for a normal repo cwd", () => {
    const normal = path.join(path.sep, "repo", "src")
    expect(assertCwdOutsideGitDir(normal)).toBe(normal)
  })
})

describe("gitExec", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("throws for a cwd inside .git before spawning git", () => {
    const inside = path.join(path.sep, "repo", ".git")
    expect(() => gitExec(["status"], { cwd: inside })).toThrow(/\.git/)
    // Invariant A short-circuits before any git process runs.
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it("does not throw on the invariant checks for a normal repo cwd", () => {
    stubRealWorkTree()
    const cwd = path.join(path.sep, "repo")
    expect(() => gitExec(["rev-parse", "HEAD"], { cwd })).not.toThrow()
  })

  it("emits the GIT_EXEC_WRAPPER token to stderr", () => {
    stubRealWorkTree()
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true)
    const cwd = path.join(path.sep, "repo")

    gitExec(["rev-parse", "HEAD"], { cwd })

    const emitted = writeSpy.mock.calls.map((c) => String(c[0])).join("")
    expect(emitted).toContain("GIT_EXEC_WRAPPER")
    expect(emitted).toContain("git rev-parse HEAD")
  })

  it("refuses when gitdir equals worktree (not a real work tree)", () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const a = args as string[]
      if (a.includes("--git-dir")) return `${path.sep}repo\n`
      if (a.includes("--show-toplevel")) return `${path.sep}repo\n`
      return ""
    })
    const cwd = path.join(path.sep, "repo")
    expect(() => gitExec(["status"], { cwd })).toThrow(/gitdir equals worktree/)
  })

  it("refuses when --show-toplevel errors (not inside a work tree)", () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const a = args as string[]
      if (a.includes("--git-dir")) return `${path.sep}repo${path.sep}.git\n`
      if (a.includes("--show-toplevel")) throw new Error("not a work tree")
      return ""
    })
    const cwd = path.join(path.sep, "repo")
    expect(() => gitExec(["status"], { cwd })).toThrow(/not inside a work tree/)
  })

  it("returns git stdout on success", () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      const a = args as string[]
      if (a.includes("--git-dir")) return `${path.sep}repo${path.sep}.git\n`
      if (a.includes("--show-toplevel")) return `${path.sep}repo\n`
      return "deadbeef\n"
    })
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const cwd = path.join(path.sep, "repo")
    expect(gitExec(["rev-parse", "HEAD"], { cwd })).toBe("deadbeef\n")
  })
})
