import { test, expect } from "bun:test";
import { assertScope, PolicyError } from "../src/policy.ts";
import type { AlluraScope } from "@allura/types";

const valid: AlluraScope = {
  group_id: "allura-faithmeats",
  workspace_id: "ws-sales",
  actor_id: "claude",
  request_id: "req-1",
  scopes: ["memory:read"],
};

test("rejects missing group_id", () => {
  expect(() => assertScope({ ...valid, group_id: undefined as unknown as AlluraScope["group_id"] })).toThrow(PolicyError);
});

test("rejects non-allura group_id", () => {
  expect(() => assertScope({ ...valid, group_id: "faithmeats" as AlluraScope["group_id"] })).toThrow(PolicyError);
});

test("rejects missing workspace_id (ADR-001 sub-scope required)", () => {
  expect(() => assertScope({ ...valid, workspace_id: "" })).toThrow(PolicyError);
});

test("rejects missing actor_id / request_id (audit context)", () => {
  expect(() => assertScope({ ...valid, actor_id: "" })).toThrow(PolicyError);
  expect(() => assertScope({ ...valid, request_id: "" })).toThrow(PolicyError);
});

test("accepts a fully scoped context", () => {
  expect(() => assertScope(valid)).not.toThrow();
});
