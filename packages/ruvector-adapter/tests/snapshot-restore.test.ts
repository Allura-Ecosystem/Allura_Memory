import { test, expect } from "bun:test";
import { snapshot, restore } from "../src/snapshot.ts";
import type { AlluraScope } from "@allura/types";

const scope: AlluraScope = {
  group_id: "allura-faithmeats",
  workspace_id: "ws-sales",
  actor_id: "ops",
  request_id: "req-1",
  scopes: ["memory:read"],
};

test("snapshot then restore yields a receipt with audit", async () => {
  const s = await snapshot(scope);
  expect(s.snapshot_id).toContain("ws-sales");
  const r = await restore(scope, s.snapshot_id);
  expect(r.restored).toBe(true);
  expect(r.audit.action).toBe("restore");
});

test("restore requires a snapshot id", async () => {
  await expect(restore(scope, "")).rejects.toThrow();
});
