import { test, expect } from "bun:test";
import { search } from "../src/search.ts";
import type { AlluraScope } from "@allura/types";

const scope: AlluraScope = {
  group_id: "allura-faithmeats",
  workspace_id: "ws-sales",
  actor_id: "claude",
  request_id: "req-1",
  scopes: ["memory:read"],
};

test("search returns audit context scoped to org + workspace", async () => {
  const r = await search(scope, "halal logistics", [
    { id: "m1", score: 0.9, provenance_ids: ["t1"] },
  ]);
  expect(r.audit.group_id).toBe("allura-faithmeats");
  expect(r.audit.workspace_id).toBe("ws-sales");
  expect(r.hits[0].provenance_ids.length).toBeGreaterThan(0);
});

test("search rejects hits without provenance", async () => {
  await expect(
    search(scope, "q", [{ id: "m1", score: 1, provenance_ids: [] }]),
  ).rejects.toThrow();
});

test("search requires memory:read scope", async () => {
  await expect(search({ ...scope, scopes: [] }, "q")).rejects.toThrow();
});
