import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

// Task B (GIT-EXEC-001): assertSafeGitCwd was removed from ralph-loop.ts and
// replaced with the canonical assertCwdOutsideGitDir from src/lib/git/exec.ts.
// These tests validate the canonical implementation instead.
import { assertCwdOutsideGitDir } from "../../src/lib/git/exec";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertCwdOutsideGitDir (canonical GIT-EXEC-001 guard)", () => {
  it("throws when cwd resolves inside a .git directory (modules submodule path)", () => {
    expect(() => assertCwdOutsideGitDir("/some/repo/.git/modules/x")).toThrow(
      /GIT_EXEC_WRAPPER/,
    );
  });

  it("throws when cwd ends in /.git", () => {
    expect(() => assertCwdOutsideGitDir("/some/repo/.git")).toThrow(/\.git/);
  });

  it("does NOT throw for a normal working directory", () => {
    expect(() => assertCwdOutsideGitDir("/some/repo")).not.toThrow();
  });

  it("returns the resolved absolute path on pass", () => {
    const abs = assertCwdOutsideGitDir("/some/repo");
    expect(abs).toBe(path.resolve("/some/repo"));
  });
});
