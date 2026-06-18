/**
 * Git Execution Choke Point
 *
 * GIT-EXEC-001: "one enforcement boundary over scattered call-site patches".
 *
 * Every agent that shells out to git MUST route through {@link gitExec} so that
 * safety invariants are enforced at a single boundary rather than at scattered
 * call sites. Invoking git directly (execSync/execFileSync) elsewhere defeats
 * the guardrail.
 *
 * Invariants enforced BEFORE any git process runs:
 *   A. cwd must not live inside a `.git` directory.
 *   B. the target repo's gitdir must not equal its worktree (i.e. we must be in
 *      a real work tree, not a bare/`.git` checkout).
 */

import { execFileSync } from "node:child_process"
import path from "node:path"

const WRAPPER_TOKEN = "GIT_EXEC_WRAPPER"

export interface GitExecOptions {
  /** Working directory for the git process. Defaults to `process.cwd()`. */
  cwd?: string
  /** Max stdout buffer in bytes (forwarded to execFileSync). */
  maxBuffer?: number
}

/**
 * Invariant A — refuse a cwd that sits inside a `.git` directory.
 *
 * Exported separately so it can be unit-tested without spawning git.
 * Returns the resolved absolute path on success; throws otherwise.
 */
export function assertCwdOutsideGitDir(cwd?: string): string {
  const abs = path.resolve(cwd ?? process.cwd())
  const sep = path.sep
  const insideGit = abs.includes(`${sep}.git${sep}`) || abs.endsWith(`${sep}.git`)
  if (insideGit) {
    throw new Error(
      `[${WRAPPER_TOKEN}] refusing git: cwd is inside a .git directory: ${abs}`,
    )
  }
  return abs
}

/**
 * Invariant B — refuse if the gitdir equals the worktree (not a real work tree).
 *
 * Runs `git rev-parse --git-dir` and `git rev-parse --show-toplevel` against the
 * already-validated absolute cwd. Throws if they resolve to the same path, or if
 * `--show-toplevel` errors (meaning we are not inside a work tree).
 */
function assertRealWorkTree(absCwd: string): void {
  let gitDir: string
  let topLevel: string
  try {
    gitDir = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: absCwd,
      encoding: "utf8",
    }).trim()
  } catch (err) {
    throw new Error(
      `[${WRAPPER_TOKEN}] refusing git: cannot resolve --git-dir in ${absCwd}: ${
        (err as Error).message
      }`,
    )
  }

  try {
    topLevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: absCwd,
      encoding: "utf8",
    }).trim()
  } catch (err) {
    throw new Error(
      `[${WRAPPER_TOKEN}] refusing git: not inside a work tree (--show-toplevel failed) in ${absCwd}: ${
        (err as Error).message
      }`,
    )
  }

  // Resolve both to absolute form so the comparison is robust regardless of
  // whether git returned a relative gitdir (e.g. ".git") or an absolute one.
  const absGitDir = path.resolve(absCwd, gitDir)
  const absTopLevel = path.resolve(absCwd, topLevel)
  if (absGitDir === absTopLevel) {
    throw new Error(
      `[${WRAPPER_TOKEN}] refusing git: gitdir equals worktree (${absTopLevel})`,
    )
  }
}

/**
 * Run a git command through the enforcement boundary.
 *
 * @param args git arguments (no shell — passed directly to git)
 * @param opts.cwd working directory (defaults to process.cwd())
 * @returns git stdout as a string
 */
export function gitExec(args: string[], opts?: GitExecOptions): string {
  const absCwd = assertCwdOutsideGitDir(opts?.cwd)
  assertRealWorkTree(absCwd)

  // Stamped audit line so the choke point is observable in logs.
  process.stderr.write(
    `[${WRAPPER_TOKEN}] git ${args.join(" ")} cwd=${absCwd}\n`,
  )

  return execFileSync("git", args, {
    cwd: absCwd,
    encoding: "utf8",
    ...(opts?.maxBuffer !== undefined ? { maxBuffer: opts.maxBuffer } : {}),
  })
}
