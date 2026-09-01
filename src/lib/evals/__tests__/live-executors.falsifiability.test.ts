/**
 * Story 24.6 — measured evaluation falsifiability proof.
 *
 * A metric that cannot fail is not a metric. These tests prove each live
 * executor reports a real measurement by driving it to a FAILING outcome and
 * asserting the metric drops below threshold. They run against a live
 * PostgreSQL stack (app role) and are gated on POSTGRES_APP_PASSWORD, joining
 * the live-db lane.
 */
import { afterAll, describe, expect, it } from "vitest";

import { liveExecutor } from "@/lib/evals/executors/live-executors";
import { loadSuite } from "@/lib/evals/runner";

const SUITE_PATH = "evals/suites/portfolio.yaml";
const describeLive = process.env.POSTGRES_APP_PASSWORD ? describe : describe.skip;

function lane(name: string) {
  const suite = loadSuite(SUITE_PATH);
  const found = suite.lanes.find((l) => l.name === name);
  if (!found) throw new Error(`lane ${name} not found`);
  return found;
}

describeLive("measured evaluation falsifiability", () => {
  afterAll(() => undefined);

  it("retrieval_relevance reports precision 0 for a query with no corpus match", async () => {
    const outcome = await liveExecutor(
      lane("retrieval_relevance"),
      {},
      { id: "neg-retrieval", query: "photosynthesis chlorophyll absorption spectrum", expected_memory_ids: ["mem-dti-1"], k: 5 },
    );
    expect(outcome.observed).toHaveProperty("value");
    expect((outcome.observed as { value: number }).value).toBe(0);
  });

  it("policy_violation_blocking reports deny for a missing actor (POL-004)", async () => {
    const outcome = await liveExecutor(
      lane("policy_violation_blocking"),
      {},
      { id: "neg-policy", policy_id: "POL-004", expected_decision: "deny", claims: { group_id: "allura-x", nonce: "n" }, context: { timestamp: 0, operation: "memory_add", resource: "events", actor: "" } },
    );
    expect(outcome.passed).toBe(true);
    expect((outcome.observed as { decision: string }).decision).toBe("deny");
  });

  it("policy_violation_blocking reports allow for a valid actor (falsifiable both ways)", async () => {
    const outcome = await liveExecutor(
      lane("policy_violation_blocking"),
      {},
      { id: "pos-policy", policy_id: "POL-004", expected_decision: "allow", claims: { group_id: "allura-x", nonce: "n" }, context: { timestamp: 0, operation: "memory_add", resource: "events", actor: "agent-valid" } },
    );
    expect(outcome.passed).toBe(true);
    expect((outcome.observed as { decision: string }).decision).toBe("allow");
  });

  it("cross_tenant_isolation reports leak when reading as the source tenant", async () => {
    // Reading as the SAME tenant that owns the memory must return the row —
    // proving the executor is actually measuring isolation, not always 0.
    const outcome = await liveExecutor(
      lane("cross_tenant_isolation"),
      {},
      { id: "neg-ct", source_group: "allura-eval-tenant-a", target_group: "allura-eval-tenant-a", expected_leak: 0 },
    );
    // Same tenant → the memory is visible → leaked > 0 → the case fails.
    expect(outcome.passed).toBe(false);
    expect((outcome.observed as { leaked: number }).leaked).toBeGreaterThan(0);
  });

  it("tool_contract_validation reports failure for a tool absent from the catalog", async () => {
    const outcome = await liveExecutor(
      lane("tool_contract_validation"),
      {},
      { id: "neg-tool", tool: "nonexistent_tool", required_params: ["group_id"] },
    );
    expect(outcome.passed).toBe(false);
  });
});
