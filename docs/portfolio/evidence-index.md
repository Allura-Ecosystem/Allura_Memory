# Portfolio Evidence Index

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

CI evidence is immutable, named with the full commit SHA, retained for the
workflow-configured period, and linked through the workflow run page recorded
inside `evidence-manifest.json`.

## Indexed runs

### Green baseline (Story 24.1 AC-4/AC-6/AC-7)

| Proof | Commit SHA | Workflow run | Result | Required artifact |
|---|---|---|---|---|
| Green baseline | `a7f2a236` | [Epic 24 Evidence #31945804098](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/31945804098) | success | `epic-24-evidence-manifest-<sha>` |

The green run `31945804098` (merge of PR #64, commit `a7f2a236`) executed all six Epic 24 Evidence jobs to success: Static (typecheck + changed-file ESLint ratchet), Unit, Build, Live PostgreSQL, Benchmark, and the Aggregate schema-validated manifest job. Live-database migrations applied deterministically to `pgvector/pgvector:pg16` and the benchmark lane produced the exact five-ID inventory (`retrieval-quality`, `curation-accuracy`, `governance-integrity`, `latency-profile`, `audit-completeness`).

### Story 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger

| Proof | Commit SHA | Workflow run | Result | Required artifact |
|---|---|---|---|---|
| Merged green | `10a6324b` | [Epic 24 Evidence #32369489097](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32369489097) | success | `epic-24-evidence-manifest-<sha>` |

PR #66 merged to `main` as `10a6324b` with all 25 checks passing, including the
`tenant-isolation-smoke` and `integration-test` lanes that build the schema from
`docker/postgres-init/` and the Epic 24 Evidence live-PostgreSQL lane.

Two schema-bootstrap defects were fixed on the way to this run, both of which had
allowed lanes to disagree about what schema they were testing:

- Nothing in `docker/postgres-init/` issued `CREATE EXTENSION vector`, while
  `scripts/ci/run-live-db-tests.sh` did. Tables guarded on the pgvector `vector`
  type were therefore silently skipped in three lanes, which then aborted in
  `36-tenant-rls.sql`. Fixed by `00-extensions.sql`.
- `37-events-immutable.sql` hardcoded both a bootstrap superuser name and the
  database name. Now derived from `current_user` and `current_database()`.

Live-DB evidence for the AC matrix (37 tenant-scoped tables with forced RLS,
`events` UPDATE/DELETE rejected for the app role, break-glass mutation permitted
for `allura_breakglass`) is recorded in the story's Status Evidence section and
in `artifacts/ci/local/live-db/live-db-tests.json`.

### Story 24.6 — Evaluation and Regression Gates

The portfolio evaluation suite (`evals/suites/portfolio.yaml`) is a deterministic
offline regression gate. `src/lib/evals/runner.ts` parses the suite's lane
declarations, executes every lane's dataset fixture, derives each metric from the
executed case outcomes, and compares it to the declared threshold. It is wired
into CI as the required `test-eval` job (`.github/workflows/ci.yml`) and as the
`Epic 24 Evidence / Evaluation` lane (`.github/workflows/epic-24-evidence.yml`),
whose artifact is aggregated into the SHA-bound evidence manifest.

Evaluation artifact hashes (sha256) for the canonical suite, baseline, and
dataset fixtures:

| Artifact | sha256 |
|---|---|
| `evals/suites/portfolio.yaml` | `2c1a2bd2db4f4c2c41966143e6c1bc3d445f0f0a51d340f6d9f4fdd771170b10` |
| `evals/baselines/portfolio.json` | `20f439db1cd50364a2e258f287be15136271b3dc6d9aca31c3ecb6cfb6529dd9` |
| `evals/datasets/relevance-queries.json` | `69c66b91cf32920ab08a19ced20dbabc8dc0505c4b9c108be3de13aad6fdf1d1` |
| `evals/datasets/approved-recall.json` | `9e447c793cfb8970c731b7400c00a0a5060e677b116b64cca07a0680086985e3` |
| `evals/datasets/policy-violations.json` | `358bac223cf478aae7044d6e8edd9e5b016c8c406735c39f76279c71abafaeb6` |
| `evals/datasets/cross-tenant.json` | `696e9b7495921e5b5bbeea01711394b5bac37136288ebb158972b4f2b94868c2` |
| `evals/datasets/promotion-correctness.json` | `82731d36a41d1005b7838fdf3235d8f1fa78e1d7ebd6070c27e4bd6cc0fc5786` |
| `evals/datasets/audit-completeness.json` | `a63bdaa2c2587771e9ffd709ce390dd96a2c38d67df68a1d903caf9251cd2982` |
| `evals/datasets/replay-scenarios.json` | `eca427567eb899a99927185809f2472140da7c9290c81bec8643489cc88fd573` |
| `evals/datasets/tool-contracts.json` | `f8099511998f2dbf24764196269e8e286e7181bc0fc34341e0edacad60c7b7fd` |
| `evals/datasets/latency.json` | `acb377dd290801d0b1b37ae3414802cd21207770685493655e546c36db8e6f3e` |

Each metric in the generated `portfolio.json` report carries its own per-metric
`evidence_hashes` entry (sha256 of `{name, value, threshold}`), so every reported
result is traceable to a dataset revision, threshold, and case IDs.

### Controlled red branch (Story 24.1 AC-10)

| Proof | Commit SHA | Workflow run | Result | Required artifact |
|---|---|---|---|---|
| Controlled red branch (not merged) | `44b80591` | [Epic 24 Evidence #32086543694](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32086543694) | failure | Failed run manifest showing the blocking lane |

The controlled-red demonstration used PR #65 (`ci/controlled-red-ac10`, commit `44b80591`), which added a deliberately failing test to `src/lib/validation/group-id.test.ts`. Run `32086543694` failed on the **Epic 24 Evidence / Unit** lane (`Run unit tests`, exit 1) and the **Aggregate** lane, while Static, Build, Live PostgreSQL, and Benchmark passed — proving the Epic 24 Evidence workflow fails on a broken change. Note the scope of this claim: as of 2026-08-20 `main` carries no branch-protection rule, so no status check is *required* by GitHub — this run demonstrates that the workflow detects and reports a broken change, not that the platform would prevent it from merging. Story 24.10 tracks making the gate enforceable. PR #65 was closed without merging and the temporary branch deleted, so the failure was never merged into `main`.

### Story 24.10 — CI Gate Integrity and Branch Protection

On 2026-08-21, GitHub branch protection was applied to `main` with strict
up-to-date checks, administrator enforcement, required conversation resolution,
and force-push/deletion disabled. The rule is verified through the GitHub Branch
Protection API. The hosted green and controlled-red prevention outcomes are
recorded below.

| Lane / check | Before Story 24.10 | After Story 24.10 | Required by `main` protection |
|---|---|---|---|
| `CI / test-e2e` | Test result could be suppressed | Unsuppressed PostgreSQL E2E source of truth | Yes |
| `MCP Testing Suite / E2E Integration Tests` | Duplicate E2E lane could be suppressed | Retired; it duplicated `CI / test-e2e` without distinct evidence | No |
| `MCP Testing Suite / Unit Tests (Vitest)` | Test result could be suppressed | Unsuppressed reporting lane | No — `CI / test-unit` is required |
| `Check / Unit tests` + `Integration tests` | Previously chained/suppressed | Two independent, visible unsuppressed steps | No |
| `MCP Browser Tests` | Mock-adapter surface; misleading name | `MCP Runtime Health Tests` against the running application | Yes |
| `CI / typecheck` | Green but unenforced | Failing check can block merge | Yes |
| `Epic 24 Evidence / Aggregate` | Green but unenforced | Schema-validated evidence aggregate can block merge | Yes |

**Duplicate E2E decision:** `CI / test-e2e` is the sole full E2E source of
truth. The MCP workflow’s duplicate E2E job was removed rather than retained as
a redundant signal. The separate required MCP runtime-health check validates the
running application and is explicitly not represented as either browser
automation or canonical Streamable HTTP protocol validation.

#### Hosted green proof

| Proof | Commit SHA | Workflow run | Result |
|---|---|---|---|
| Protected PR #74 | `1cf1b28b` | [CI #32503413843](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32503413843), [MCP Testing Suite #32503413880](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32503413880), [Epic 24 Evidence #32503413887](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32503413887) | success |

All five required checks on PR #74 passed: `typecheck`, `test-unit`,
`test-e2e`, `MCP Runtime Health Tests`, and `Epic 24 Evidence / Aggregate`.
The runtime lane used a real PostgreSQL service and the running application on
port 3100.

#### Controlled-red prevention proof (AC-7)

| Proof | Commit SHA | Workflow run | Result |
|---|---|---|---|
| Disposable PR #81 (not merged) | `f9d30335` | [CI #32503784539](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32503784539), [Epic 24 Evidence #32503784452](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32503784452) | required `test-unit` and Evidence Aggregate failed |

PR #81 contained one explicitly documented, deliberately wrong unit assertion.
GitHub marked the PR `BLOCKED`; a normal `gh pr merge --merge` attempt was
refused with “the base branch policy prohibits the merge.” No `--admin` or
`--auto` bypass was used. The PR was closed without merging and its temporary
branch deleted after this evidence was captured.

### Story 24.9 — Reference Integrations and Portfolio Demonstration

Three runnable reference integrations live under `examples/`, each with a
success case, a policy/security failure case, and a recovery case. All run
through the deterministic scenario harness (`scripts/harness.ts`) against
synthetic fixtures — no paid provider credentials, no real network in
simulate mode.

| Integration | Scenarios | Verified 2026-08-29 |
|---|---|---|
| `examples/engineering-review-agent/` | success, policy-denial, recovery | success ✓, denial ✓ (POLICY_DENIED), recovery ✓ |
| `examples/controlled-research-agent/` | success, prompt-injection, recovery | success ✓, injection ✓ (UNTRUSTED_INSTRUCTION), recovery ✓ |
| `examples/regulated-document-quality/` | success, cross-tenant-denial, recovery | success ✓, denial ✓ (TENANT_MISMATCH), recovery ✓ |

Run receipts are written to `receipt-<scenario-id>-<timestamp>.json` by the
harness; each receipt carries the scenario digest, definition revision,
principal/tenant references, configuration fingerprint, evidence hashes, and
replay comparison. The demo path is documented in
`docs/portfolio/demo-script.md` and the architecture narrative in
`docs/portfolio/principal-engineer-case-study.md`.
