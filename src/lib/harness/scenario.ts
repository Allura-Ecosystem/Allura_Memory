/**
 * Story 24.5 — Scenario model and schema validation.
 *
 * Typed access to allura-scenario-v1 JSON scenarios. Uses ajv for validation
 * and rejects any scenario with unknown executable fields.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";

export interface ScenarioFixture {
  scenario_id: string;
  schema_version: "v1";
  description?: string;
  tenant_fixture: {
    group_id: string;
    cleanup?: boolean;
  };
  principal_fixture: {
    principal_id: string;
    roles: ("viewer" | "curator" | "admin")[];
    tenant_ids: string[];
    auth_method?: "mcp_token" | "service_identity" | "dev_local" | "web_session";
  };
  process_definition: {
    id: string;
    revision: string;
  };
  initial_state?: {
    memories?: Array<{ content: string; score?: number; provenance?: string }>;
    proposals?: Array<{ content: string; score: number; tier?: string; status?: "pending" | "approved" | "rejected" }>;
  };
  tool_fixtures: Array<{
    tool_name: string;
    match: "ordered" | "unordered";
    response?: { result?: unknown };
    error?: { code: "TIMEOUT" | "TOOL_ERROR" | "MALFORMED_RESULT" | "POLICY_DENIED" | "TRANSIENT_RETRY"; message?: string };
    latency_ms?: number;
  }>;
  virtual_clock?: { start_time: string; tick_interval_ms?: number };
  random_seed?: number;
  policy_expectations?: Array<{ policy_id: string; expected_decision: "allow" | "deny" | "needs_evidence"; at_step?: number }>;
  assertions: {
    output?: { expected_status?: "completed" | "failed" | "pending"; expected_error?: string; [k: string]: unknown };
    state?: { memory_count?: number; proposal_status?: string; [k: string]: unknown };
    audit?: { expected_events?: string[]; [k: string]: unknown };
  };
  approval_breakpoints?: Array<{ at_step: number; decision: "approve" | "reject" | "needs_evidence"; rationale?: string }>;
}

let _validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (_validator) return _validator;
  const schemaPath = resolve(process.cwd(), "schemas/allura-scenario-v1.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv({ allErrors: true, strict: true });
  _validator = ajv.compile(schema) as ValidateFunction;
  return _validator;
}

export function loadScenario(path: string): ScenarioFixture {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return validateScenario(raw);
}

export function validateScenario(raw: unknown): ScenarioFixture {
  const validate = getValidator();
  if (!validate(raw)) {
    const errors = validate.errors?.map((e) => `${e.instancePath}: ${e.message ?? "validation error"}`).join("; ") ?? "validation failed";
    throw new Error(`Invalid scenario: ${errors}`);
  }
  return raw as ScenarioFixture;
}

/**
 * Compute a stable digest over the deterministic fields of a scenario.
 * Excludes descriptions and non-deterministic timestamps.
 */
export function scenarioDigest(scenario: ScenarioFixture): string {
  const stable = {
    scenario_id: scenario.scenario_id,
    schema_version: scenario.schema_version,
    tenant_fixture: scenario.tenant_fixture,
    principal_fixture: scenario.principal_fixture,
    process_definition: scenario.process_definition,
    initial_state: scenario.initial_state,
    tool_fixtures: scenario.tool_fixtures.map((f) => ({ tool_name: f.tool_name, match: f.match, error: f.error, latency_ms: f.latency_ms })),
    virtual_clock: scenario.virtual_clock,
    random_seed: scenario.random_seed,
    policy_expectations: scenario.policy_expectations,
    assertions: scenario.assertions,
    approval_breakpoints: scenario.approval_breakpoints,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}