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

### Controlled red branch (Story 24.1 AC-10)

| Proof | Commit SHA | Workflow run | Result | Required artifact |
|---|---|---|---|---|
| Controlled red branch (not merged) | `44b80591` | [Epic 24 Evidence #32086543694](https://github.com/Allura-Ecosystem/Allura_Memory/actions/runs/32086543694) | failure | Failed run manifest showing the blocking lane |

The controlled-red demonstration used PR #65 (`ci/controlled-red-ac10`, commit `44b80591`), which added a deliberately failing test to `src/lib/validation/group-id.test.ts`. Run `32086543694` failed on the **Epic 24 Evidence / Unit** lane (`Run unit tests`, exit 1) and the **Aggregate** lane, while Static, Build, Live PostgreSQL, and Benchmark passed — proving the Epic 24 Evidence workflow fails on a broken change. Note the scope of this claim: as of 2026-08-20 `main` carries no branch-protection rule, so no status check is *required* by GitHub — this run demonstrates that the workflow detects and reports a broken change, not that the platform would prevent it from merging. Story 24.10 tracks making the gate enforceable. PR #65 was closed without merging and the temporary branch deleted, so the failure was never merged into `main`.
