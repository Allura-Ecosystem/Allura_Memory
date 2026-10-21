# Clean-install fixture and database-tool contract

AI-assisted read-only Knuth review, 2026-10-20. Only this report is written. No database, container, credential, MCP configuration or source implementation was changed. [Hightower's handoff](clean-install-handoff.md) supplies the trial boundary; this review identifies the database conditions it must satisfy.

## Invariant and schema

A workspace is a sub-scope of one `group_id`; a token identifies a caller inside that same workspace. The trial must create only its synthetic workspace and a bounded read/write credential. It must create no memories, proposals, approvals, reviewer grants or historical activity. The later client must write its own decision.

| Record / source | Actual contract | Trial requirement |
|---|---|---|
| `workspaces`, init27 | Global text `workspace_id` primary key; strict tenant pattern; name; normal/read-only/other lock modes; timestamps; creator | Unique synthetic ID, explicit `allura-system`, synthetic name/creator, normal lock mode. Existing foreign or mismatching identity is an error, not a rename/upsert opportunity |
| `mcp_tokens`, init28/62 | Text token ID; tenant/workspace, caller name, unique prefix, hash, scopes, expiry/revocation; optional paired-device ID | New synthetic caller; exactly `memory:read` and `memory:write`; finite reviewed expiry; no paired device or review/promotion/admin scope |
| init39 | Unique workspace tenant/ID pair and additional composite token foreign key, marked NOT VALID for historical rows | The composite constraint checks new inserts; an existing old row is not thereby retroactively verified. Confirm applied constraints before bootstrap |
| init35/36 | Restricted `allura_app` role is NOBYPASSRLS; workspaces/tokens have forced tenant policies. Migration role bypasses RLS | Service uses the restricted role. Privileged bootstrap authority is a separate reviewed capability; never use owner credentials as an application-role fallback |
| `src/lib/mcp-token/hash.ts` | Cryptographic random body, namespace/prefix, HMAC-SHA256 using the service signing secret, constant-time verification | Use the existing format; persist only prefix/hash. Raw credential and signing secret stay outside SQL plans, reports and logs |
| Workspace/token repositories | Existing insert shapes and transport credential semantics | Reuse the shapes, not direct owner-pool execution. Some existing lookups lack tenant arguments; the trial adapter must bind tenant/workspace explicitly |

For example, a token carrying tenant A and workspace B must fail if B belongs to a different tenant. A syntactically valid tenant name grants no access. Merely finding the same workspace ID is insufficient evidence of a reusable fixture.

## Atomicity and retry contract

Do not compose the current `createWorkspace` and `createToken` helpers as two independently committed calls: the second can fail after the first commits. The benchmark provisioner additionally grants review/promotion scopes, so it is not the trial initializer.

The acceptable write boundary is one verified transaction, or one reviewed atomic statement that inserts the workspace and inserts the token from that insert's returned tenant/workspace pair. Both inserts must bind the intended tenant. Uniqueness/FK errors must roll back the operation; do not swallow them with a broad conflict/upsert clause. A precheck and later insert alone do not remove concurrency races.

The target verifier must obtain database identity, applied schema/constraints and fixture state from the approved tool/connection, tied to newly created project/container evidence. A caller-provided `verified: true`, loopback address or matching database name alone is not proof. The write must recheck its scoped preconditions inside the atomic boundary. Refuse unknown ownership, production mode, primary resources, an unexpected existing database, foreign scope or mismatching workspace/token state.

On uncertain commit, reconcile the same operation, workspace ID, token ID, prefix/hash and private credential artifact. Never silently mint another credential, reset a password, reassign a workspace or overwrite rows. A matching existing fixture may be reused only after verified equality; a partial/mismatching fixture stops. Retain a non-secret operation locator even if private-file delivery fails. No event/trace row is updated or deleted, and no semantic lineage is involved.

## Discovered catalog adapter is not approved for this write

Context7 was queried for the exact upstream server but returned a different read-only product; it did not establish this server's contract. Primary-source fallback fetched upstream commit [`069028d6ffd585ab89e6185f7af48f7f38011876`](https://github.com/Souhar-dya/mcp-db-server/commit/069028d6ffd585ab89e6185f7af48f7f38011876) without credentials. The catalog server was not activated or connected. Its image/revision and live tool schema remain unverified.

- The catalog describes seven tools and a `query` argument. The pinned [MCP entry point](https://github.com/Souhar-dya/mcp-db-server/blob/069028d6ffd585ab89e6185f7af48f7f38011876/mcp_server.py) names the read-only SQL argument `sql_query`; it also defines extra unsafe-write tools. Catalog text therefore cannot establish the deployed interface.
- The read-only tool delegates to a SELECT-only filter in the pinned [database implementation](https://github.com/Souhar-dya/mcp-db-server/blob/069028d6ffd585ab89e6185f7af48f7f38011876/app/db.py). Inserts and data-modifying CTEs are rejected. Do not disguise a write as a SELECT/function call or switch to an unadvertised unsafe tool to evade that boundary.
- A separate unsafe implementation wraps each call in an engine transaction, but offers no separate bound-parameter input. That does not prove a multi-call transaction, verified target, safe fixture operation or suitable exposed tool.
- Upstream connection/status/startup paths can print the full connection URL, and the read-only SQL response prints its input. Raw URLs or secret-bearing SQL must not be sent through this unreviewed path. SQL error text may also reveal inputs.

Decision: **do not implement or document a runnable provisioning adapter against the discovered catalog interface yet.** Pure plan assembly, mocked guards and profile preparation can proceed. Live execution requires a pinned, actually exposed permitted tool with verified target binding, atomic scoped parameterized writes, bounded structured responses and redacted errors/logs. Configuration/activation and new trial-resource authority are separate approvals; the existing Allura Brain connection is unaffected.

Context7 `/websites/sqlalchemy_en_20` confirms that `AsyncEngine.begin()` commits a successful block and rolls back an exceptional block ([official reference](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)). This supports the per-call source reading only; it does not certify the MCP wrapper or active image.

## Fresh-init embedding mismatch

The declared application dimension is **1024**, not the older 768 mentioned in historical guidance. The current initialization sequence does not preserve that column contract:

| Source | Effect on an empty initialization, if all scripts complete |
|---|---|
| `00-extensions.sql` | Enables pgvector and pg_trgm |
| `16-ruvector-memories.sql` | Creates `allura_memories.embedding` as `vector(1024)` and its HNSW index |
| `20-migrate-to-1024d.sql` | Adds a separate `embedding_1024 vector(1024)` and index; describes a later manual cutover |
| `22-embedding-4096-migration.sql` | Drops the original-column HNSW index; changes original `embedding` to `vector(4096)` using NULL |
| `23-enable-4096d-hnsw.sql` | No-op; does not perform that cutover |
| `src/lib/ruvector/bridge.ts` | Inserts and queries original `embedding`, not `embedding_1024` |
| `src/lib/ruvector/embedding-service.ts` | Requests 1024 dimensions; currently accepts a nonempty array without enforcing exactly 1024 finite numbers |

No later matching type correction/rename was found in the current init directory. Therefore source-order analysis predicts an active 4096-column/1024-client mismatch; it is not a claim that fresh initialization was executed. A provider returning 1024 values does not by itself make this initialized schema compatible. Null vectors, raw-event fallback or a passing process health check must not hide the mismatch.

Bounded proposal: a **trial-only trailing initialization step**, after the existing directory, verifies the isolated target and that `allura_memories` contains zero rows, then aligns the active original column with the application's 1024 contract. It must refuse a nonempty/unexpected schema, never NULL or overwrite existing vectors, and leave shared/global migrations untouched. Keep the unused parallel column harmless unless a separately reviewed contract removes it. Brooks must approve the exact local change; no DDL was authored or executed by this review.

Runtime acceptance must inspect the actual final column type/index after initialization, request a real provider vector, require exactly 1024 finite numeric values, insert/read through the service's restricted authenticated path and test retrieval. Model/image identity and provider response must be observed; a model family name or source comment is insufficient proof. The embedding client/readiness validation gap should remain explicit rather than trusting its TypeScript response annotation.

## Focused tests before any live bootstrap

1. Pure plans reject foreign/malformed tenant, mismatching workspace, excess scopes, unbounded/expired validity, invalid prefix/hash and any raw token/secret in the plan.
2. Target/ownership/schema proof must come from the verified adapter; forged flags and a correct hostname with wrong database/project fail before writes.
3. Empty state produces exactly the intended workspace/token pair; forced second-insert or uniqueness failure leaves neither row. Concurrent duplicate attempts cannot silently rebind scope.
4. Matching recovery reuses the same IDs/credential; lost response, partial state or missing private file never causes automatic token mint/reset. Secret text is absent from success, errors and logs.
5. Read-only tool rejects bootstrap; unknown/unadvertised tool names and generic direct-pool fallbacks are unavailable, not alternate success paths.
6. Trial-only dimension correction refuses nonempty/wrong-target state; final active column and actual vector shape must agree. Wrong-length/nonfinite/null/provider-error cases fail readiness instead of passing via fallback.

These are required cases, not executed test results. Parent coordinated outcome may include this report; no semantic promotion is requested.

## Source fingerprints and outcome

| Inspected working source | SHA-256 |
|---|---|
| `docker/postgres-init/16-ruvector-memories.sql` | `61903521bbc8465186928af4f2b1e20633ac021c8b10021b9e5e06555190ebac` |
| `docker/postgres-init/20-migrate-to-1024d.sql` | `dcf03a618ef5acd4fcf8782223046a5501dfbaca41773aa043f4a3fd90491be9` |
| `docker/postgres-init/22-embedding-4096-migration.sql` | `e95296a8c4a5312a6945bb562e1b6a8815828963e72e752542979f13a57915af` |
| `docker/postgres-init/23-enable-4096d-hnsw.sql` | `97f1f173f98680ddd59a5466761c04741df98a1e0df2affcef7cf3fb46858129` |
| `src/lib/ruvector/embedding-service.ts` | `8e8ea06beb1c3f9495bcadd7cf1a764e43dcfd0f5d447e170a3c1a0579870db3` |
| `src/lib/ruvector/bridge.ts` | `2d9ced409cab155d0505277d2b5e01dd121ac1abac1f425fb73f0c7a05cd9fba` |

Upstream commit and downloaded source hashes are retained in `/tmp/allura-mcp-db-review/`; the pinned links above identify the reviewed upstream source, not an active catalog image.

Governed outcome `69846d17-ae65-4d67-bfe1-3de4e2b5bf43` was written and exact-marker read back in `allura-system`. The write reported both stores; readback source was semantic. No semantic promotion was requested and no independent human approval was verified. Storage placement is not approval evidence.

## AD-71 source review — initial finding

The prepared pure planner is nonexecuting and its 38 focused unit cases independently pass. The candidate DDL is outside automatic image initialization, checks an exact expected database setting, takes an ACCESS EXCLUSIVE lock, accepts only the known 4096/parallel-1024 empty schema, and recreates the original index contract without NULL coercion, index drops or row rewrites. Its setting is explicitly not ownership proof. No live adapter is supplied.

**P2: an RLS-filtered scan cannot prove the table has no rows.** The source initially checked `EXISTS` without verifying unrestricted row visibility. This table has FORCE RLS in the global schema. A policy-bound owner or future limited adapter may see zero rows despite hidden rows; the lock does not bypass row security. Before the emptiness scan, reject a context in which row security remains active (or provide an equally explicit all-row-visibility proof). Do not disable row security, grant bypass rights or use an application owner fallback to make this check pass.

Fresh Context7 `/websites/postgresql_16` confirms the current-user/environment meaning of `row_security_active` in the [official information-functions reference](https://www.postgresql.org/docs/16/functions-info.html), and FORCE RLS owner behavior in [row-security policy documentation](https://www.postgresql.org/docs/16/ddl-rowsecurity.html). Hightower and Brooks received the bounded finding. Final source re-review is pending its correction; no SQL was executed.

## AD-71 final independent source review — 2026-10-20

**Verdict: no remaining blocking data-contract finding for the local, nonexecuting preparation at the fingerprints below.** This closes the bounded source-review slice only. The initial P2 is resolved in source: after acquiring the table lock, `pg_catalog.row_security_active` must be false before the ANY-row emptiness scan. A restricted caller is refused; no RLS disabling, privilege grant or alternate privileged connection is supplied.

The final candidate checks an exact expected trial database, rejects missing binding or unexpected state, locks `public.allura_memories` in ACCESS EXCLUSIVE mode, requires unrestricted row visibility and zero rows, and accepts only original `vector(4096)` plus parallel `vector(1024)` with the original index absent. It changes the empty original column to 1024 without NULL coercion and recreates `allura_mem_hnsw` using `vector_cosine_ops`, `m = 16`, `ef_construction = 64`, and the original nonnull/nondeleted predicate. Already-aligned, nonempty or unexpected schemas stop for review. A verified future adapter must own the transaction and real target/ownership verification; a session setting is not authority.

This final layout supersedes the earlier trailing-initialization proposal: the candidate SQL is deliberately **outside automatic initialization**. The PostgreSQL image copies only the existing global initialization directory. No shared migration was changed by this work. Consequently, the prepared image alone still has the source-predicted active-column mismatch; it cannot yet pass a first-use schema/readiness gate.

The fixture planner strictly binds trial/project/database/principal identifiers, tenant, UUIDs, read/write-only scopes, hash/prefix metadata and a future expiry of at most 24 hours. It carries no raw token or signing secret. Raw secret parsing at the separate runtime boundary suppresses parser/input diagnostics. Plan construction and even matching caller-supplied observations remain explicitly nonexecuting; foreign, unknown, partial or mismatching state cannot authorize writes or trigger an upsert/reissue. No database adapter is implemented. Provider checks require a full matching model digest and exactly 1024 finite values forming a nonzero vector, while explicitly leaving actual schema and provider execution unproved.

Independent offline validation: `bun run test:unit tests/scripts/first-use-local-fixture.test.ts tests/scripts/first-use-profile.test.ts --reporter=dot --silent` exited 0 with **54/54** cases (41 fixture, 13 profile). These include full/bare digest acceptance and missing/wrong-tag/mismatching/short digest rejection, fixed-text secret-boundary errors, strict plan/observation guards and static SQL guard ordering. SQL assertions inspect source text: they do not test executed DDL, transaction rollback, lock behavior, hidden rows under live RLS or a real initialized database.

| Final reviewed source | SHA-256 |
|---|---|
| `scripts/first-use-local-fixture.ts` | `006e4a669ce86d1f1bfa0dfa0abe5f8b0aaa7d69078467766b62d30adc72ee80` |
| `docker/first-use/empty-schema-alignment.sql` | `aff0c96093353f53de979203ee7cb93faca770e78b737980a1ef3b0a93e49141` |
| `docker/first-use/Dockerfile.postgres` | `1eab2a2a1b18086a1a68804d0f7cfc20091f2d77b457c40154729e3eea67ac66` |
| `docker/first-use/Dockerfile.postgres.dockerignore` | `1252a6b8ae5023667f752a5ac3a0fdd70958081d8da14f89c0320669b579c37e` |
| `docker-compose.first-use.yml` | `e496e5603fb9dacf41d1f49d803c4af1a4ffb5b71be3340970c26982d9528f61` |
| `docker/first-use/Dockerfile.mcp` | `2b8ecb881595ea689c68f1c154fcbe5520af257734d1e16ea7b8f53f99125fd8` |
| `docker/first-use/Dockerfile.mcp.dockerignore` | `5f4585a7fc25e09c0c5259ef7a0d926a5c999c63cd6e5aee28e29b0e73ec4482` |
| `tests/scripts/first-use-local-fixture.test.ts` | `9f30c5b751b08d475bd7c05f399dbd78dba493009a78110bd487f3f8a0613963` |
| `tests/scripts/first-use-profile.test.ts` | `210388d5899d61bbc2e05d5dd8bce242a3d6d3b918465ef8274c10f11eb00f5f` |

No DDL or SQL was executed, no live adapter was verified, and no Docker/runtime or MCP configuration was changed by this review. The existing Brain connection receipt establishes only that governed connection's observed access; it grants no trial-database, DDL or runtime authority. Image/model digest existence, initialized schema, atomic fixture writes/rollback, actual provider compatibility and the live two-session journey remain unverified. There was no credential retrieval, production-token request, trace mutation or semantic promotion. Parent will record one coordinated final outcome; no additional intermediate memory event was written for this source-review close.
