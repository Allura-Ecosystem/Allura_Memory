// The loadtest suffix is a canonical-tools contract: benchmark seed writes bypass
// the curator queue while remaining inside this exact credential tenant.
export const DEFAULT_BENCHMARK_GROUP_ID = "allura-bench-ci-loadtest"
export const DEFAULT_BENCHMARK_WORKSPACE_ID = "benchmark-ci"

// Token agent_name / principal_id for the benchmark credential minted by
// provision-benchmark-auth.ts. Actor-selector fields on a tool call
// (curator_id, user_id, actor, agent_id — see ACTOR_FIELDS in
// src/lib/auth/principal-context.ts) must equal the authenticated principal
// for an mcp_token credential, so any benchmark call that sets a top-level
// `user_id` must use this exact value rather than a synthetic per-run id.
export const DEFAULT_BENCHMARK_AGENT_NAME = "epic-24-ci-benchmark"
