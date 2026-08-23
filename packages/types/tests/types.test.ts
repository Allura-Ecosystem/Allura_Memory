import { readFileSync } from "node:fs";
import { test, expect } from "bun:test";
import { isGroupId, GROUP_ID_PATTERN } from "../src/index.ts";

const typesSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

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

test("AlluraScope requires a workspace boundary without claiming route enforcement", () => {
  expect(typesSource).toContain("workspace_id: WorkspaceId;");
  expect(typesSource).not.toContain("Workspace enforcement remains deferred");
});
