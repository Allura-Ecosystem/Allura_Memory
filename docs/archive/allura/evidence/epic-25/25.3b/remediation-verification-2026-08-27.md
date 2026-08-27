# Story 25.3b local-remediation verification — 2026-08-27

This receipt records local remediation verification only. It does **not** mark Story 25.3b, `REQ-MOD-001..003`, or Story 26.7 AC-2 complete; independent review remains required. See [EVIDENCE-INDEX.md](./EVIDENCE-INDEX.md) for the complete evidence map, including the explicitly pending independent-review gate.

## Candidate identity

The prior pre-commit diff hash was removed because it could not reproduce a committed candidate. The deterministic core-remediation content hash below covers the implementation test, lifecycle/status records, and story record. The evidence documents are excluded to avoid a recursive self-hash.

```bash
files=(
  _bmad/bmm/stories/25-3b-modular-dashboard-workflow-contract-registry.md
  _bmad/bmm/stories/sprint-status.yaml
  src/__tests__/curator-module-registry.live-db.test.ts
  src/lib/curator/module-registry.test.ts
)
printf '%s\n' "${files[@]}" | LC_ALL=C xargs sha256sum | sha256sum
# 94134642d6aa0f3e8925f4ad927971c98fe16f1177d75194ad32ee869dca0b70  -
```

After committing, `git rev-parse HEAD^{tree}` separately reproduces the full committed tree identity.

## Focused verification

```bash
bun vitest run --config vitest.config.unit.ts \
  src/__tests__/curator-module-shell.test.tsx \
  src/lib/curator/module-registry.test.ts \
  src/lib/auth/__tests__/with-permission-action.test.ts
```

Actual result: exit 0 — **3 files, 31 passed, 0 failed**.

```bash
bun run typecheck
```

Actual result: exit 0.

## Full unit lane

```bash
bun run test:unit
```

Actual result: exit 0 — **120 files passed, 6 skipped; 2,166 tests passed, 160 skipped, 0 failed.** Expected-error logging from unrelated test fixtures was emitted, but Vitest reported no failed tests.

## Fresh live PostgreSQL CI app-role lane

The command below is the repository CI live-lane contract from `.github/workflows/epic-24-evidence.yml`, adapted only to use the disposable local container's host port and a local artifact directory. It establishes the CI owner and `allura_app` credentials, creates a fresh database, applies migrations, and validates the evidence report.

```bash
# Use a uniquely named disposable database. (5434 was already occupied locally.)
docker rm -f -v allura-253b-remediation-db >/dev/null 2>&1 || true
docker run -d --name allura-253b-remediation-db \
  -e POSTGRES_DB=memory -e POSTGRES_USER=allura -e POSTGRES_PASSWORD=allura-ci-password \
  -p 127.0.0.1:5435:5432 pgvector/pgvector:pg16

POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5435 POSTGRES_DB=memory POSTGRES_USER=allura \
POSTGRES_PASSWORD=allura-ci-password POSTGRES_APP_USER=allura_app \
POSTGRES_APP_PASSWORD=change-me-in-production \
DATABASE_URL='postgresql://allura:allura-ci-password@127.0.0.1:5435/memory' \
bun run ci:evidence run \
  --lane=live-db \
  --name=live-postgresql-integration \
  --artifact-dir='artifacts/ci/local/25-3b-remediation-final' \
  --artifact='artifacts/ci/local/25-3b-remediation-final/migration.log' \
  --artifact='artifacts/ci/local/25-3b-remediation-final/live-db-tests.json' \
  --artifact='artifacts/ci/local/25-3b-remediation-final/postgres-server-version.txt' \
  --postgres-server-version-file='artifacts/ci/local/25-3b-remediation-final/postgres-server-version.txt' \
  --require-vitest-results='artifacts/ci/local/25-3b-remediation-final/live-db-tests.json' \
  -- bash scripts/ci/run-live-db-tests.sh \
    --artifact-dir='artifacts/ci/local/25-3b-remediation-final'

docker rm -f -v allura-253b-remediation-db
```

Actual result: exit 0. A new disposable `pgvector/pgvector:pg16` container applied **49 migrations**. The recorded server version was **PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2)**. The ignored generated report at `artifacts/ci/local/25-3b-remediation-final/live-db-tests.json` reported **24/24 suites passed and 72/72 tests passed**.

The Story 25.3b live test now has two managed-app-role assertions (available issuance and denied/disabled outcomes). It performs no global `REVOKE`/`GRANT`; that unsafe probe was removed because the configured live lane runs forked tests against a shared database. The read-failure outcome remains covered in the focused unit test by rejecting the host-owned summary reader.
