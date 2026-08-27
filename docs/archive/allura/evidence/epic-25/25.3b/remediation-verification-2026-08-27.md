# Story 25.3b remediation verification — 2026-08-27

This receipt records local remediation verification only. It does **not** mark Story 25.3b, `REQ-MOD-001..003`, or Story 26.7 AC-2 complete; independent review remains required.

## Candidate basis

- Starting commit: `e53b7bd9691269a0d475eae9de25f11cca13f80c`
- Remediated authority diff SHA-256 (before commit): `a5e529c75d05c7e4224f7231b1b2eddb54007d7deedd71310b87abe25329fbeb`
- Recorded at: `2026-08-27T17:34:41-04:00`

## RED → GREEN

### RED

```bash
bun vitest run src/lib/curator/module-registry.test.ts src/__tests__/curator-module-shell.test.tsx
```

Result: exit 1. The new module-specific capability regression failed as expected with `TypeError: missingCapabilitiesForRole is not a function`.

### GREEN focused verification

```bash
bun vitest run --config vitest.config.unit.ts \
  src/__tests__/curator-module-shell.test.tsx \
  src/lib/curator/module-registry.test.ts \
  src/lib/auth/__tests__/with-permission-action.test.ts
bun run typecheck
```

Result: exit 0. Focused lane: **3 files, 31 passed, 0 failed**. Typecheck: exit 0.

## Full unit lane

```bash
bun run test:unit
```

Result: exit 0. **120 files passed, 6 files skipped; 2,166 tests passed, 160 skipped, 0 failed.**

## Reproducible live PostgreSQL command (CI app-role contract)

The authoritative CI lane declares `POSTGRES_APP_USER=allura_app` and `POSTGRES_APP_PASSWORD=change-me-in-production` in `.github/workflows/epic-24-evidence.yml`. A bare `bun run test:live-db` is not this evidence command and is not claimed as live success. It does not provision a fresh schema or establish the CI owner/app-role variables.

```bash
# Start a fresh disposable pgvector/PostgreSQL 16 instance.
docker rm -f -v allura-253b-live-db >/dev/null 2>&1 || true
docker run -d --name allura-253b-live-db \
  -e POSTGRES_DB=memory -e POSTGRES_USER=allura -e POSTGRES_PASSWORD=allura-ci-password \
  -p 127.0.0.1:5434:5432 pgvector/pgvector:pg16

export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5434 POSTGRES_DB=memory POSTGRES_USER=allura
export POSTGRES_PASSWORD=allura-ci-password
export POSTGRES_APP_USER=allura_app POSTGRES_APP_PASSWORD=change-me-in-production
export DATABASE_URL='postgresql://allura:allura-ci-password@127.0.0.1:5434/memory'
bash scripts/ci/run-live-db-tests.sh \
  --artifact-dir=artifacts/ci/local/25-3b-remediation-final
```

Actual result: exit 0 after a fresh **49-migration** install. The launched image was `pgvector/pgvector:pg16` at `127.0.0.1:5434`; the database returned PostgreSQL `16.15 (Debian 16.15-1.pgdg12+2)` and contained the required `allura_app` role. The ignored generated report at `artifacts/ci/local/25-3b-remediation-final/live-db-tests.json` recorded **24/24 suites passed and 73/73 tests passed**. The Story 25.3b live suite ran 3 assertions with 0 failures.
