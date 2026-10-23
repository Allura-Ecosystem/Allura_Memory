# Disposable PostgreSQL fixture runner

This is a source candidate for a reviewed GitHub-hosted runner. Its lifecycle has
only been tested with offline transports. No service, database, migration, role,
trigger, concurrency behavior or hosted CI execution is certified by those tests.
The workflow patch remains outside this checkout. Additional selected suites still
have unsafe cleanup or availability-based false passes; resolve those before a
whole-lane run. The project's governed operational approval remains required.

The future entrypoint is `bun run ci:disposable-fixtures --lane=e2e
--artifact-dir=<new-directory>` (or `--lane=integration` / `--lane=live-db`). It retains the canonical
config inventory, runs each of the ten registered files in its own process and
database, and checks that the resulting report files exactly match each partition.
The E2E and live-db remainders get separate databases; the integration remainder gets no
new database credentials. This partition preserves selection, not safety approval
for the remaining files. Missing/empty/duplicate required fixture entries fail.
The 86 registered live/pure test identities, including the twelve original identities, are mandatory in successful fixture
reports; missing, skipped, todo, duplicate, failed or miscounted results fail.

The trusted job supplies `ALLURA_FIXTURE_REPOSITORY`, `SHA`, `RUN_ID`,
`RUN_ATTEMPT`, `JOB` and `SERVICE_ID`, `SERVICE_NETWORK`, `SERVICE_PORT` under
that prefix. Run/source values must match their `GITHUB_*` counterparts. Only a
`github-hosted` runner and the reviewed `pgvector/pgvector:pg16` service are
accepted. `SERVICE_NETWORK` is the Docker network **name**, compared with the
`NetworkSettings.Networks` key; its observed `NetworkID` is recorded separately.
Service labels `allura.fixture.repository`, `.run`, `.attempt`, `.job` must match.
Workflow service options must use literal job names because `github.job` is only
available in steps. No new token or REST permission is required.

The model prevents accidental target reuse by reviewed code. It does not defend
against malicious code controlling the same hosted runner or Docker daemon.
Ownership comes from the current job's exact service identity, fresh hosted runner
and reviewed no-reuse service configuration. The adapter checks the running object,
image digest, network, published port and sole anonymous local PGDATA volume;
binds, named/reused storage and inherited volumes are refused. Creation timestamps
corroborate that context, with a six-hour maximum age and one-second timestamp
rounding tolerance. `serviceCreatedAt` is an observed service timestamp, not an
independently observed workflow start time. Actual Docker storage timing remains a
live compatibility check.

Bootstrap SQL runs through the verified container ID, a scrubbed process
environment and explicit local Unix socket/port. The first query reads cluster
identity. An unpredictable database must be absent and then created successfully;
creation failure never adopts or deletes an existing database. The complete current
migration manifest runs serially because migrations create cluster roles. Source
and migration digests must remain unchanged before child launch.

Owner/app credentials are supplied only through `ALLURA_FIXTURE_OWNER_USER`,
`OWNER_PASSWORD`, `APP_USER`, `APP_PASSWORD` under the same prefix. The current
reviewed migrations use owner `allura`, app `allura_app`, and the existing public
fixture app password `change-me-in-production`; this runner does not rotate roles
or introduce grants. A read-only connection through the published route checks the
database name/OID/owner, server identifier/version and actual session/current user.
The app must lack elevated role attributes and owner membership. The owner checks
the expected RLS and append-only trigger catalog entries. These checks supplement,
not replace, real PostgreSQL behavior assertions.

Each isolated child receives a private, one-use launch-bound receipt. It rechecks
source, explicit configuration and observed service before its read-only identity
handshake, then permits application pool construction. Environment changes fail
before subsequent test setup. Neither a JSON file, localhost address, password nor
database prefix alone establishes ownership. Dotenv loading is disabled for runner
children; direct selected live tests without provenance fail explicitly. The pure
Genesis detector test has no database prerequisite.

`FIXTURE_LANES` explicitly assigns seven files to E2E, two to integration, and
auto-curator workspace authority to live-db. The canonical live-db inventory stays
at 55 files. Each lane is partitioned without losing selected files. `POSTGRES_URL`
is rejected as an ambient override, scrubbed in children, and checked for changes
after identity validation. The six additional suites no longer load dotenv or
reset fixture history. Pure trace/group/scoring cases do not acquire a database.

Curator coverage calls the real initial approval service through the app role and
reads the persisted canonical row, decision, governance receipt and outbox. Rejection
uses the real handler with synthetic trusted middleware headers; missing authority
and self-review must be denied. This is an application seam, not a remote login test.
The historical SOC2 skip is restored active after replacing its unverified request
with the legitimate service issuer and converting PostgreSQL's numeric score.
Neither the repair nor offline checks establish that the live scenario passes.

`CURATOR-APPROVED-REVISION-GAP-20261022` remains release-blocking: the original
`createInsight second call SUPERSEDES first version` test now fails explicitly
because the current approval API lacks content/predecessor-bound revision approval.
An initial approval or synthetic storage-lineage fixture cannot satisfy that
requirement. The runner continues to reject failed, skipped or missing coverage.
The former `createInsight writes Insight record (Postgres-only)` case is now
`approveProposal writes the initial canonical record and durable evidence (Postgres-only)`;
the former full-pipeline `createInsight → Neo4j` title now ends with
`approveProposal → PostgreSQL`. These name changes remove obsolete mocked claims;
they do not reduce the original release requirements.

Parity retains seven public fields and requires 1,000 successful scoped
`memory_get` calls against 100 seeded events, compared with 100 direct scoped reads
reused across ten rounds. Episodic score/source match the public normalization.
Missing rows or failed reads fail the case; this does not prove MCP transport auth.
Group-governance statistics retain their owner administrative scope; fresh prefixes
isolate assertions and the final validity check requires an actual seeded row.

Fresh test group/workspace IDs preserve exact-count assertions without deleting
history. Atomic promotion's expected FK-denied deletion remains an actual assertion.
Genesis uses fresh synthetic signing material and a distinct exact-mutation policy
claim per pattern through the existing policy API; missing/altered evidence remains
denied. No production policy or schema is weakened.

Tests close pools. The controller never drops databases or removes containers;
normal owning-job service teardown ends the fixture lifetime. Receipts retain the
last lifecycle state and success/failure; raw SQL/process diagnostics are deliberately
redacted because they can contain payloads. Child exit status and JSON report are
validated independently. Evidence-write failure is retained alongside the primary
failure. Only an approved live run can establish migration/runtime compatibility,
isolation, immutable-history protections, role behavior and actual teardown.
