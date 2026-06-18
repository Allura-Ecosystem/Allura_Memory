import { test, expect } from "bun:test";
import {
  hasScope,
  scopesForRole,
  canApprove,
  DEFAULT_AGENT_SCOPES,
} from "../src/index.ts";

test("default agent scopes are least-privilege (no approve/promote)", () => {
  expect(DEFAULT_AGENT_SCOPES).toContain("memory:write");
  expect(DEFAULT_AGENT_SCOPES).not.toContain("memory:promote");
  expect(DEFAULT_AGENT_SCOPES).not.toContain("review:approve");
});

test("agents cannot approve even if granted review:approve (AD-04)", () => {
  expect(canApprove("agent", ["review:approve"])).toBe(false);
});

test("reviewer can approve when scoped", () => {
  expect(canApprove("reviewer", scopesForRole("reviewer"))).toBe(true);
});

test("employee cannot approve", () => {
  expect(canApprove("employee", scopesForRole("employee"))).toBe(false);
});

test("hasScope is exact", () => {
  expect(hasScope(["memory:read"], "memory:read")).toBe(true);
  expect(hasScope(["memory:read"], "memory:write")).toBe(false);
});
