# Allura Memory Capability and Evidence Matrix

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

This inventory separates what the repository implements from what has been
proven. Capability state and evidence state are independent; a feature can be
implemented while its remote CI evidence remains unverified.

## State definitions

| Axis | State | Meaning |
|---|---|---|
| Capability | `implemented` | A concrete code path and test or validation surface exist. |
| Capability | `planned` | BMAD scope exists, but the capability is not complete. |
| Capability | `unsupported` | The repository does not claim this behavior. |
| Evidence | `validated` | A deterministic validation command exists and has local or CI proof. |
| Evidence | `measured` | A commit-bound CI artifact contains an observed measurement. |
| Evidence | `unverified` | No current commit-bound CI artifact is indexed. |

## Current inventory

| Claim | Capability state | Evidence state | Source | Validation command | Latest evidence type |
|---|---|---|---|---|---|
| MCP memory service over stdio and Streamable HTTP | `implemented` | `validated` | `src/mcp/memory-server-canonical.ts`, `src/mcp/canonical-http-gateway.ts` | `bun run test:integration` | Contract tests; remote CI artifact pending |
| Tenant-scoped memory operations require `group_id` | `implemented` | `validated` | `src/lib/validation/group-id.ts`, `src/mcp/canonical-tools.ts` | `bun test src/lib/validation/group-id.test.ts` | Unit test; remote CI artifact pending |
| Episodic and semantic persistence use PostgreSQL/RuVector | `implemented` | `unverified` | `src/lib/postgres/`, `src/lib/graph-adapter/`, `docker/postgres-init/` | `bash scripts/ci/run-live-db-tests.sh` | Live-database report, server-version receipt, and migration log pending laptop/CI execution |
| Promotion is review-gated and auditable | `implemented` | `validated` | `src/curator/`, `src/kernel/`, `src/mcp/governance-tools.ts` | `bun run test:unit` | Unit test report; remote CI artifact pending |
| Benchmark harness executes black-box MCP scenarios | `implemented` | `unverified` | `src/__benchmarks__/` | `bun run benchmark -- --ci-baseline --require-gateway` | Benchmark JSON after first remote CI run |
| CI produces one schema-validated, commit-bound evidence manifest | `implemented` | `unverified` | `.github/workflows/epic-24-evidence.yml`, `scripts/ci/collect-evidence.ts` | `bun test scripts/ci/collect-evidence.test.ts` | First remote workflow artifact pending |
| Changed JavaScript/TypeScript files cannot add ESLint errors | `implemented` | `validated` | `scripts/ci/lint-changed.sh`, `.github/workflows/epic-24-evidence.yml` | `bun run lint:ci --base=<base-sha>` | Ratchet tests; remote CI artifact pending |
| Numerical benchmark regression policy | `planned` | `unverified` | `_bmad/bmm/stories/24-6-evaluation-regression-gates.md` | Not available until Story 24.6 | None |
| Authenticated principal propagation across every write path | `planned` | `unverified` | `_bmad/bmm/stories/24-2-authenticated-principal-context.md` | Not available until Story 24.2 | None |
| Reference LangGraph and OpenAI Agents integrations | `planned` | `unverified` | `_bmad/bmm/stories/24-9-reference-integrations-portfolio-demo.md` | Not available until Story 24.9 | None |
| Formal compliance certification or production-scale performance | `unsupported` | `unverified` | `README.md` claims and limitations | Not applicable | None claimed |

## CI script inventory

| Script | Infrastructure requirement | Secrets | CI lane |
|---|---|---|---|
| `bun run typecheck` | None | None | Static |
| `bun run lint:ci --base=<base-sha>` | Full Git history for explicit base comparison | None | Static |
| `bun run test:unit` | None | None | Unit |
| `bun run build` | None beyond build-time configuration | None expected | Build |
| `bash scripts/ci/run-live-db-tests.sh` | PostgreSQL 16 with pgvector | Ephemeral CI database password | Live database |
| `bun run benchmark -- --ci-baseline --require-gateway` | PostgreSQL/RuVector plus the MCP gateway | Ephemeral CI database password | Benchmark |
| `bun run test:e2e` | Optional services beyond the Story 24.1 baseline | Environment-dependent | Not a required Story 24.1 lane |

## Known evidence risk: full-repository lint debt

`bun run lint:eslint` currently reports pre-existing errors across legacy,
generated, and active files. Story 24.1 does not relabel that baseline as clean.
The required CI lane instead validates the complete TypeScript program and
ratchets every changed JavaScript/TypeScript file so new lint errors cannot be
introduced. Full-repository lint remains `unverified` until the existing debt
is remediated and a clean commit-bound run is indexed.

No performance value becomes a public claim merely because it appears in a
local report. A value is `measured` here only after its immutable artifact and
commit SHA are indexed in [evidence-index.md](evidence-index.md).
