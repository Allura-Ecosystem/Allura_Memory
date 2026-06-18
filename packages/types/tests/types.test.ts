import { test, expect } from "bun:test";
import { isGroupId, GROUP_ID_PATTERN } from "../src/index.ts";

test("isGroupId accepts org-scoped allura group ids", () => {
  expect(isGroupId("allura-faithmeats")).toBe(true);
  expect(isGroupId("allura-system")).toBe(true);
});

test("isGroupId rejects invalid namespaces", () => {
  expect(isGroupId("faithmeats")).toBe(false);
  expect(isGroupId("roninclaw-foo")).toBe(false);
  expect(isGroupId("Allura-Caps")).toBe(false);
});

test("pattern is the canonical tenant pattern", () => {
  expect(GROUP_ID_PATTERN.source).toBe("^allura-[a-z0-9-]+$");
});
