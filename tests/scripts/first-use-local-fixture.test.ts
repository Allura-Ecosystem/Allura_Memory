import { describe, expect, it } from "vitest"
import { assessFirstUseObservation, assertFirstUseEmbeddingResponse, assertFirstUseModelIdentity, buildFirstUseFixturePlan, parseFirstUseRuntimeSecrets } from "../../scripts/first-use-local-fixture"

const now = new Date("2026-10-20T12:00:00Z")

describe("trial runtime-secret parsing", () => {
  it.each(["SYNTHETIC_TRIAL_SECRET_MARKER_FOR_REVIEW", JSON.stringify({ marker: "SYNTHETIC_TRIAL_SECRET_MARKER_FOR_REVIEW" }), "null"])("sanitizes parser and validation failures", (text) => {
    let caught: unknown
    try { parseFirstUseRuntimeSecrets(text) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe("FIRST_USE_SECRET_CONFIGURATION_INVALID")
    expect((caught as Error).cause).toBeUndefined()
    expect(String(caught)).not.toContain("SYNTHETIC_TRIAL_SECRET_MARKER_FOR_REVIEW")
  })
})

function input() {
  return {
    trial_id: "a1b2c3d4e5f6", group_id: "allura-system", workspace_id: "11111111-1111-4111-8111-111111111111",
    principal_id: "first-use-eval-a1b2c3d4e5f6", project: "allura-first-use-a1b2c3d4e5f6", database: "allura_first_use_a1b2c3d4e5f6",
    scopes: ["memory:read", "memory:write"], expires_at: "2026-10-20T13:00:00Z",
    credential: { id: "tok_22222222-2222-4222-8222-222222222222", prefix: "allura_mcp_abcdefgh", hash: "a".repeat(64) },
    images: { postgres: `pgvector/pgvector@sha256:${"1".repeat(64)}`, ollama: `ollama/ollama@sha256:${"2".repeat(64)}` },
    model: { name: "qwen3-embedding:0.6b", digest: `sha256:${"3".repeat(64)}` },
  }
}
function empty() {
  return { mode: "nonproduction_trial", project: input().project, database: input().database, resource_owner: input().project,
    unexpected_rows: 0, state: "empty", workspace: null, token: null }
}

describe("AD-71 pure fixture preparation (no live authority)", () => {
  it("produces a bound read/write-only proposal that cannot execute", () => {
    const plan = buildFirstUseFixturePlan(input(), now)
    expect(plan).toMatchObject({ executable: false, execution_blocker: "NO_VERIFIED_MCP_DATABASE_ADAPTER",
      workspace: { group_id: "allura-system", workspace_id: input().workspace_id },
      token: { group_id: "allura-system", workspace_id: input().workspace_id, scopes: ["memory:read", "memory:write"] } })
    expect(plan).not.toHaveProperty("sql")
    expect(plan.token).not.toHaveProperty("raw")
  })
  it.each(["allura-other", "roninclaw-test", "allura-team-ram"])("rejects foreign/retired tenant %s", (group_id) => {
    expect(() => buildFirstUseFixturePlan({ ...input(), group_id }, now)).toThrow()
  })
  it.each(["knowledge-postgres", "allura-first-use-another00000"])("rejects unbound project %s", (project) => {
    expect(() => buildFirstUseFixturePlan({ ...input(), project }, now)).toThrow()
  })
  it("rejects primary database and a reassigned principal", () => {
    expect(() => buildFirstUseFixturePlan({ ...input(), database: "allura_memory" }, now)).toThrow()
    expect(() => buildFirstUseFixturePlan({ ...input(), principal_id: "operator" }, now)).toThrow()
  })
  it.each([null, [], ["memory:read"], ["memory:read", "memory:write", "review:approve"], ["memory:promote", "memory:write"]])("rejects missing or widened scopes %j", (scopes) => {
    expect(() => buildFirstUseFixturePlan({ ...input(), scopes }, now)).toThrow()
  })
  it.each(["2026-10-20T11:59:59Z", "2026-10-20T12:00:00Z", "2026-10-21T12:00:01Z", "invalid"])("rejects unsafe expiry %s", (expires_at) => {
    expect(() => buildFirstUseFixturePlan({ ...input(), expires_at }, now)).toThrow()
  })
  it("accepts the exact 24-hour bound and rejects an invalid evaluation clock", () => {
    expect(buildFirstUseFixturePlan({ ...input(), expires_at: "2026-10-21T12:00:00Z" }, now).token.expires_at).toContain("12:00:00Z")
    expect(() => buildFirstUseFixturePlan(input(), new Date(NaN))).toThrow()
  })
  it("rejects raw secrets and forged approval flags, even alongside otherwise valid inputs", () => {
    for (const extra of [{ raw_token: "synthetic-never-an-actual-token" }, { verified: true }, { signing_secret: "test-only" }, { mode: "production" }]) {
      expect(() => buildFirstUseFixturePlan({ ...input(), ...extra }, now)).toThrow()
    }
    expect(() => buildFirstUseFixturePlan({ ...input(), credential: { ...input().credential, raw: "test-only" } }, now)).toThrow()
  })
  it("requires concrete image/model digest syntax without claiming registry verification", () => {
    expect(() => buildFirstUseFixturePlan({ ...input(), images: { ...input().images, ollama: "ollama/ollama:latest" } }, now)).toThrow()
    expect(() => buildFirstUseFixturePlan({ ...input(), model: { ...input().model, digest: "latest" } }, now)).toThrow()
  })
  it("rejects an invalid token UUID, prefix and non-hash value", () => {
    expect(() => buildFirstUseFixturePlan({ ...input(), credential: { ...input().credential, id: `tok_${"-".repeat(36)}` } }, now)).toThrow()
    expect(() => buildFirstUseFixturePlan({ ...input(), credential: { ...input().credential, prefix: "allura_mcp_abc" } }, now)).toThrow()
    expect(() => buildFirstUseFixturePlan({ ...input(), credential: { ...input().credential, hash: "not-a-hash" } }, now)).toThrow()
  })
  it("does not turn matching untrusted observations into execution authority", () => {
    const plan = buildFirstUseFixturePlan(input(), now)
    expect(assessFirstUseObservation(plan, empty())).toEqual({ kind: "untrusted_observation_matches_plan", executable: false })
    expect(() => assessFirstUseObservation(plan, { ...empty(), verified: true })).toThrow()
    expect(() => assessFirstUseObservation(plan, { ...empty(), mode: "production" })).toThrow()
  })
  it.each([{ database: "allura_memory" }, { project: "primary" }, { resource_owner: "someone-else" }, { unexpected_rows: 1 }, { state: "foreign" }, { state: "unknown" }])("rejects a mismatched/unknown target observation %j", (change) => {
    expect(() => assessFirstUseObservation(buildFirstUseFixturePlan(input(), now), { ...empty(), ...change })).toThrow()
  })
  it("allows only the exact existing fixture; never upserts or silently reissues", () => {
    const plan = buildFirstUseFixturePlan(input(), now)
    const existing = { ...empty(), state: "matching", workspace: { group_id: plan.workspace.group_id, workspace_id: plan.workspace.workspace_id }, token: { ...plan.token } }
    expect(() => assessFirstUseObservation(plan, existing)).not.toThrow()
    for (const token of [{ ...plan.token, group_id: "allura-other" }, { ...plan.token, token_hash: "b".repeat(64) }, { ...plan.token, scopes: ["memory:read", "review:approve"] }]) {
      expect(() => assessFirstUseObservation(plan, { ...existing, token })).toThrow()
    }
    expect(() => assessFirstUseObservation(plan, { ...empty(), workspace: plan.workspace })).toThrow()
  })
})

describe("real-provider response boundary", () => {
  it("matches only the reviewed full model digest, accepting the optional SHA-256 prefix", () => {
    for (const digest of ["3".repeat(64), `sha256:${"3".repeat(64)}`]) {
      expect(() => assertFirstUseModelIdentity({ models: [{ name: input().model.name, digest }] }, input().model)).not.toThrow()
    }
    for (const inventory of [{ models: [] }, { models: [{ name: "different-model", digest: "3".repeat(64) }] },
      { models: [{ name: input().model.name, digest: "4".repeat(64) }] },
      { models: [{ name: input().model.name, digest: "3".repeat(12) }] }]) {
      expect(() => assertFirstUseModelIdentity(inventory, input().model)).toThrow()
    }
  })
  it("accepts the finite shape but grants no model/schema/journey proof", () => {
    expect(() => assertFirstUseEmbeddingResponse({ data: [{ embedding: Array(1024).fill(0.1) }] })).not.toThrow()
  })
  it.each([null, {}, { data: [] }, { data: [{ embedding: null }] }, { data: [{ embedding: Array(768).fill(0.1) }] },
    { data: [{ embedding: Array(1024).fill(0) }] }, { data: [{ embedding: [...Array(1023).fill(0.1), Infinity] }] },
    { data: [{ embedding: [...Array(1023).fill(0.1), NaN] }] }])("rejects absent, incompatible or invalid provider data", (response) => {
    expect(() => assertFirstUseEmbeddingResponse(response)).toThrow()
  })
})
