import { test, expect } from "bun:test";
import { recordFeedback } from "../src/feedback.ts";
import type { AlluraScope } from "@allura/types";

const scope: AlluraScope = {
  group_id: "allura-faithmeats",
  workspace_id: "ws-sales",
  actor_id: "claude",
  request_id: "req-1",
  scopes: ["memory:write"],
};

test("feedback never auto-promotes — always requires human approval (AD-04)", async () => {
  const p = await recordFeedback(scope, "m1", 1);
  expect(p.requires_human_approval).toBe(true);
  expect(p.audit.action).toBe("feedback");
});

test("feedback is scoped — missing context throws", async () => {
  await expect(
    recordFeedback({ ...scope, workspace_id: "" }, "m1", 1),
  ).rejects.toThrow();
});
