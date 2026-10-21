/**
 * AD-71 local preparation only. Pure plans and observation checks: no I/O,
 * secret generation, SQL, connection pools, subprocesses or execution adapter.
 * Matching caller-supplied observations never establish target authority.
 */
import { z } from "zod"

const runtimeSecretsSchema = z.object({
  POSTGRES_APP_PASSWORD: z.string().min(24),
  ALLURA_MCP_TOKEN_SECRET: z.string().min(32),
  RUVIX_CONTROL_PLANE_SECRET: z.string().min(32),
}).strict()

/** Never attach parser diagnostics or input to an error at this secret boundary. */
export function parseFirstUseRuntimeSecrets(text: string): z.infer<typeof runtimeSecretsSchema> {
  try {
    return runtimeSecretsSchema.parse(JSON.parse(text))
  } catch {
    throw new Error("FIRST_USE_SECRET_CONFIGURATION_INVALID")
  }
}

const trialId = z.string().regex(/^[a-z0-9]{12}$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const tokenId = z.string().refine((value) => value.startsWith("tok_") && z.string().uuid().safeParse(value.slice(4)).success,
  "A tok_ identifier with a valid UUID is required")
const tokenHash = z.string().regex(/^[a-f0-9]{64}$/)
const tokenPrefix = z.string().regex(/^allura_mcp_[A-Za-z0-9_-]{8}$/)

const inputSchema = z.object({
  trial_id: trialId,
  group_id: z.literal("allura-system"),
  workspace_id: z.string().uuid(),
  principal_id: z.string(),
  project: z.string(),
  database: z.string(),
  scopes: z.tuple([z.literal("memory:read"), z.literal("memory:write")]),
  expires_at: z.string().datetime({ offset: true }),
  credential: z.object({ id: tokenId, prefix: tokenPrefix, hash: tokenHash }).strict(),
  images: z.object({
    postgres: z.string().regex(/^pgvector\/pgvector@sha256:[a-f0-9]{64}$/),
    ollama: z.string().regex(/^ollama\/ollama@sha256:[a-f0-9]{64}$/),
  }).strict(),
  model: z.object({ name: z.literal("qwen3-embedding:0.6b"), digest }).strict(),
}).strict()

export interface FirstUseFixturePlan {
  readonly kind: "synthetic_first_use_plan"
  readonly executable: false
  readonly execution_blocker: "NO_VERIFIED_MCP_DATABASE_ADAPTER"
  readonly target: { readonly trial_id: string; readonly project: string; readonly database: string }
  readonly workspace: { readonly group_id: "allura-system"; readonly workspace_id: string; readonly name: string }
  readonly token: {
    readonly id: string
    readonly group_id: "allura-system"
    readonly workspace_id: string
    readonly agent_name: string
    readonly token_prefix: string
    readonly token_hash: string
    readonly scopes: readonly ["memory:read", "memory:write"]
    readonly expires_at: string
  }
  readonly images: { readonly postgres: string; readonly ollama: string }
  readonly model: { readonly name: "qwen3-embedding:0.6b"; readonly digest: string; readonly dimensions: 1024 }
}

/** Builds a proposal; it cannot authorize or perform provisioning. */
export function buildFirstUseFixturePlan(input: unknown, now: Date = new Date()): FirstUseFixturePlan {
  const value = inputSchema.parse(input)
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid evaluation clock")
  if (value.project !== `allura-first-use-${value.trial_id}` ||
      value.database !== `allura_first_use_${value.trial_id}` ||
      value.principal_id !== `first-use-eval-${value.trial_id}`) {
    throw new Error("Trial identifiers must match the exact dedicated resource plan")
  }
  const expiry = Date.parse(value.expires_at)
  if (expiry <= now.getTime() || expiry - now.getTime() > 24 * 60 * 60 * 1000) {
    throw new Error("Trial credential expiry must be in the next 24 hours")
  }
  return {
    kind: "synthetic_first_use_plan",
    executable: false,
    execution_blocker: "NO_VERIFIED_MCP_DATABASE_ADAPTER",
    target: { trial_id: value.trial_id, project: value.project, database: value.database },
    workspace: { group_id: value.group_id, workspace_id: value.workspace_id, name: "Synthetic first-use evaluation" },
    token: {
      id: value.credential.id,
      group_id: value.group_id,
      workspace_id: value.workspace_id,
      agent_name: value.principal_id,
      token_prefix: value.credential.prefix,
      token_hash: value.credential.hash,
      scopes: [...value.scopes],
      expires_at: value.expires_at,
    },
    images: value.images,
    model: { ...value.model, dimensions: 1024 },
  }
}

const observationSchema = z.object({
  mode: z.literal("nonproduction_trial"),
  project: z.string(),
  database: z.string(),
  resource_owner: z.string(),
  unexpected_rows: z.number().int().nonnegative(),
  state: z.enum(["empty", "matching", "foreign", "unknown"]),
  workspace: z.object({ group_id: z.string(), workspace_id: z.string() }).strict().nullable(),
  token: z.object({
    id: tokenId, group_id: z.string(), workspace_id: z.string(), agent_name: z.string(),
    token_prefix: tokenPrefix, token_hash: tokenHash,
    scopes: z.array(z.string()), expires_at: z.string(),
  }).strict().nullable(),
}).strict()

/** Pure negative checks only. A future trusted adapter must gather the evidence. */
export function assessFirstUseObservation(plan: FirstUseFixturePlan, input: unknown): {
  readonly kind: "untrusted_observation_matches_plan"
  readonly executable: false
} {
  const observed = observationSchema.parse(input)
  if (observed.project !== plan.target.project || observed.database !== plan.target.database ||
      observed.resource_owner !== plan.target.project || observed.unexpected_rows !== 0) {
    throw new Error("Observed trial target or state does not match the plan")
  }
  if (observed.state === "empty") {
    if (observed.workspace !== null || observed.token !== null) throw new Error("Empty fixture has existing records")
  } else if (observed.state === "matching") {
    const workspace = observed.workspace
    const token = observed.token
    if (!workspace || !token || workspace.group_id !== plan.workspace.group_id ||
        workspace.workspace_id !== plan.workspace.workspace_id || token.group_id !== plan.token.group_id ||
        token.workspace_id !== plan.token.workspace_id || token.agent_name !== plan.token.agent_name ||
        token.id !== plan.token.id || token.token_prefix !== plan.token.token_prefix ||
        token.token_hash !== plan.token.token_hash || token.expires_at !== plan.token.expires_at ||
        token.scopes.length !== 2 || token.scopes[0] !== "memory:read" || token.scopes[1] !== "memory:write") {
      throw new Error("Existing fixture differs; no upsert, reassignment or credential reissue is allowed")
    }
  } else {
    throw new Error("Unknown or foreign fixture state")
  }
  return { kind: "untrusted_observation_matches_plan", executable: false }
}

/** A real response still needs model-digest and actual database-schema checks. */
export function assertFirstUseEmbeddingResponse(input: unknown): void {
  const vector = z.object({
    data: z.tuple([z.object({ embedding: z.array(z.number().finite()).length(1024) }).passthrough()]),
  }).passthrough().parse(input).data[0].embedding
  if (!vector.some((value) => value !== 0)) throw new Error("A zero vector does not establish provider readiness")
}

/** Compare full SHA-256 identities; a short CLI display digest is insufficient. */
export function assertFirstUseModelIdentity(input: unknown, expectedInput: unknown): void {
  const expected = z.object({ name: z.literal("qwen3-embedding:0.6b"), digest }).strict().parse(expectedInput)
  const inventory = z.object({ models: z.array(z.object({
    name: z.string(), digest: z.string().regex(/^(sha256:)?[a-f0-9]{64}$/),
  }).passthrough()) }).passthrough().parse(input)
  if (!inventory.models.some((model) => model.name === expected.name &&
    (model.digest.startsWith("sha256:") ? model.digest : `sha256:${model.digest}`) === expected.digest)) {
    throw new Error("Model identity mismatch")
  }
}
