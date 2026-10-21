# Clean-install operator handoff

> AI-Assisted Documentation: infrastructure proposal, 2026-10-20. Owner: Hightower; architecture decision: Brooks. This is a correction specification and operator handoff, not a runnable installation recipe or deployment approval. Only this document changed.

The connected-agent guide continues to use the already provisioned Allura connection. A clean-install trial is a separate test: a newly initialized memory service, an explicitly authorized client, a compatible embedding provider, two client sessions, and an inspectable result. Do not reuse production integration credentials to make that trial pass.

**Current access instruction:** use the existing `allura-brain` MCP connection for Allura access. Gilliam verification receipt `d6db87ea-9386-4e5d-848d-ea2072bbd798` in `allura-system` records successful configured-launcher/search/write checks; the parent has independently read that exact receipt. Do not request a production token or retrieve credentials for this trial. Report any actual tool failure by its exact error separately from runtime/resource approval requirements. Connection verification is not trial approval.

## Current evidence

- Scout inspected the actual Compose, initialization, authentication and provider sources; [recon and fingerprints](clean-install-recon.md) identify the scope. Its scoped Brain search `0f6e0c7f-b161-4289-9d9f-91215dfaf622` returned three historical, unrelated records, not an installation receipt. Outcome `5de1151a-e189-4cfd-baf9-1ffbb8263e93` does not establish human approval merely because semantic storage was reported.
- Two Compose models passed offline parsing without deployment-env reads, and four bootstrap scripts passed shell syntax checks. These checks do not run image builds, migrations, authentication or retrieval.
- The parent's approved read-only `docker version` check returned server `29.2.1`. The initial sandbox socket denial is not evidence that the daemon is unavailable. Read access does not authorize creating trial resources.
- Primary Compose binds fixed container names, external networks and `memory_postgres_data`. A new project name alone cannot isolate it. The portfolio file supplies disposable PostgreSQL, not the full service.
- `getAppPool()` requires restricted app-role credentials. The HTTP token path requires a provisioned workspace-bound credential. A signing secret alone supplies neither an initial workspace nor a usable client. Next.js admin routes exist in source, but the primary MCP stack does not run that application or establish its initial administrator. That is a production-bootstrap gap; the synthetic local-trial option below can be prepared without pretending it solves production onboarding.

Context7: required yes; reused Scout's `/docker/compose` receipt on fixed/external resources, project isolation and no-env-resolution config validation. A focused `/llmstxt/ollama_llms-full_txt` query confirms the OpenAI-compatible embedding endpoint accepts `model`, string `input` and `dimensions`; [official compatibility reference](https://docs.ollama.com/api/openai-compatibility) and [Qwen3 embedding library](https://ollama.com/library/qwen3-embedding) support the proposed local provider family. Actual image/model identity, dimensions and readiness still require the trial checks below. Future configuration changes require a documentation refresh for newly selected external behavior.

## Proposed correction slice

Paths marked **proposed** are implementation destinations, not files already created. Keep primary-stack repair and the isolated evaluation entry point explicit; never convert primary external storage to fresh project storage in place.

| File / surface | Inspected failure or missing contract | Intended bounded correction | Acceptance before recommendation |
|---|---|---|---|
| `scripts/brain-stack.sh` | Readiness points to `5888`; Compose publishes `6477`; service/restart and volume arrays retain Neo4j | Reconcile supported services, readiness URL and resource inventory with the actual primary model; preserve existing primary PostgreSQL data | Mocked command tests prove exact services/resources and consistent host readiness; no Docker writes during unit checks |
| `scripts/first-run.sh`, `scripts/first-run-setup.sh`, `scripts/validate-env.sh` | Older network bootstrap omits one declared network; retired Neo4j requirements; inconsistent required env files and local-provider requirements | Consolidate or explicitly retire duplicate entry points after the supported route is selected; validate required names without printing values | Missing prerequisites fail before resource creation; local-provider path does not require an unrelated cloud key; retired services absent |
| `.env.example` and secret-schema/preflight surface | Restricted app-role variables are absent; service workspace binding and provider settings need route-specific treatment | Document required non-secret variable names and conditional requirements; use approved secret injection; distinguish HTTP token and service/stdio profiles | Owner credentials cannot substitute for the app role; chosen transport lacks no required workspace binding; secret values absent from logs and receipts |
| `Dockerfile.mcp` or a reviewed evaluation image target | Floating Bun major and non-frozen dependency install; image default is an idle stdio execution target while Compose overrides it | Pin the reviewed runtime/image identity and dependency contract; make the selected HTTP command/readiness explicit | Clean image build with recorded digest and lockfile; gateway starts from that image without hidden host files or an idle-process false positive |
| **Proposed** `docker-compose.first-use.yml` | No complete standalone evaluation service model | Separate project-owned PostgreSQL, MCP and selected provider resources; no inheritance of primary external names; bounded resources and loopback access | Rendered model contains no primary names/external resources, no wildcard binding, no default production-secret file; empty-database run succeeds after authorization |
| `docker/postgres-init/` and **proposed** `scripts/first-use-local-fixture.ts` | Table/role creation does not establish the first authorized workspace-bound caller; existing CI provisioner is broader than this task | Prepare a guarded synthetic fixture using existing workspace/token/hash contracts, only for the isolated trial. Knuth/Pike review the target guard and permitted database-tool adapter before execution | Empty trial database reaches the expected schema; restricted app role is effective; scoped client authenticates through existing HTTP token path; wrong target/foreign scope/production mode fail before fixture writes |
| `src/lib/ruvector/embedding-service.ts` and selected provider configuration | Provider/model is external to the primary stack; current client requests 1024 dimensions and allows null vectors on failure | Select one reviewed compatible provider/model route; expose provider/indexing failure separately from successful capture | Actual embedding shape matches schema; failed provider is observable; a successful save with null embedding is not counted as retrieval-ready |
| `src/lib/health/probes.ts`, trial preflight and shared guide | Container readiness alone does not prove authorized persistence/search | Separate process, database/app-role, provider and authenticated journey checks; document expected failure/recovery | A ready process with failed auth/provider cannot produce a journey pass; exact saved-record discovery succeeds in the second session |

No configuration, script, migration, image, runtime or secret change in this table has been implemented by this handoff.

## Concrete synthetic bootstrap option

Further source inspection found enough existing seams to prepare a nonproduction trial bootstrap now. Production operator input is not a prerequisite for writing and testing that local source:

| Existing seam | Reusable contract | Required trial-specific restriction |
|---|---|---|
| `docker/portfolio-postgres/Dockerfile` and `99-portfolio-demo-workspace.sql` | Current schema initialization plus an explicitly synthetic workspace fixture | New standalone image/profile, persistent project-owned volume, unique trial workspace and no shared resource inheritance. Do not execute the portfolio fixture's upsert against another database |
| `scripts/ci/provision-benchmark-auth.ts` | Existing resolve/create workspace → mint workspace-bound token → private credential-file pattern | Do not run unchanged: it grants promotion/review scopes and has no sufficient isolated-target guard. A new helper must verify the trial target, bind exact tenant/workspace, and allow only `memory:read`/`memory:write` |
| `src/lib/mcp-token/hash.ts` | Existing `generateToken`, HMAC hash, lookup prefix and constant-time verification | Generate trial-only material during authorized execution; never log raw tokens/signing secrets. Keep raw client material in a private ignored file or approved secret channel; persist only the hash/prefix |
| `src/lib/workspace/repository.ts`, `src/lib/mcp-token/repository.ts` | Existing workspace and token record shapes; token carries group/workspace/agent/scopes | Reuse record semantics, not unguarded owner-pool calls. Some helper reads omit an explicit tenant argument; the trial adapter must bind `group_id` on every scoped read/write and use the repository's permitted MCP database surface |
| `src/lib/auth/mcp-authenticator.ts` | Existing `mcp_token` mode derives principal, workspace and scopes from a verified credential row | Exercise this real path with a synthetic client; do not alter authentication, inject a forged transport principal, or fall back to workspace-less dev/shared-token branches |

The local fixture should use `allura-system` only within the new isolated database and explicitly labeled synthetic workspace/principal identities, for example a unique trial workspace and `first-use-eval-agent`. These are fixture identities to be reviewed, not guessed identities for the configured service. Seed no memories, proposals, approvals or historical activity: the first-use runner must create and later discover its own decision.

The new helper needs a pure fixture/credential assembly seam and an execution adapter. The execution adapter must require explicit trial acknowledgement, a nonproduction mode, the expected newly created Compose project/container/database identity and the expected empty or matching trial fixture state. It must reject a different host/database, unexpected existing data, a workspace belonging to another group, or production mode before writes. Loopback alone is not a sufficient target guard. Do not import a default deployment-env/owner-pool connection as a convenience.

Database execution must remain on the permitted MCP database-tool surface; an existing helper's direct PostgreSQL calls do not waive that rule. The exact adapter capability must be verified before a runnable command is documented. This is a reviewable implementation dependency, not a request for the operator to invent bootstrap steps or supply the configured production token.

`scripts/bootstrap-fixtures.ts` is not an alternative: it fails deliberately before its old direct-call flow and contains stale fixture/promotion behavior. Leave it out of this trial.

### Minimal bootstrap interface for implementation

These are proposed internal interfaces, not registered tools or executable commands:

1. **Pure plan assembly:** `buildTrialFixturePlan` accepts the reviewed trial identifier, expected project/container/database identity, `group_id: allura-system`, unique synthetic workspace/principal IDs, read/write-only scopes, bounded expiry and generated token prefix/hash. It produces a schema-checked plan; raw tokens and signing secrets never enter the database plan, report or stdout.
2. **Target verification:** a permitted MCP database adapter must confirm the exact expected database identity and scoped fixture state, matched to the newly created Docker project/container evidence. Reject production mode, unknown resource ownership, primary names, a non-loopback host allocation where used, an unexpected existing volume/database, a foreign workspace binding or unexpected pre-existing fixture state. Do not accept a boolean supplied by the caller as proof of verification.
3. **Scoped provisioning:** `provisionTrialFixture(plan, verifiedAdapter)` inserts only the explicitly authorized synthetic workspace and its token record, using the existing schema and hash format. Bind `group_id` and workspace on every scoped query. Prefer one verified atomic transaction; if the exposed tool cannot provide that, Knuth must approve an equivalent atomic operation before execution. Do not fall back to direct owner-pool calls, `docker exec`, unscoped reads, raw token SQL or a global grant.
4. **Repeat/recovery behavior:** a restart reuses the recorded private credential and matching workspace/token fixture; it does not silently mint another token, reassign an existing workspace, reset app-role passwords or overwrite rows. A partial or mismatching bootstrap stops for reconciliation. Output only non-secret fixture IDs, target identity, operation status and evidence references.
5. **Private delivery:** a separate runtime-only credential writer follows the existing provisioner's restricted-file pattern or an approved secret channel, and refuses to overwrite an unexpected existing target. No trial secret is generated by this handoff. The client runner receives the private token through the reviewed injection path, never a copied production credential.

The exact MCP adapter/tool contract is the remaining interface to verify while preparing source. It need not block the pure plan, guard, profile and mocked tests, but it must block live bootstrap until verified. Existing schema helpers supply the record model; they are not themselves permission to invoke privileged database writes.

### Provider included in the trial

Prepare a project-owned local Ollama service and a deliberate model-provisioning step, using the source's `qwen3-embedding:0.6b` candidate rather than silently inheriting the host provider. Pin/review the image and resolved model identity during implementation. Its endpoint should remain on the trial network; the memory service uses `/v1/embeddings` with the configured model and requested 1024 dimensions. Before first use, require a real request returning the expected finite numeric vector shape and verify compatibility with the initialized database schema. Model pull, memory/disk allowance and warm-up time must be explicit parts of runtime approval.

A canned embedding, null vector or raw-event fallback is not a pass for provider/index readiness. Preserve a failed-provider observation and verify recovery after restoring the dependency. The exact marker/ID round trip and natural-language discovery are different checks: record the former's bounded result, then test the newcomer question separately without ID or marker priming. No current natural-language retrieval success or latency promise is established by this proposed route.

## Reviewable trial design

The preferred bounded design is a standalone Compose project on an authorized daemon. A separate physical host is optional; resource ownership is mandatory. The following are proposed settings, not reservations or evidence that ports are free:

| Boundary | Proposed setting / owner |
|---|---|
| Project identity | Operator-approved unique evaluation project; capture its resolved project/resource IDs before start |
| Storage | Project-owned persistent PostgreSQL volume, initially empty, using synthetic trial data; retain across stop/start for the durability check |
| Network | Project-owned network; no primary-stack or shared external network |
| Access | Gateway on loopback high port, for example `127.0.0.1:6487`; internal gateway port also in the permitted API band. Default to no host PostgreSQL binding; any required approved-tool connection gets an explicit loopback-only allocation |
| Capacity | Operator supplies CPU/RAM/disk/model limits and pull/build allowance before execution; no automatic unbounded model download |
| Identity | Reviewed synthetic trial workspace/principal and read/write-only client credential using existing HTTP token contracts; explicit authorization to execute that guarded bootstrap. Production onboarding remains separate; no owner-role service fallback, wildcard grant or anonymous mode |
| Provider | One compatible, reviewed model/provider route with explicit ownership and readiness; never silently use a production provider or token |
| Data/reviewer | Synthetic decision fixture only. An independent authorized reviewer is a separate actor, with separate approval evidence |
| Cleanup | Stop only recorded trial resources. Retain evidence and persistent data through review; volume deletion requires explicit approval identifying that trial volume. No global prune or primary-stack cleanup |

The profile and guarded fixture must be rendered/tested and independently reviewed before any runtime command is approved. If the permitted tool adapter cannot execute the scoped fixture safely, leave that execution dependency open; do not seed guessed identities in the configured service or edit shared grants.

## Execution and evidence sequence

1. **Prepare and review the route.** Implement the standalone profile and guarded synthetic fixture against the source seams above. Record the exact source revision, proposed daemon/context, project identity, resource bounds and persistence/cleanup policy. Brooks signs off the bounded design; Knuth/Pike review initialization, scope and the tool adapter. This document does not supply those approvals.
2. **Prepare without starting.** Implement only the accepted slice; render the isolated model with safe placeholder configuration; check resource names/bindings and secret handling. Run shell/preflight tests with mocked process results. Publish the exact reviewed commands and expected outcomes in the optional operator guide.
3. **Run only after runtime authority.** Record image/runtime/lockfile identities and empty-volume initialization. Use permitted tool surfaces for database work; no direct SQL or `docker exec` workaround. Verify the restricted role and real caller scope without recording secret values.
4. **Exercise first use.** Use the [two-session runner](../../../scripts/first-use-memory.ts) or an equivalently recorded transport check. Save once, retain ID/content/source/review state, end the first session, initialize another, then discover the same record in the same authorized scope. Exact-ID reconciliation after a miss is a separate observation. Do not retry an uncertain save blindly.
5. **Exercise failure and recovery.** In this trial only, observe an unavailable dependency and its reported degraded/failure state; restore it using the reviewed recovery command. Stop/start without deleting the volume and demonstrate record persistence. Preserve failed receipts and manual interventions. A process restart or health response alone cannot pass retrieval recovery.
6. **Exercise review separately.** Observe the independent authorized human decision and durable receipt through the provisioned curator workflow. A score, semantic storage label or agent assertion is insufficient. Do not make the agent approve its own result.
7. **Close with evidence.** Record exact commands, revisions, session distinction, successful and failed checks, operating/reviewer effort and cleanup disposition. Keep clean installation, configured-service verification and the five-person study as separate results in the [execution checklist](execution-checklist.md).

## Exact remaining approval after source preparation

Local profile, fixture and offline test preparation can proceed under the current goal. Before execution, present that concrete reviewed result to the operator. The needed runtime decision is:

> Authorize **[reviewed profile/fixture revision]** on **[named daemon/context or evaluation host]**, creating only **[listed trial resources]** within **[capacity limits]**, including the reviewed synthetic workspace/principal through **[verified permitted database-tool adapter]**. Trial credentials stay in **[reviewed private delivery mechanism]**. Retain **[trial volume]** through the restart/recovery check; approve deletion separately. Use **[reviewed provider/model and pull allowance]**.

This is non-secret authority information. Do not paste tokens, passwords, signing secrets or deployment-env contents into chat. The existing `mcp.faithmeats.org` connection remains usable for its authorized connected-agent task and is not a substitute bootstrap target. A passing synthetic local trial proves its stated setup/save/search path; it does not establish production administrator onboarding or the independent human-review gate.

## Validation and memory status

Hightower loaded the full local role, context index and `mcp-docker`, `mcp-harness`, `varlock`, and governed memory skills, reused the fresh scoped parent/Scout receipts, and independently inspected the primary Compose/image, lifecycle script, app-role connection, workspace/token routes, embedding client, synthetic workspace image/fixture, benchmark provisioner and token hash/record helpers. Only local report link/whitespace checks were performed in this slice. No build, deploy, migration, auth request, model request or recovery run occurred.

At task start the child memory tools were unavailable; the coordinated parent outcome will include this report and its limitations. No child memory write or semantic promotion is claimed here.
