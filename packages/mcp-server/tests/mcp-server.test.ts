import { test, expect } from "bun:test";
import { toolsForScopes, MEMORY_TOOLS } from "../src/index.ts";

test("tool exposure is gated by scopes (least privilege)", () => {
  const names = toolsForScopes(["memory:read"]).map((t) => t.name);
  expect(names).toContain("memory_search");
  expect(names).not.toContain("memory_add");
});

test("write scope exposes memory_add", () => {
  const names = toolsForScopes(["memory:write"]).map((t) => t.name);
  expect(names).toContain("memory_add");
});

test("registry covers the core memory tools", () => {
  expect(MEMORY_TOOLS.length).toBeGreaterThanOrEqual(6);
});
