# Story 24.2 — Authenticated Principal Context

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** in-review
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Story 24.1

## User Story

As an enterprise platform owner, I need tenant, user, and role authority derived from a verified principal, so that an agent cannot gain access by submitting trusted-looking request fields.

## Context

The HTTP gateway accepts tenant and actor identifiers in tool arguments, and elevated tool gating currently reads a role from request parameters. A shared bearer token may also be optional. Format validation is not authorization. This story establishes one transport-independent principal contract and makes production authentication fail closed.

## Architectural Contract

```ts
type PrincipalContext = {
  principalId: string
  tenantIds: readonly string[]
  roles: readonly ("admin" | "curator" | "viewer")[]
  authMethod: "mcp_token" | "service_identity" | "dev_local"
  sessionId: string
}
```

The exact type may vary, but every trusted field must originate from verified credentials or explicit local-development configuration. Tool arguments are resource selectors, never sources of authority.

**As built** (`src/lib/auth/principal-context.ts`): the five fields above shipped
as specified, plus two optional credential-derived fields — `credentialId`
(the `mcp_tokens.id` row id, never the token or its hash) and `expiresAt`. The
object and its arrays are frozen. Workspace restriction remains deferred: the
canonical MCP tool boundary does not currently enforce `workspace_id`, so this
story does not claim that it does.

## Scope

- Authenticate HTTP requests against hashed, revocable MCP credentials.
- Resolve one `PrincipalContext` at the transport boundary and pass it through tool dispatch and audit. **As-built correction:** the original scope also said *kernel policy*. That was descoped during review because the canonical MCP dispatch path never reaches `src/kernel/` — see Ruling on Finding 3 under Review Round 1. No kernel file changed in this story.
- Bind stdio/service operation to an explicit configured service principal and tenant allowlist.
- Reject tenant/user/role argument mismatches before business logic runs.
- Audit authentication and authorization decisions without logging credentials.

## Out of Scope

- Building login UI or selecting an enterprise identity provider.
- Authorization policy beyond the existing admin/curator/viewer model.
- Database row-level security, which is Story 24.3.
- **Added at review:** kernel-level policy consumption of principal claims
  (`src/kernel/proof.ts`, `src/kernel/policy.ts`). Descoped because the MCP
  dispatch path does not traverse the kernel — Ruling on Finding 3. Becomes
  worthwhile only if the memory write path is moved onto the kernel syscall
  layer.

## Acceptance Criteria

Legend: `[x]` = fully satisfied and provable on the build machine. `[~]` = implemented and unit-proven, but final evidence requires live infrastructure that runs on the laptop (marked **[PENDING LAPTOP]**).

- [~] AC-1: Production HTTP startup fails when no supported authentication configuration is present. **[PENDING LAPTOP]** Logic proven by unit test; the process actually refusing to boot is only observable against the deployed container.
- [x] AC-2: Bearer credentials are compared using a timing-safe method and stored only as hashes where persisted.
- [x] AC-3: Successful authentication produces a typed `PrincipalContext`; tool handlers cannot construct or override it from arguments.
- [x] AC-4: `group_id`, `user_id`, `curator_id`, and `role` cannot elevate the principal. A mismatched selector returns a stable authorization error.
- [x] AC-5: Elevated MCP tools authorize from `PrincipalContext.roles`, never `request.params.role` or another caller-controlled value.
- [~] AC-6: Stdio/service mode requires an explicit service identity and tenant allowlist; production has no anonymous default. **[PENDING LAPTOP]** Config resolution and principal binding proven by unit test; boot refusal observable only on the laptop.
- [~] AC-7: Audit events record principal ID, effective tenant, roles used, session ID, tool, decision, and reason code, while excluding raw tokens and sensitive payloads. **[PENDING LAPTOP]** Now genuinely wired to the append-only `events` table via `insertEvent` (metadata JSONB, no schema change); row shape, status-constraint mapping, tenant fallback, credential-safety and failure policy are unit tested. Only the actual INSERT landing in PostgreSQL is unverified here.
- [x] AC-8: Revoked or expired credentials fail on the next request according to the documented cache policy.
- [x] AC-9: Adversarial tests cover missing auth, malformed auth, forged role, forged tenant, forged curator ID, revoked token, expired token, and valid least-privilege access.
- [x] AC-10: Existing authorized memory and curator flows continue to work with principal context injected. Note the named residual gap on the legacy shared token (Finding 5, below).

## Implementation Files

- `src/lib/auth/principal-context.ts` — new trusted identity contract.
- `src/lib/auth/mcp-authenticator.ts` — new credential verification and revocation path.
- `src/mcp/canonical-http-gateway.ts` — resolve principal once and remove parameter-derived role authority.
- `src/mcp/memory-server-canonical.ts` — bind service principal for non-HTTP transport.
- ~~`src/kernel/policy.ts` and `src/kernel/proof.ts` — consume trusted principal claims.~~ **NOT IMPLEMENTED — descoped during review.** An earlier draft added `ProofClaims.principal` and a POL-028 tenant-binding policy; both were reverted because nothing on the MCP request path can populate them. `git diff HEAD -- src/kernel/` is empty. Rationale and evidence: Ruling on Finding 3 under Review Round 1.
- `src/lib/auth/__tests__/principal-context.test.ts` — unit contract tests.
- `src/__tests__/mcp-auth-adversarial.test.ts` — gateway-level adversarial matrix.
- `.env.example` and deployment configuration — secure defaults and explicit local-dev mode.

## Tasks

- [x] Document current auth entrypoints and all request fields used as authority.
- [x] Implement credential verification and `PrincipalContext` resolution.
- [x] Thread principal context through MCP dispatch, canonical tools, and audit. **Scope correction:** *policy evaluation* was deliberately dropped - see Ruling on Finding 3.
- [x] Replace parameter-derived role and curator authority.
- [x] Add explicit local development mode that refuses to activate in production.
- [x] Add credential revocation/expiry behavior and tests.
- [x] Run existing MCP contract tests plus the new adversarial suite.

## Validation and Evidence

Evidence must include a table of attack case, expected status/reason code, actual result, and audit-event ID. Token values must never appear in logs or artifacts.

**Status:** the table is in "Adversarial Evidence Table (AC-9)" below. The
audit-event ID column carries the harness's deterministic synthetic id, not a
live `events.id` — real row ids require the laptop database and are listed under
Status Evidence as pending. The no-token-in-artifacts requirement is met and
asserted by the test suite.

## Definition of Done

- [~] No production request reaches a memory or governance handler without a
  verified principal. **Code-complete; [PENDING LAPTOP] for the deployed
  assertion.** Both transports route every call through `guardToolCall`, which
  refuses without a principal; production startup refuses without an auth
  configuration. Verified in-process, not yet against a running gateway.
- [x] No caller-controlled field can expand the principal's tenant or role
 authority. `role`/`roles`/`principal`/`session_id` are stripped; `group_id`
 and the actor fields are reconciled
  against the principal. Covered by the AC-9 matrix.
- [x] Documentation impact **recorded** for BLUEPRINT, SOLUTION-ARCHITECTURE,
  DATA-DICTIONARY, REQUIREMENTS-MATRIX and RISKS-AND-DECISIONS — see
  **Documentation Impact Record (DoD item 3)** below. Satisfied by record, per
  Brooks' ruling in review cycle 3: the DoD requires impact to be *recorded*,
  not the documents rewritten. **The documents themselves are still unedited.**
  `git status --short -- docs/` is empty for this story, and both candidate doc
  sets remain at their pre-story state. The edits land in **Story 24.8 —
  Enterprise Documentation Truth Pack**, which lists Story 24.2 among its
  dependencies and exists for exactly this pass. Note: `planning docs/` (the
  mortagate convention named in the original DoD) does not exist in this repo.

## Dev Agent Record

**Status:** in-review. Review rounds 1-3 fixes are recorded, but this story is not done: AC-1/AC-6/AC-7 still require laptop-authoritative live-infrastructure evidence, and the full validation lane has seven failed test files plus one unhandled rejection.

### Implementation Plan

1. **Recon.** Catalogue every auth entrypoint and every request field trusted as
   authority (see "Auth Entrypoint Inventory" below).
2. **Contract first.** Build a dependency-free `PrincipalContext` module: typed,
   frozen, with stable reason codes. Unit test it before wiring anything.
3. **Credential verification.** Build `mcp-authenticator.ts` over the EXISTING
   `mcp_tokens` table (docker/postgres-init/28-mcp-tokens.sql) and the existing
   `src/lib/mcp-token/{hash,repository}.ts`. No new credential table, no schema
   migration required. All dependencies injected so the module is testable with
   no live database.
4. **One chokepoint.** `guardToolCall()` is the single function both transports
   call before dispatch, so HTTP and stdio cannot drift.
5. **Wire transports.** HTTP gateway authenticates every request (not just
   session initialize); stdio binds an explicit service principal at boot.
6. ~~**Kernel.** Add optional trusted principal claims to `ProofClaims` plus
   POL-028 tenant binding, backwards compatible when claims are absent.~~
   **ABANDONED at review.** Executed as planned in round 1, then reverted in
   round 2 once it was shown unreachable. See Ruling on Finding 3. Tenant
   binding is enforced by `resolveEffectiveTenant` inside `guardToolCall`,
   which is in the actual request path.
7. **Adversarial matrix.** In-process, no live server, no live DB.
8. **Audit persistence** (added at review). Project each decision into an
   append-only `events` row via `insertEvent`, metadata JSONB only.

### Auth Entrypoint Inventory (Task 1)

| Location | Before | After |
|---|---|---|
| `canonical-http-gateway.ts` `validateBearerAuth()` | Shared token, returned `true` when `ALLURA_MCP_AUTH_TOKEN` was unset (dead-open) | Deleted. Replaced by `resolveRequestPrincipal()` over `McpAuthenticator`; production refuses to boot unauthenticated |
| `canonical-http-gateway.ts` ADMIN_TOOLS gate | Read `request.params.role`; any caller could send `role:"admin"` | `guardToolCall()` authorizes from `PrincipalContext.roles`; `role` is stripped from arguments |
| `canonical-http-gateway.ts` admin/metrics routes | Shared token only | `requireElevatedPrincipal()` (admin or curator) for `/api/admin/*`; verified principal for `/metrics` |
| `memory-server-canonical.ts` `main()` | Zero auth on stdio | Explicit service principal + tenant allowlist; production has no anonymous default |
| `curator-tools.ts` `request.curator_id` (~10 write sites) | Caller-supplied, unverified, written as decision actor | Bound to the authenticated principal at the boundary; mismatch returns ACTOR_MISMATCH |
| `group_id` / `user_id` | Format-validated only | Reconciled against `PrincipalContext.tenantIds`; mismatch returns TENANT_MISMATCH |

### Completion Notes

- **`mcp_tokens` reused as-is.** No new migration was needed: the table already
  carries `token_hash`, `token_prefix`, `scopes`, `expires_at`, `revoked_at` and
  the `group_id` format constraint. Revocation and expiry are modelled as
  nullable timestamps; nothing is deleted or mutated destructively.
- **Audit (AC-7) is persisted, not just logged.** Each decision carries
  principal id, effective tenant, roles, session id, tool, decision, reason
  code, auth method and credential row id, and deliberately contains no token,
  no token hash and no request payload. `src/lib/auth/principal-audit.ts`
  projects it into an append-only `events` row (`event_type='mcp_auth_decision'`,
  all fields in `metadata` JSONB, per the DATA-DICTIONARY constraint that the
  hot table is not altered — no ALTER, no migration). A structured `[mcp-auth]`
  line is always written first, so the decision survives a database outage, and
  a sink failure is logged as `[mcp-auth-persist-failed]` without ever failing
  the request. (Round-1 note said persistence was a follow-up; it was wired in
  round 2 — see Finding 2.)
- **Cache policy (AC-8):** default TTL is 0 ms, so a revoked credential fails on
  the very next request. `ALLURA_MCP_AUTH_CACHE_TTL_MS` may raise it to at most
  60 s; expiry is always evaluated against the live clock even when cached, so
  only revocation can lag, and only by the configured TTL.
- **dev_local actor override is deliberate and documented.** Only a `dev_local`
  principal may name a different actor, so local curator scripts keep working.
  `dev_local` cannot activate in production (AC-1/AC-6 both throw), and it never
  escalates based on a presented token value.
- **Role model kept separate.** `PrincipalContext.roles`
  (admin|curator|viewer) is distinct from the approval-workflow `role` union in
  `src/kernel/policy.ts` and from the Clerk/Next.js auth in `src/lib/auth/*`,
  which was not touched.
- **No kernel policy shipped.** A round-1 draft registered POL-028 (that id
  chosen because POL-024 through POL-027 were already taken). It was reverted in
  round 2 as unreachable — Ruling on Finding 3.
- **Legacy shared token is gated,** not merely deprioritised: it is honoured
  only when `shared_token` is the active mode. Named residual gap recorded under
  Review Round 1.

### Verification

Deployment and the live database run on the laptop, so verification here was
restricted to typecheck, build, and in-process tests:

| Command | Result |
|---|---|
| `bun run typecheck` | pass (tsc --noEmit, no errors) |
| `bun run build` | pass (next build completed) |
| `bun run vitest run src/lib/auth/__tests__/principal-context.test.ts src/lib/auth/__tests__/principal-audit.test.ts src/lib/auth/__tests__/budget-scope.test.ts src/__tests__/mcp-auth-adversarial.test.ts --config vitest.config.unit.ts` | 151 passed / 151 (74 + 13 + 3 + 61) |
| `bun run test:unit` | 89 files passed, 8 skipped; 1782 tests passed, 171 skipped |
| `bun test packages/mcp-server/tests/mcp-server.test.ts` | 4 passed / 4 |
| `bun test scripts/ci/run-benchmark.test.ts scripts/ci/collect-evidence.test.ts scripts/ci/lint-changed.test.ts` | 18 passed / 18 |
| `bun run test` (full lane) | exited 1: 7 test files failed (including 3 Vitest mock-initialization load failures), 7 tests failed, and 1 unhandled rejection: `POSTGRES_PASSWORD environment variable is required` from `src/lib/mcp-startup.test.ts` |

All counts above are current local evidence. The Epic 24 full-test blocker is
kept explicit; it is not converted into a completion claim. Live PostgreSQL,
gateway, and remote CI evidence remain laptop/CI-authoritative follow-ups for
AC-1, AC-6, AC-7, and Story 24.1's benchmark gate.

### Adversarial Evidence Table (AC-9)

Produced by `src/__tests__/mcp-auth-adversarial.test.ts`, fully in-process. The
audit-event id column is the deterministic synthetic id the harness derives from
session/tool/reason; live `events` ids require the laptop database.

| # | Attack case | Expected status / reason | Actual | Audit event id |
|---|---|---|---|---|
| 1 | Missing Authorization header | 401 AUTH_MISSING | as expected | `evt:<session>:memory_search:AUTH_MISSING` |
| 2 | Malformed auth (6 variants: no scheme, Basic, bare `Bearer`, spaces, lowercase, embedded space) | 401 AUTH_MALFORMED | as expected | `evt:<session>:memory_search:AUTH_MALFORMED` |
| 3 | Forged role (`role:"admin"` from a viewer credential) | 403 ROLE_INSUFFICIENT | as expected | `evt:<session>:governance_curator_pass:ROLE_INSUFFICIENT` |
| 4 | Forged tenant (`group_id` outside the credential's allowlist) | 403 TENANT_MISMATCH | as expected | `evt:<session>:memory_search:TENANT_MISMATCH` |
| 5 | Forged curator id | 403 ACTOR_MISMATCH | as expected | `evt:<session>:governance_proposal_approve:ACTOR_MISMATCH` |
| 6 | Revoked token (`revoked_at` set) | 401 AUTH_REVOKED | as expected | `evt:<session>:memory_search:AUTH_REVOKED` |
| 7 | Expired token (`expires_at` in the past, and exactly now) | 401 AUTH_EXPIRED | as expected | `evt:<session>:memory_search:AUTH_EXPIRED` |
| 8 | Valid least-privilege viewer access | 200 OK | as expected, roles `["viewer"]` | `evt:<session>:memory_search:OK` |
| 9 | Unknown token prefix | 401 AUTH_INVALID | as expected | `evt:<session>:memory_search:AUTH_INVALID` |
| 10 | Valid prefix, tampered body | 401 AUTH_INVALID | as expected | `evt:<session>:memory_search:AUTH_INVALID` |

No token value appears in any assertion, log line, or artifact; the suite
asserts this explicitly.

### File List

**New**
- `src/lib/auth/principal-context.ts` - PrincipalContext contract, reason codes, tenant/workspace/actor/role reconciliation, `canRebindSession`, `guardToolCall`, audit projection.
- `src/lib/auth/mcp-authenticator.ts` - startup config resolution (AC-1/AC-6) with operator warnings, bearer extraction, timing-safe compare, gated legacy shared token, `mcp_tokens` verification, revocation/expiry, credential cache.
- `src/lib/auth/principal-audit.ts` - AC-7 persistence into the append-only `events` table (metadata JSONB), injectable sink, never-fail-closed emission.
- `src/lib/auth/__tests__/principal-context.test.ts` - 70 unit contract tests.
- `src/lib/auth/__tests__/principal-audit.test.ts` - 13 audit persistence tests.
- `src/__tests__/mcp-auth-adversarial.test.ts` - 61 adversarial/matrix tests.

**Modified**
- `src/mcp/canonical-http-gateway.ts` - removed `validateBearerAuth`/`AUTH_TOKEN`; per-request principal resolution; credential-identity session binding via `canRebindSession`; `guardToolCall` at dispatch; elevated-role gate on admin routes; persisted auth audit; health/startup banner with auth-config warnings.
- `src/mcp/memory-server-canonical.ts` - explicit service principal bound before transport connect; `guardToolCall` at dispatch; persisted auth audit routed to stderr.
- `src/mcp/curator-tools.ts` - trust-boundary documentation on the curator_id/group_id invariant (no behavioural change).
- `.env.example` - MCP transport auth configuration block, dev-mode warning, AC-7 audit note, cache policy, Finding 5 residual-gap guidance.
- `vitest.config.unit.ts` - include the new suites in the unit lane.

**Reverted after review (Finding 3)**
- `src/kernel/proof.ts` and `src/kernel/policy.ts` are back at HEAD - no kernel changes ship with this story.

### Status Evidence

Pending laptop verification (requires live PostgreSQL / running gateway):
- End-to-end 401/403 responses over real HTTP with real minted `mcp_tokens` rows.
- Persistence of AC-7 audit records into the append-only `events` table and
  capture of real audit event ids for the evidence table above.
- Production-startup refusal observed against the deployed container.

Everything else is proven by the commands in the Verification table.

## Review Round 1 - Findings and Rulings

Pike and Fowler returned CHANGES-REQUESTED. All five findings are closed.

### Finding 1 (Med) - Session binding was not tenant-safe. FIXED.

`principalId` derives from `mcp_tokens.agent_name`, which has no uniqueness
constraint (only `token_prefix` does). Two tenants can both mint a token named
"cursor", and the old check `holder.current?.principalId !== principal.principalId`
would have let the second rebind the first's live session to a different tenant.

Replaced with `canRebindSession()` (`principal-context.ts`), which compares the
credential row id plus the entire authority envelope (auth method, tenant set,
role set, workspace), and falls back to identity only for configuration-derived
principals that have no credential row. Covered by 9 unit tests plus 4
adversarial tests that mint two same-named credentials in different tenants and
assert the takeover is refused in both directions.

### Finding 2 (Med-High) - AC-7 audit persistence was never wired. FIXED.

New `src/lib/auth/principal-audit.ts`. `buildAuthAuditInsert()` projects an
`AuthAuditEvent` into an append-only `events` row as
`event_type='mcp_auth_decision'`, carrying all AC-7 fields in `metadata` JSONB.
No ALTER, no migration. `emitAuthAudit()` is fire-and-forget, never throws,
always writes the structured `[mcp-auth]` line first, and logs
`[mcp-auth-persist-failed]` if the sink fails - auth never fails closed because
audit is unreachable. Both transports call it; stdio routes the line to stderr
so the JSON-RPC framing on stdout stays intact. 13 new unit tests.

**Deviation from the review instruction, stated plainly.** Brooks specified
routing through `emitGatedAudit` -> POST /api/trace. I used `insertEvent`
directly - the exact function `/api/trace` itself calls, one layer below the
HTTP hop. Reason: `emitGatedAudit` exists only because Edge Runtime middleware
cannot import `pg`. The MCP gateway and stdio server are Node processes that
already hold a pg pool. Going over HTTP would have made MCP auditing depend on
the Next.js app being up (the gateway routinely runs standalone), required a
base-URL config the gateway does not have, and duplicated the shared secret. The
sink is injectable, so an HTTP sink can be swapped in without touching callers.
Every requirement Brooks attached - events.metadata JSONB, no migration, log
fallback, never fail closed, audit-failure logged, no raw token - is met.

### Finding 3 (Med) - POL-028 was unreachable. RULING: (b) REMOVE.

Evidence: neither `src/mcp/canonical-tools.ts` nor
`src/lib/memory/memory-coordinator.ts` imports anything from `src/kernel/`. The
kernel's `evaluatePolicies` is reached only via
`src/lib/memory/writer.ts -> syscall_mutate`, which the canonical MCP tools do
not use. So an MCP request can never populate `ProofClaims.principal`, and
option (a) is not a short wire-up - it would mean re-hosting the memory write
path on the kernel syscall layer, which is a different story.

Per Brooks' own criterion, that makes it (b). Reverted `src/kernel/proof.ts` and
`src/kernel/policy.ts` to HEAD; removed `TrustedPrincipalClaims`,
`PrincipalClaims` and `toPrincipalClaims`; dropped both kernel files from the
File List. A comment at the former call site records why, and what would make it
worth re-adding. Tenant binding remains enforced by `resolveEffectiveTenant` in
`guardToolCall`, which is in the actual request path and is tested.

### Finding 4 (Low) - workspace restriction claim deferred.

The canonical MCP boundary does not currently enforce `workspace_id`. The
principal contract therefore does not carry a workspace authority field, the
sanitizer does not claim to reconcile it, and this story does not present
workspace isolation as implemented. A future story may add the restriction at
the canonical handler boundary where it can be enforced end-to-end.

### Finding 5 (Low) - Shared token bypassed per-credential revocation. RULING: GATE IT.

The shared-token comparison now runs only when `shared_token` is the ACTIVE
mode. Setting `ALLURA_MCP_TOKEN_SECRET` is an explicit opt-in to per-caller
revocable credentials, and a leftover `ALLURA_MCP_AUTH_TOKEN` must not remain a
parallel unrevocable way in.

AC-10 is not broken by this: a deployment that has not migrated has no token
secret, resolves to `shared_token` mode, and keeps working unchanged. Only a
deployment that has *both* changes behaviour, and for that case the leftover
token was the bug.

`HttpAuthConfig.warnings` now carries operator guidance surfaced in the startup
banner: "ALLURA_MCP_AUTH_TOKEN is set but IGNORED..." in mcp_token mode, and a
"NO revocation path" warning in shared_token mode. Documented in `.env.example`.

### Known Follow-Ups (logged at review, deliberately NOT implemented here)

1. **Rate-limit or circuit-break `[mcp-auth-persist-failed]`.** Under a sustained
   database outage the gateway logs one persistence failure per request,
   unbounded. Behaviour is correct (fail-open, never blocks auth) but the log
   volume is not. Wants a rate limiter or a short circuit breaker around the
   audit sink. Raised by Fowler, round 2, non-blocking.
2. **Possible shared helper for decision-to-status mapping.** `principal-audit.ts`
   and `edge-audit.ts` both map an outcome onto a constraint-valid
   `events.status`. Today that is a one-line ternary in each, so drift risk is
   low and extracting it now would be premature. Revisit if a third caller
   appears or the mapping grows. Raised by Fowler, round 2, non-blocking.
3. **Carlos doc EDITS** for BLUEPRINT / SOLUTION-ARCHITECTURE / DATA-DICTIONARY /
   REQUIREMENTS-MATRIX / RISKS-AND-DECISIONS. The *impact* is recorded in this
   story (Documentation Impact Record, DoD item 3) and the DoD is satisfied by
   that record. The *edits* are Story 24.8's work — no document has been changed
   by this story. 24.8 must also resolve the canonical-doc-set open question
   raised in that record before it starts editing.

### Documentation Impact Record (DoD item 3)

Satisfies the Definition of Done requirement that documentation impact be
*recorded*. **No document has been edited by this story** — `git status --short
-- docs/` is empty. The edits are Story 24.8's work; this record exists so 24.8
can execute without re-deriving anything.

**OPEN QUESTION FOR 24.8 — WHICH DOC SET IS CANONICAL? UNRESOLVED. DO NOT GUESS.**

Two candidate sets carry the same five Carlos filenames, and nothing in this
story establishes which governs:

| Set | Contents | Last touched |
|---|---|---|
| `docs/allura/` | BLUEPRINT, SOLUTION-ARCHITECTURE, DATA-DICTIONARY, REQUIREMENTS-MATRIX, RISKS-AND-DECISIONS, DESIGN-ALLURA | `62d2dd5c` (2026-08-02) |
| `docs/allura-hosted/` | the same five, **plus** DESIGN-AUTH.md, DESIGN-MCP-GATEWAY.md, THREAT-MODEL.md, SECURITY.md, DESIGN-GUARD.md and others | `cd0894d7` (initial commit) |

Evidence for whoever resolves it — supplied, not decided:
- Story 24.8's own Implementation Files list names `docs/allura/*` explicitly and
  does **not** mention `docs/allura-hosted/`.
- But the four documents this story most directly invalidates — DESIGN-AUTH.md,
  DESIGN-MCP-GATEWAY.md, THREAT-MODEL.md, SECURITY.md — exist **only** in
  `docs/allura-hosted/`. `docs/allura/` has no auth or threat-model document at
  all.
- 24.8 separately plans *new* files at `docs/enterprise/threat-model.md` and
  `docs/enterprise/security-controls.md`, which overlaps what
  `docs/allura-hosted/` already holds. That collision needs deciding before
  either is edited.
- Correction to the cycle-3 brief: `docs/allura/` was last touched by `62d2dd5c`
  ("fix(review): BLUEPRINT anchor links + mermaid alias"), not by the initial
  commit. `docs/allura-hosted/` is the one still at `cd0894d7`. Neither is
  touched by this story.

Rows below name sections by heading. Where a heading exists in `docs/allura/`
the line number is from that set; the same-named `docs/allura-hosted/` document
needs the equivalent treatment if it turns out to be canonical.

| # | Document | Section / heading affected | What is now stale or missing | Concrete change 24.8 must make |
|---|---|---|---|---|
| D1 | BLUEPRINT.md | `## 7) Global Constraints`, `## 8) API Surface` | No constraint states that transport authority derives from a verified principal. The MCP API surface is described without an authentication precondition. | Add a global constraint: every MCP request resolves a `PrincipalContext` at the transport boundary before dispatch; tool arguments (`group_id`, `user_id`, `curator_id`, `role`, `workspace_id`) are resource selectors and never sources of authority. Note both transports share one chokepoint, `guardToolCall`. |
| D2 | BLUEPRINT.md | `## 9) Logging & Audit` | Does not mention the `mcp_auth_decision` event type introduced by this story. | Document `mcp_auth_decision` as an append-only `events` row emitted for every auth decision, allow and deny, with the guarantee that it never carries a raw token or token hash. |
| D3 | SOLUTION-ARCHITECTURE.md | `## 2. System Boundary and External Actors` | The MCP HTTP gateway and the stdio server are described without their now-differing identity models. | Record two authenticated entry points: HTTP resolves a per-request principal from a hashed `mcp_tokens` credential; stdio binds an explicit configured service principal at boot. Both refuse to serve anonymously in production. |
| D4 | SOLUTION-ARCHITECTURE.md | `## 4. Interface Catalogue`, `## 6. Key Architectural Constraints` | No constraint captures the removal of the dead-open default. Prior behaviour was that an unset `ALLURA_MCP_AUTH_TOKEN` disabled auth entirely and `validateBearerAuth()` returned `true`. | State the constraint: `validateBearerAuth()` and its `if (!AUTH_TOKEN) return true` default are **deleted**. Replaced by `resolveRequestPrincipal()` over `McpAuthenticator`. Production startup throws `CONFIG_MISSING` when no supported auth configuration is present, and `DEV_MODE_FORBIDDEN` if dev mode is requested in production. |
| D5 | SOLUTION-ARCHITECTURE.md | `## 6. Key Architectural Constraints` | Nothing records that kernel policy does **not** enforce principal binding. Risk of a future doc asserting kernel-level enforcement that does not exist. | Record explicitly: tenant/role binding is enforced at the **transport boundary only** (`resolveEffectiveTenant` / `authorizeToolCall` inside `guardToolCall`). `src/kernel/` is **not** involved — the MCP dispatch path does not import it. See Ruling on Finding 3. Do not describe kernel policy as an auth control. |
| D6 | DATA-DICTIONARY.md | `## PostgreSQL: `events`` | The `events` table is documented without the new `mcp_auth_decision` event type or its metadata contract. | Add an `mcp_auth_decision` subsection: `event_type='mcp_auth_decision'`; `group_id` = effective tenant, falling back to `allura-system` when a request is refused before a tenant resolves; `agent_id` = principal id or `anonymous`; `status` = `completed` on allow, `failed` on deny (constrained by `chk_events_valid_status`). `metadata` JSONB keys: `principal_id`, `effective_tenant`, `roles`, `session_id`, `tool`, `decision`, `reason_code`, `auth_method`, `credential_id`, `occurred_at`. State that no schema change was made — the hot table was not altered and no migration was added. |
| D7 | DATA-DICTIONARY.md | new section, adjacent to the `events` entry | `mcp_tokens` is not documented in `docs/allura/DATA-DICTIONARY.md` at all, despite being the credential store this story depends on. (It is documented in `docs/allura-hosted/DATA-DICTIONARY.md`.) | Document `mcp_tokens` as the MCP credential table, **reused as-is** by this story: no new credential table, no migration. Raw tokens are never stored — HMAC-SHA256 `token_hash` plus a display `token_prefix` (unique, the lookup key). Revocation and expiry are the nullable `revoked_at` / `expires_at` timestamps; rows are never deleted or destructively mutated. Note `agent_name` has **no uniqueness constraint**, which is why session rebinding compares `id`, not `agent_name` (review Finding 1). |
| D8 | DATA-DICTIONARY.md | `## Environment Variables` | None of this story's auth configuration is listed. | Add, with production semantics: `ALLURA_MCP_TOKEN_SECRET` (>=16 chars, selects `mcp_token` mode), `ALLURA_MCP_AUTH_TOKEN` (legacy `shared_token` mode), `ALLURA_MCP_DEV_AUTH` (`dev_local`, refused in production), `ALLURA_MCP_DEV_PRINCIPAL_ID` / `_DEV_TENANTS` / `_DEV_ROLES`, `ALLURA_MCP_SHARED_TOKEN_PRINCIPAL` / `_TENANTS` / `_ROLES`, `ALLURA_MCP_SERVICE_PRINCIPAL_ID` / `_SERVICE_TENANTS` / `_SERVICE_ROLES` (required for stdio in production, wildcard forbidden), `ALLURA_MCP_AUTH_CACHE_TTL_MS` (default 0, capped at 60000). |
| D9 | REQUIREMENTS-MATRIX.md | `## Governed Memory Pipeline — Business → Functional Traceability` | No traceability row maps the authenticated-principal requirement to its enforcement point and evidence. | Add rows tracing AC-1..AC-10 of Story 24.2 to `src/lib/auth/principal-context.ts`, `src/lib/auth/mcp-authenticator.ts`, `src/lib/auth/principal-audit.ts`, with evidence pointing at the 144-test suite (`src/lib/auth/__tests__/`, `src/__tests__/mcp-auth-adversarial.test.ts`). Classify AC-1, AC-6 and AC-7 as implemented-but-not-yet-verified-on-live-infrastructure, matching the `[~]` marks in this story. |
| D10 | RISKS-AND-DECISIONS.md | `## Architectural Decisions` | No ADR exists for the principal-context contract. | Add an ADR: transport-independent `PrincipalContext` (`principalId`, `tenantIds`, `roles`, `authMethod`, `sessionId`, plus credential-derived `credentialId` and `expiresAt`; frozen). Workspace restriction is explicitly deferred until a canonical handler can enforce it. Alternatives considered: per-tool ad-hoc checks; a kernel-policy layer (rejected — unreachable, Finding 3). Consequence: one chokepoint, `guardToolCall`, shared by HTTP and stdio. Rollback: revert to shared-token mode via `ALLURA_MCP_AUTH_TOKEN`. |
| D11 | RISKS-AND-DECISIONS.md | `## Architectural Decisions` | No ADR records the three auth modes or the production fail-closed rule. | Add an ADR covering `mcp_token` / `shared_token` / `dev_local`, the selection precedence, production fail-closed startup, and the rule that `dev_local` cannot activate in production. |
| D12 | RISKS-AND-DECISIONS.md | `## Risks` | The Finding 5 residual gap is not recorded as a risk anywhere outside this story and `.env.example`. | Add the named residual risk: **the legacy shared bearer token has no per-caller identity and no revocation path.** AC-8 revocation covers `mcp_tokens` rows only. In `shared_token` mode a leaked credential can be revoked only by rotating `ALLURA_MCP_AUTH_TOKEN` and restarting, cutting off every caller at once. Mitigation: the token is now inert whenever `mcp_token` mode is active, and the gateway logs an `[auth-config]` warning. Operator guidance: mint `mcp_tokens` credentials, set `ALLURA_MCP_TOKEN_SECRET`, then unset `ALLURA_MCP_AUTH_TOKEN`. |
| D13 | RISKS-AND-DECISIONS.md | `## Risks` | The unbounded `[mcp-auth-persist-failed]` log under sustained database outage is not recorded. | Add as a low-severity operational risk with the accepted follow-up (rate limit or circuit breaker). Note the behaviour is deliberately fail-open: authentication never fails because auditing is unreachable. |
| D14 | `docs/allura-hosted/DESIGN-AUTH.md` — **only if that set is canonical** | whole document | Predates this story entirely; describes MCP auth without `PrincipalContext`, without the three modes, and without the dead-open removal. | Rewrite the MCP transport auth section against `src/lib/auth/principal-context.ts` and `mcp-authenticator.ts`. Must not conflict with the Clerk/Next.js web-app auth in `src/lib/auth/api-auth.ts`, which this story did **not** touch, nor with the approval-workflow `role` union in `src/kernel/policy.ts`, which is a different concept from `PrincipalContext.roles`. |
| D15 | `docs/allura-hosted/DESIGN-MCP-GATEWAY.md` — **only if canonical** | gateway request lifecycle | Describes the gateway without per-request principal resolution or session-to-credential binding. | Document the lifecycle: authenticate every request (not only session initialize, so revocation applies on the next call); bind the MCP session to the **credential identity** via `canRebindSession`; `guardToolCall` before dispatch; `requireElevatedPrincipal` on `/api/admin/*`; verified principal on `/metrics`. |
| D16 | `docs/allura-hosted/THREAT-MODEL.md` and `SECURITY.md` — **only if canonical**; otherwise 24.8's new `docs/enterprise/threat-model.md` | trust boundaries, attack trees | No coverage of role forgery, tenant forgery, actor forgery or session takeover at the MCP boundary. | Add the trust boundary and the mitigated attack set, each traceable to a test in `src/__tests__/mcp-auth-adversarial.test.ts`: missing auth, malformed auth, forged role, forged tenant, forged curator id, forged workspace, revoked token, expired token, unknown token, tampered token body, and same-`agent_name` session takeover across tenants (Finding 1). |

**Guard-rail for 24.8 (AC-9/AC-10 of that story):** any assertion that kernel
policy enforces principal or tenant binding is false and must fail review. The
only enforcement points are `resolveEffectiveTenant`, `resolveEffectiveActor`
and `authorizeToolCall`, all reached through `guardToolCall`.

### Named Residual Gap

**The legacy shared bearer token has no per-caller identity and no revocation
path.** AC-8 revocation covers `mcp_tokens` rows only. A deployment that runs in
`shared_token` mode can revoke a leaked credential only by rotating
`ALLURA_MCP_AUTH_TOKEN` and restarting, which cuts off every caller at once.
Operator guidance: mint `mcp_tokens` credentials, set `ALLURA_MCP_TOKEN_SECRET`,
then unset `ALLURA_MCP_AUTH_TOKEN`. Recorded in `.env.example` next to the
setting.

## Change Log

| Date | Change | By |
|---|---|---|
| 2026-08-15 | Review round 3 (docs only): added the Documentation Impact Record (16 rows, D1-D16) satisfying DoD item 3 by record per Brooks' ruling; edits deferred to Story 24.8. Recorded the unresolved canonical-doc-set question (`docs/allura/` vs `docs/allura-hosted/`) with supporting evidence and no guess. Noted `planning docs/` does not exist in this repo. No file under `docs/` was edited. | Woz (Team RAM) |
| 2026-08-15 | Review round 2 (docs only, no code change): corrected Scope and Implementation Files, which still claimed kernel policy threading after the Finding-3 revert; swept the whole story and additionally corrected Implementation Plan step 6, the stale AC-7 "persistence is a follow-up" note, and the POL-028 note; recorded as-built Architectural Contract, the review-time descope in Out of Scope, evidence-ID qualification, honest per-item Definition of Done (one item marked NOT DONE), and three known follow-ups. | Woz (Team RAM) |
| 2026-08-15 | Review round 1: session rebinding now compares credential identity (F1); AC-7 audit persisted to `events.metadata` JSONB (F2); POL-028 and all kernel changes removed as unreachable, ruling (b) (F3); workspace restriction claim deferred because the canonical boundary does not enforce it (F4); legacy shared token gated out of mcp_token mode with a named residual gap (F5). 144 auth tests, 0 regressions. | Woz (Team RAM) |
| 2026-08-15 | Story 24.2 implemented: PrincipalContext contract, MCP credential authenticator over existing `mcp_tokens`, principal-derived authorization at both MCP transports, POL-028 tenant binding, 109 new tests (57 unit + 52 adversarial). Live-infrastructure evidence pending laptop verification. | Woz (Team RAM) |
| 2026-08-16 | Documentation-only verification receipt: focused 24.2 auth suite passed 151/151; `bun run test:unit` passed 89 files / 1782 tests with 8 files / 171 tests skipped. Full `bun run test` exited 1 with 7 failed test files, 7 failed tests, and one unhandled missing-`POSTGRES_PASSWORD` rejection from `src/lib/mcp-startup.test.ts`. Story remains in-review; no code change or completion claim. | OpenCode |
