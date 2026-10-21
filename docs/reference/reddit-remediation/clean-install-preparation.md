# Isolated first-use preparation — AD-71

> AI-Assisted Documentation: implementation evidence, 2026-10-20. Owner: Hightower. Local preparation only: **not a supported runnable install, clean-install result, runtime approval or release receipt**. The [connected-agent guide](../../user-guide/getting-started.md) remains the primary reader path.

## What exists now

| New source | Implemented boundary |
|---|---|
| [Standalone Compose profile](../../../docker-compose.first-use.yml) | Project-owned persistent PostgreSQL/model volumes and network; no fixed container names, primary external resources, host provider or deployment env files. Only gateway loopback port 6487 is published. Every service has CPU/memory/PID bounds. The gateway exists only in the explicit `provisioned` profile. Metadata marks bootstrap and schema alignment blocked |
| [MCP image](../../../docker/first-use/Dockerfile.mcp) | Bun 1.3.14, frozen lockfile, workspace manifests/source before install; selected source copies, no repository-wide copy. The future container reads its mounted trial configuration with a fixed-text failure handler before environment injection or gateway import |
| [PostgreSQL image](../../../docker/first-use/Dockerfile.postgres) | Requires an explicit reviewed pgvector image digest and copies existing initialization SQL. It does not automatically apply the candidate schema correction |
| [MCP context allowlist](../../../docker/first-use/Dockerfile.mcp.dockerignore) / [PostgreSQL context allowlist](../../../docker/first-use/Dockerfile.postgres.dockerignore) | Dockerfile-specific allowlists retain required workspace manifests, runtime sources and SDK emitted entry points. Final exclusions remove nested env, host dependencies, private fixture/secret directories and credential-key file patterns. The primary ignore file is untouched |
| [Pure fixture planner](../../../scripts/first-use-local-fixture.ts) | Validates dedicated trial resource names, `allura-system`, synthetic workspace/principal, read/write-only scopes, hashed token format, image/model digest syntax and expiry within 24 hours. No secret generation, pool, SQL, process, network or execution adapter. Plans and matching untrusted observations always return `executable: false` |
| [Empty-schema SQL candidate](../../../docker/first-use/empty-schema-alignment.sql) | Deliberately outside automatic initialization. Requires missing-by-default exact expected-database binding, an exclusive lock, unrestricted authorized row visibility, zero rows, exact known 4096/1024 column state and no existing original index. Only then proposes aligning the original column to 1024 and recreating its original HNSW index. No null rewrite, row update or index drop |

The actual gateway source calls `server.listen` unconditionally at module level; it does not use `import.meta.main`. The entry wrapper therefore reaches its existing start path after injecting the trial secret file. This is source inspection, not an observed container start. Root `bunfig.toml` is intentionally not copied: it references a missing preload script. The image uses the existing TypeScript configuration and workspace layout; a clean image build remains unperformed.

## Explicitly blocked execution boundaries

No verified permitted MCP database adapter currently supplies atomic scoped bootstrap writes or schema changes. The inspected advertised SQL tool is read-only. This slice neither configures another tool nor imports a direct PostgreSQL pool as a fallback. A schema candidate's session setting is not proof of target ownership: a future permitted adapter must first establish the exact reviewed Compose/container/database identity, then bind it within its transaction. Neither a regex nor a caller's `verified: true` can grant authority.

The SQL candidate accepts only the inspected empty original-column 4096 state. It deliberately refuses re-entry after successful alignment and unknown future schema/index state. It has not been executed or database-validated. Current global initialization leaves the active column incompatible with the client's requested 1024 dimensions; the gateway must not be presented as provisioned before that is resolved through the verified adapter. Restricted app-role password provisioning also remains blocked; the mounted private app credential is not automatically applied by this profile.

Knuth's independent source review found that a table lock does not bypass forced row-level security: an RLS-filtered `EXISTS` could falsely appear empty. The candidate now rejects active row security through `pg_catalog.row_security_active` after the exclusive lock and before the emptiness test. It grants no privilege and disables no policy. Restricted sessions must stop; actual full-table visibility remains part of the authorized schema adapter's verification. The offline source-order assertion covers this correction, not live PostgreSQL behavior.

Pike's independent review found that uncaught JSON diagnostics can echo mounted configuration contents. The pure parser now replaces JSON/schema failures with a fixed error without a cause; the wrapper catches file-read failures too and writes only `First-use secret configuration invalid` before exiting. An extracted-entry harness runs the actual wrapper body with synthetic read/process/import seams and the real parser. All three failure paths leave the test environment empty and never reach the inert gateway import; the valid synthetic case reaches it. This does not execute the real gateway or mount a private file.

Trial owner/app/signing secrets, actual image digests and resolved model identity have not been generated, fetched or verified. No private input files exist because this implementation created none. The image/model inputs must be reviewed before execution; synthetic digest strings used in offline tests establish formatting only. No `up`, build, image/model pull, resource creation, migration, credential mint, database query or cleanup was run. No current connection credential or tenant was changed.

The future reviewed sequence is: isolated resources → inspect completed initialization → permitted exact-target schema/bootstrap work → real provider/model check → explicit provisioned gateway → authenticated two-session record discovery → unprimed newcomer discovery → failure/restart recovery → independent human-review observation. This document intentionally supplies no command that starts that incomplete sequence.

## Provider and readiness

The profile includes a project-owned Ollama service and explicit model-pull allowance, rather than omitting embeddings to force a raw-event search pass. It uses the existing `qwen3-embedding:0.6b` candidate and requires a reviewed full model digest. The one-shot provider check requests the actual model inventory and `/v1/embeddings`, verifies the full model identity and exactly 1024 finite numeric values, and rejects a zero vector. It records no vector contents and grants no database-schema or authenticated-journey pass. Model/image availability, capacity and real response compatibility remain unobserved.

PostgreSQL's health command uses TCP. The official image's initialization server is socket-only, so it cannot pass that command before the final server starts. This is process readiness only. Gateway health uses `/live`; neither that result nor provider success establishes migration completeness, app-role authority, saved-record retrieval, natural-language relevance or human approval.

## Offline verification

- `bun run test:unit tests/scripts/first-use-local-fixture.test.ts tests/scripts/first-use-profile.test.ts --reporter=dot --silent`: **54/54 pass**, two selected files (41 fixture, 13 profile). These are pure, static and extracted-wrapper tests with inert seams; no live database or provider is contacted.
- `docker compose --env-file /dev/null -f docker-compose.first-use.yml config --no-env-resolution --no-interpolate --quiet`: **exit 0**. This parses the source model without resolving deployment env files, interpolating private file locations or starting resources.
- `bun run typecheck`: **exit 0**.
- Scoped whitespace checks: clean. Required workspace manifests and runtime package source paths were inspected; no image build or actual build-context transfer was performed.
- The original development sequence began with 44 cases: 42 passed/2 failed. One exposed an overly permissive token-ID format, which was corrected; the other fixture supplied an unsupported extra field and was corrected to the minimal projection. Added provider/context/readiness cases reached 47 passing tests. The first secret-regression attempt reached 50/53: all three subprocess cases stopped before their assertions with `spawnSync bun EPERM`. Those cases were replaced with the extracted-body harness, including a valid-control case; the final 54 pass. The subprocess lane remains unverified. These counts describe local development, not a deployment result.

Tests cover foreign/retired scope rejection, resource/principal mismatch, widened review scopes, expiry, raw-secret/forged-flag rejection, image/model digest formats, invalid token identifiers, unknown/nonempty/foreign observations, exact fixture reuse without reissue, real-provider response validation, resource isolation, explicit bootstrap blocking, build-context boundaries and process-versus-journey readiness. Matching observations remain untrusted and nonexecuting; there is no adapter to authorize.

## Documentation and review receipts

Fresh external documentation was retrieved through Context7 before the relevant source changes:

| Library / version scope | Finding and authoritative source |
|---|---|
| `/docker/compose` | Long-form healthy/completed dependencies and per-service bounds are supported; [Compose implementation/e2e references](https://github.com/docker/compose) |
| `/docker/docs` | Dockerfile-specific ignores take precedence over root context policy; last matching rule wins; [build-context documentation](https://github.com/docker/docs/blob/main/content/manuals/build/concepts/context.md) |
| `/docker-library/postgres` | The temporary initialization server forces an empty listen address and is socket-only; [official entrypoint source](https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh) |
| `/oven-sh/bun` | Frozen lockfile installation and on-disk workspace manifests matter for container builds; [official installation documentation](https://github.com/oven-sh/bun/blob/main/docs/pm/cli/install.mdx). Exact 1.3.14 image execution was not tested |
| `/llmstxt/ollama_llms-full_txt` | Official local model storage, model inventory and OpenAI-compatible embeddings are documented; [Docker](https://docs.ollama.com/docker), [compatibility](https://docs.ollama.com/api/openai-compatibility), [model family](https://ollama.com/library/qwen3-embedding) |
| `/colinhacks/zod/v4.3.6` | Strict/finite/UUID validation retrieved for installed 4.3.6; root declares `^4.1.5`. Tests/typecheck exercised the actual installed major; [versioned documentation](https://github.com/colinhacks/zod/tree/v4.3.6/packages/docs/content) |
| `/websites/postgresql_16` | Explicit column type changes and catalog type metadata are documented; [ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html), [catalog attributes](https://www.postgresql.org/docs/16/catalog-pg-attribute.html). The candidate DDL remains unexecuted |

Scout recon and parent receipts were reused under `allura-system`; no unrelated memory bodies or startup chatter were written. The [database contract review](clean-install-db-contract.md) supplies the source-backed 4096/1024 and atomic-bootstrap constraints. Brooks owns canonical updates under AD-71. Final independent [Pike interface review](clean-install-interface-review.md) and [Knuth data-contract review](clean-install-db-contract.md#ad-71-final-independent-source-review--2026-10-20) both close with no remaining blocking finding for local preparation only. Each independently passed 54/54; the parent also reran 54/54. The coordinated parent outcome records this preparation; no live-install verdict follows. No Notion state change or semantic promotion is requested.
