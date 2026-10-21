# AD-71 clean-install preparation: interface review

AI-Assisted Documentation: independent Pike review, 2026-10-20. Only this report is authored by this reviewer. The producer owns the nine source/test files below; Knuth separately owns the [database contract review](clean-install-db-contract.md). Review scope is AD-71 local preparation in [RISKS-AND-DECISIONS](../../allura/RISKS-AND-DECISIONS.md), with the [trial handoff](clean-install-handoff.md). This review grants no execution, merge, provisioning or publication authority.

## Findings and disposition

**P2, resolved — mounted-secret parse failures could print the input.** The original `Dockerfile.mcp` entry evaluated `JSON.parse(readFileSync(...))` through an unhandled validation chain. A malformed file containing a plaintext credential could place that credential in the runtime's parse exception. A synthetic-only Bun reproduction with `SYNTHETIC_TRIAL_SECRET_MARKER_FOR_REVIEW` confirmed that `String(error)` included the marker. No actual secret was read.

The current entry catches read, JSON and schema failures before setting environment variables or importing the gateway (`docker/first-use/Dockerfile.mcp:14`). It prints exactly `First-use secret configuration invalid`, then exits 1. The pure parser independently replaces diagnostics with `FIRST_USE_SECRET_CONFIGURATION_INVALID`, without an attached cause (`scripts/first-use-local-fixture.ts:15`). This is the smallest correction: the secret boundary owns error sanitization, so each caller need not scrub parser output.

The final regression executes the extracted actual entry body with inert read/process/import seams and the real parser. Malformed JSON, invalid schema and read failure produce the fixed stderr, exit 1, an unchanged synthetic environment and no gateway import. Valid synthetic configuration reaches only the inert import. Parser cases also confirm the marker and cause are absent. **No remaining blocker found for this bounded local preparation.** This is not a working-install verdict.

## Contract checks

| Caller obligation / boundary | Source finding and limit |
|---|---|
| Isolated resources | The standalone model declares project-owned PostgreSQL/model volumes and a trial network, with no fixed container names, external resources, inherited deployment env files, primary-stack names or host provider address. Only API port `127.0.0.1:6487` is published. CPU, memory and process limits are explicit. Project/image variables remain operator inputs; their presence alone proves neither ownership nor reviewed image identity. |
| Build and secrets | Dockerfile-specific allowlists start by excluding everything, admit the required manifests/source/SDK build, then exclude nested env, private fixture, secret and key paths. No blanket `COPY . .`, secret build argument or baked secret is used. Runtime secrets come from explicit mounted trial-only files. Docker's actual context selection and image build were not exercised. |
| Gateway entry | The entry dynamically imports the actual `canonical-http-gateway.ts` after validated secrets. That source starts its listener at module load; the trial does not rely on an idle stdio process or an absent `import.meta.main` branch. The profile selects production token authentication and restricted `allura_app`, with no dev/shared-token fallback. Auth, actual grants and app-role password provisioning remain unverified. |
| Provider identity and shape | Readiness checks the actual inventory for the reviewed full SHA-256 model digest, tolerating only the optional `sha256:` prefix. It separately requests the model's `/v1/embeddings` response, checks HTTP success, exactly one 1024-element finite numeric vector and rejects an all-zero vector. Model pull requires an explicit allowance. These checks establish neither actual model availability nor database compatibility until executed. |
| Plans cannot provision | `buildFirstUseFixturePlan` validates exact trial/project/database/principal identities, tenant, read/write-only scopes, bounded expiry, prefix/hash and digest syntax. It returns `executable: false` and `NO_VERIFIED_MCP_DATABASE_ADAPTER`; it performs no I/O, secret generation, SQL, connection or subprocess operation. A valid-looking digest is not registry verification. |
| Observations remain untrusted | `assessFirstUseObservation` rejects unknown/foreign states, wrong target/owner, unexpected rows, partial empty state and mismatching existing tenant/workspace/token/hash/scope/expiry. Matching observations still return `executable: false`. Caller-provided truth cannot confer authority. There is no upsert, reset, reassignment or automatic credential reissue path. Atomicity, concurrent provisioning and uncertain-commit reconciliation remain future adapter obligations, not tested capabilities of this helper. |
| Schema correction stays blocked | The candidate SQL is excluded from automatic initialization. It checks the expected trial database, locks the table, refuses RLS-filtered visibility, refuses any row and unexpected column/index state, then proposes only the known empty 4096-to-1024 alignment. No null rewrite, trace mutation, index drop or grant is added. This review does not certify SQL execution; Knuth's separate review governs data details and the future adapter must verify actual ownership and target inside its atomic boundary. |
| No authority by profile name | `preparation_only`, `provisioned` and the blocked-state extension are descriptions/operator selections. They are not a trusted authorization gate. A verified permitted database adapter and explicit trial-resource authority remain required before any schema/fixture execution or service trial. Existing Brain connectivity does not grant those capabilities. |
| Honest readiness and recovery | TCP `pg_isready` avoids accepting the temporary socket-only init server, but remains process readiness. `/live` is also process health. Neither proves initialized schema, auth, persisted retrieval, recovery or human approval. Matching plan observations are only negative offline checks; no restart/recovery or credential-delivery operation exists in this slice. |

## Reproducible validation

Independent final command:

```sh
bun run test:unit tests/scripts/first-use-local-fixture.test.ts tests/scripts/first-use-profile.test.ts
```

Result: **54/54 passed**, 41 fixture/parser/provider cases and 13 profile/entry cases; exit 0. Scoped `git diff --check` also exited 0. The suite checks real pure validators and an inert entry-body harness; the profile assertions are offline source/model checks, not Docker or SQL execution.

Earlier versions passed 47 offline cases before the secret fix. The first subprocess regression attempt produced **50 pass / 3 fail** because all three `spawnSync bun` calls returned `EPERM` before executing the child. This is an observed test-execution error, not a credential leak or a runtime-permission decision. An explicit Bun-hosted Vitest attempt made no completed test report and was interrupted with exit 130. The producer replaced that denied lane with the final inert harness. No successful subprocess, image build or container-start result is claimed.

Source inspection was read-only. No daemon, model download/request, database query/DDL, credential generation/access, configuration, deployment or semantic promotion was performed. Source/context evidence was reused from the coordinated AD-71 reviews; no external API contract was changed by this review.

## Frozen source fingerprints

| File | SHA-256 |
|---|---|
| `docker-compose.first-use.yml` | `e496e5603fb9dacf41d1f49d803c4af1a4ffb5b71be3340970c26982d9528f61` |
| `docker/first-use/Dockerfile.mcp` | `2b8ecb881595ea689c68f1c154fcbe5520af257734d1e16ea7b8f53f99125fd8` |
| `docker/first-use/Dockerfile.postgres` | `1eab2a2a1b18086a1a68804d0f7cfc20091f2d77b457c40154729e3eea67ac66` |
| `docker/first-use/Dockerfile.mcp.dockerignore` | `5f4585a7fc25e09c0c5259ef7a0d926a5c999c63cd6e5aee28e29b0e73ec4482` |
| `docker/first-use/Dockerfile.postgres.dockerignore` | `1252a6b8ae5023667f752a5ac3a0fdd70958081d8da14f89c0320669b579c37e` |
| `docker/first-use/empty-schema-alignment.sql` | `aff0c96093353f53de979203ee7cb93faca770e78b737980a1ef3b0a93e49141` |
| `scripts/first-use-local-fixture.ts` | `006e4a669ce86d1f1bfa0dfa0abe5f8b0aaa7d69078467766b62d30adc72ee80` |
| `tests/scripts/first-use-local-fixture.test.ts` | `9f30c5b751b08d475bd7c05f399dbd78dba493009a78110bd487f3f8a0613963` |
| `tests/scripts/first-use-profile.test.ts` | `210388d5899d61bbc2e05d5dd8bce242a3d6d3b918465ef8274c10f11eb00f5f` |

## Remaining gates and memory evidence

The future permitted adapter, exact target verification, atomic scoped bootstrap and explicit trial-resource/model/build allowance remain open. Fresh initialization, final schema/index dimensions, restricted effective role, real authenticated workspace binding, actual provider response, separate-session exact-record discovery, unprimed newcomer discovery and persistent restart/dependency recovery remain unexecuted. Production onboarding, independent human review and five observed participants are separate unresolved results. Remote deployed revision is unknown; this local preparation does not repair or prove the configured remote service.

Scoped Brain hydration used `group_id: allura-system`, `status: all`, limit 3, trajectory `a01ad315-47ef-4da9-87d5-9541cc4fb548`. It returned three historical August 28 records, not current AD-71 evidence. Unrelated content was not reproduced. The parent explicitly coordinates the single outcome write/readback to avoid duplicate events; no child outcome write was initiated and no receipt is claimed here. No semantic approval is requested.
