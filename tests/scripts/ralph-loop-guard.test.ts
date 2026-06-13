import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

import { assertSafeGitCwd } from "../../scripts/agents/ralph-loop";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertSafeGitCwd", () => {
  it("throws when cwd resolves inside a .git directory (modules submodule path)", () => {
    expect(() => assertSafeGitCwd("/some/repo/.git/modules/x")).toThrow(
      /GIT_EXEC_WRAPPER/,
    );
  });

  it("throws when cwd ends in /.git", () => {
    expect(() => assertSafeGitCwd("/some/repo/.git")).toThrow(/\.git/);
  });

  it("does NOT throw for a normal working directory", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertSafeGitCwd("/some/repo")).not.toThrow();
  });

  it("returns the resolved absolute path on pass", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const abs = assertSafeGitCwd("/some/repo");
    expect(abs).toBe(path.resolve("/some/repo"));
  });

  it("emits a GIT_EXEC_WRAPPER stderr line on pass", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    assertSafeGitCwd("/some/repo");
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[GIT_EXEC_WRAPPER] ralph cwd ok:"),
    );
  });
});
