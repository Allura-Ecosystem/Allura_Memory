# Persistence and security contract v1 — Story 1.3

Locally specified under delegated design authority, owner Brooks/direct builder. Not a migration receipt or deployed policy. Depends on authority-v1.md; traces FR-A2/B4, NFR-1/2/4, ENT-01/02, AD-66 storage subset. Fresh schema, not restored legacy DDL. PostgreSQL durable authority; RuVector derived retrieval later. No Neo4j.

## Concrete Epic 2 entities

All IDs are UUIDs except tenant group_id (`allura-` plus lowercase alphanumeric/hyphen, 1–80 chars after prefix). Database clock timestamptz for audit. No client actor/time is authority. Every content table primary/reference identity includes `(group_id, workspace_id, id)` even if UUIDs are globally random; cross-scope foreign keys must be structurally impossible.

| Entity | Fields and constraints | Mutability / owner |
|---|---|---|
| principals | id UUID PK; kind human/service/device/worker; active boolean; created_at timestamptz | security administration only; disable permitted, no cascading history deletion |
| identity_bindings | issuer text, subject text, identity_kind; PK issuer/subject/kind; principal_id FK; active boolean | operator-owned stable binding; never email linking; kind must match principal |
| tenants | group_id PK namespace check; active boolean | administration only |
| memberships | group_id/principal_id composite PK/FKs; active boolean; org_admin boolean; workspace_create boolean | organization administration; no content implication |
| workspaces | group_id/id composite PK; display_name text; locked boolean; created_by principal FK; revision positive bigint; created_at | lifecycle/locking mutable; tenant fixed; admin projection allowlist only |
| workspace_grants | group_id/workspace_id/principal_id composite PK; role viewer/curator/workspace_admin; review_approve boolean default false; active boolean; revision positive bigint; issuer principal FK; created_at | privileged access-control service only; human-only review/admin enforced; no app direct CRUD |
| machine_credentials | id UUID PK; principal_id FK; digest bytea unique (SHA256 of random 256-bit token); group/workspace FK; actions text[] allowlist; expires_at; revoked boolean | privileged issuer only; no plaintext token storage; never browser identity |
| events | group/workspace/id composite PK; actor_id FK; kind allowlisted event class; payload JSON object; created_at | insert/select only through scoped service; no UPDATE/DELETE/TRUNCATE |
| access_audit | group/workspace/id; actor_id, target_id nullable; action, outcome allowlist, category, before/after safe role IDs; created_at | append-only, separate from content evidence; administrative projection must exclude free text |

Epic 2 implements authority storage and append-only events first. Access-control mutation functions (create/invite/accept/transfer/recover) must enforce authority-v1 guards and atomic audit before being exposed. Default app has no privilege to mutate principal/membership/grant/config tables. Synthetic fixtures can be seeded by isolated owner only; that is not a production grant API.

## Later versioned record shapes, not premature migrations

These are logical v1 contracts with explicit invariant/owner; migrations wait for the listed story's remaining detail decisions.

- EvidenceV1: scoped event id, authenticated actor, content text, source reference/metadata, server created time. Append-only. CaptureReceiptV1: event identity + scope + accepted time + immutable persistence result. AD-65 (3.1) determines operation key, canonical digest, request envelope/version and replay retention; event/receipt/replay/index intent must commit atomically (3.2). No placeholder replay table in Epic 2.
- ProposalVersionV1: scoped proposal UUID, positive version, producer/requester principal UUIDs, nonempty summary, evidence references to exact same-scope event IDs, bounded finite confidence [0,1], server timestamp. Content immutable. ProposalStateV1: scoped proposal ID, current version, workflow state pending/needs_evidence/approved/rejected. Revision/history append on change. Story 3.3 owns proposal schema; score cannot activate knowledge.
- SemanticVersionV1: scoped semantic ID and logical knowledge ID, positive version, immutable content, reviewed proposal ID/version and immutable receipt ID, server timestamp. Lifecycle projection separate (current/superseded/deprecated). SupersedesV1: same-scope newer/older version UUID references, immutable, no self-edge. One current head per scoped knowledge ID; row locks/constraint enforce it. AD-67 decides correction base/head contract (4.3); DOC-03/05 decide restore/duplicate policy (4.4) before those migrations.
- DecisionReceiptV1: scoped receipt ID, authenticated human reviewer, requester/producer identities, exact reviewed proposal version, action/rationale/evidence refs, resulting semantic version if approved, server time, policy revision, decision-time outcome. Immutable JSON canonical serialization persisted for byte-equivalent replay. Decision replay key namespace and proposal binding decided in 4.1, preserving DOC-06. Atomic semantic/lineage/event/state/receipt/replay/outbox operation (4.2); stale new decisions write nothing.
- ProjectionIntentV1: immutable source decision/version and explicit authorized destination reference. CurrentDeliveryObservationV1 is separate, not a receipt update. Optional Epic 7 owns transfer authority, digest, claim/retry/read-back. AD-68 telemetry/delivery details stay 6/7.
- VectorScopeV1 carries group/workspace/principal/action and current authorization revision. Storage paths must have exact equivalent scope and endpoint authorization; no scope-free fallback. Model/dimension/provider/index/worker lease specifics wait for 5.1; no invented embedding column now.

## Restricted role and transaction trust boundary

Dedicated migration owner separate from `allura_app` LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS. App never owns schema/tables, cannot SET ROLE owner or TRUNCATE. Revoke PUBLIC schema/function privileges; grant exact schema usage, parameterized functions and minimal SELECT/INSERT. Enable and FORCE RLS for scoped content tables. Append-only trigger rejects UPDATE/DELETE even for accidental owner DML; production owner remains privileged and unavailable to application.

Server-authenticated identity resolves through a narrow security-definer lookup owned by migration role, fixed search_path, parameterized arguments and PUBLIC EXECUTE revoked. It returns only binding/current authority fields, never content or foreign names. RLS predicate uses transaction-local principal/group/workspace/action settings AND current active principal/membership/workspace/grant rows plus action expansion and machine ceiling. Missing/malformed settings return false, not broadened reads. Cross-scope insert CHECK and composite FKs apply. Scoped queries explicitly filter as defense in depth.

Settings are NOT a security boundary against a stolen shared database login or arbitrary SQL inside the trusted server. Only the authenticated service can set them; clients never receive database credentials or arbitrary query execution. Restricted-role tests prove absent/foreign scope and lack of owner privilege; they must not claim PostgreSQL independently authenticates JWTs from GUC strings. If protection against compromised application SQL is required, move to per-principal DB credentials or signed DB capabilities under separate design. Current isolation requirement concerns authenticated clients and pooled service operations, not hostile migration owners.

Service owns transaction: BEGIN; set_config(..., true) for all context fields; load/revalidate current authority; lock relevant principal/membership/grant/workspace rows for protected mutation; perform bounded parameterized statements; recheck before disclosure/commit; COMMIT. On any exception ROLLBACK before pool return. No session-level SET. Never release an aborted transaction to pool. PostgreSQL READ COMMITTED: revocation accepted before next statement/resolution denies; concurrent mutation holds authority row locks through commit, establishing linearized order with revocation. Retrieval rechecks after awaited work before return; no long-lived positive grants.

## Transaction and migration acceptance

Forward-only versioned numbered SQL migrations with checksums in schema_migrations. Migrations execute transactionally; second application returns unchanged only on exact checksum match, mismatch fails. No destructive down script; disable new route or roll forward. Backup/restore release evidence belongs to 6.4. Never read production env/DB URL as a convenient test target.

Atomic mutation tests inject before event insert, after insert/before audit, and immediately before commit: zero partial rows on rollback. Update/delete/truncate denied for app. Positive reads/append succeed in authorized scope; unauthorized inserts fail and reads expose zero rows. Composite scope FKs reject cross-workspace links. Same physical pooled connection reused for A, then B, then absent context must not retain A. Connection errors cannot turn failure into success. Success receipt only after commit; ambiguous disconnect returns unknown, not proof of rollback.

## Disposable target contract

Explicitly authorized by current direct-build request: uniquely named local Docker PostgreSQL container, loopback-only random port, synthetic DB/users/keys/content, no host data mounts, no shared network/service links, no production credentials. Pin existing postgres:16-alpine image by observed digest for repeatability; record server version. Disable external listening where possible; disposable fixture credential is test-only and never printed. Test driver creates owner and restricted role, migrations and tenant A/B with workspaces HR/Sales/shared and human/service/device principals. Labels mark task ownership. Only delete this run's exact container after logs. No broad Docker prune, no persistent controller. Owner connection is fixture/migration only; actual assertions must use allura_app.

Test IDs: P01 migrations twice/checksum drift; P02 app role not owner/super/bypass; P03 authorized append/read; P04 foreign tenant/workspace zero reads; P05 missing/malformed context denies; P06 forged caller selectors cannot change server authority; P07 revoked membership/grant/principal and lock deny; P08 update/delete/truncate fail; P09 pool reuse A→B→empty; P10 injected rollback leaves zero new rows; P11 concurrent authority transition serialized; P12 event actor spoof disallowed; P13 no credential/content logging. Each required lane fails on missing test discovery or skips. Actual provisioning/testing is Story 2.2, not claimed here.

## Direct self-check disposition

1.3 AC1: concrete Epic 2 entities and later logical immutable record relationships specified; scope keys explicit. AC2: restricted role/current-state RLS/pool boundary and honest GUC trust limit. AC3: atomic/locking/migration/recovery acceptance. AC4: later AD-65/67/68/vector fields deliberately not migrated early. AC5: current user authorization for isolated synthetic DB and exact cleanup scope, real non-owner negative tests. AC6: direct owner cross-contract threat check, not independent review. No unresolved field blocks initial Epic 2 authority/persistence. Runtime authority/access-control services and all product lifecycle features still need implementation and exercised acceptance.
