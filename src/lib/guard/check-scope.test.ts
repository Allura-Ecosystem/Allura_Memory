import { describe, expect, it } from "vitest";
import type { Scope } from "@allura/types";
import { checkToolScope } from "./check-scope";

describe("bumblebee/check-scope", () => {
  it("permits a tool when the required scope is granted", () => {
    const granted: Scope[] = ["memory:read", "memory:write"];
    expect(checkToolScope("memory_add", granted)).toEqual({ allowed: true, requiredScope: "memory:write" });
    expect(checkToolScope("memory_search", granted).allowed).toBe(true);
  });

  it("denies a tool when the required scope is missing", () => {
    const granted: Scope[] = ["memory:read"];
    const result = checkToolScope("memory_add", granted);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.requiredScope).toBe("memory:write");
      expect(result.reason).toMatch(/missing required scope/);
    }
  });

  it("denies an unknown tool", () => {
    const result = checkToolScope("rm_rf", ["memory:write"]);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/unknown tool/);
  });
});
