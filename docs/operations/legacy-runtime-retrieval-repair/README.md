# Legacy runtime: deterministic scoped retrieval repair

This is an **undeployed candidate**, not a foundation implementation or a production acceptance receipt. It repairs the older deployed MCP runtime while the main branch contains a separate foundation rebuild. Apply only to an offline export matching `base-source-sha256.json`. The newly added helper must not already exist.

## Diagnosis and behavior

The deployed gateway advertises federated memory search, but its omitted status routes to approved semantic-only search. Episodic records are therefore invisible regardless of index health. The dormant all-mode also uses an unscoped vector-feedback path, query-time timestamps, ID-only deduplication, and unstable ordering. No index rebuild is justified by this diagnosis.

The replacement routes ordinary and explicit all-mode searches through verified tenant/workspace/principal context. PostgreSQL events support exact ID, literal substring and full-text matching without embeddings. The PostgreSQL/RuVector semantic graph supplements this with full-text and trigram matching. The unsafe vector-feedback path is removed from this operation; there is no cache, promotion, history rewrite, or schema/index migration.

Episodic retrieval is restricted to the authenticated principal. Semantic retrieval preserves existing workspace-shared visibility; an explicit same-principal user filter narrows it. Tenant/workspace predicates supplement transaction-scoped RLS. Authentication and permission failures, including wrapped PostgreSQL 42501 failures, abort without returning partial records. Other source failures produce sanitized coverage limitations.

Ranking is fixed in `pg-scoped-lexical-v1`: exact ID, literal phrase, then lexical relevance. Both database candidate selection and final merge order by relevance descending, original creation time descending, and ID ascending using byte order. Version provides a final tie-breaker for the same ID. Duplicate representations merge by ID and version; different versions remain distinct. Confidence remains separate from relevance and still controls `min_score`.

Existing approved semantic SUPERSEDES edges bring both endpoints into result relationships even when the predecessor wording differs. Dates alone never establish authority. Source content, IDs, versions and original timestamps are preserved. Episodic records currently lack a governed relationship representation; this is explicitly reported, with separate approval proposals required. Soft-deleted records are excluded; explicitly superseded semantic history remains retrievable.

Request fields and existing result fields remain present. Optional result version/relevance/relationships and response coverage/configuration/revision metadata are additive. Explicit approved mode remains semantic-only. Legacy proposed/deprecated requests retain the previous all-evidence behavior and now disclose that the requested status filter is unsupported. No global flag expands authenticated scope.

## Coverage limits

Responses explicitly mark incomplete coverage: embedding similarity and episodic relationship traversal are not available in this repair. Index and data revisions are null because the deployed system supplies no authoritative revision tokens. Per-source result truncation, history truncation, backend unavailability, and unsupported graph engines are separately identified. An empty response is not a claim of complete system-wide absence. Searches cover only the caller's authorized scope.

## Offline reproduction

Use Python 3, the repository's installed TypeScript compiler, and the pinned Node 24 toolchain. No dependency installation is required. The verifier does not deploy or connect to a database.

```sh
python3 /path/to/repair/verify-export.py /path/to/offline-export --apply
python3 /path/to/repair/verify-export.py /path/to/offline-export
TYPESCRIPT_PATH=/path/to/typescript node /path/to/repair/tests/routing.cjs /path/to/offline-export
```

The integration harness requires a **new disposable** PostgreSQL 16 container named `allura-retrieval-synthetic-20261113`, with network disabled and a tmpfs at `/var/lib/postgresql/data`. It rejects other network/storage configurations. It recreates only that synthetic container's public schema and seeds invented records. Never redirect it to any runtime database.

```sh
docker run -d --name allura-retrieval-synthetic-20261113 --network none \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust pgvector/pgvector:pg16
TYPESCRIPT_PATH=/path/to/typescript node /path/to/repair/tests/retrieval.cjs /path/to/offline-export
```

## Validation and performance

Eleven SQL integration cases passed: Brooks top-five without embeddings; exact-ID/phrase recall; 20 frozen ordering repetitions with pre-limit ties; tenant/workspace/principal isolation and deletion; explicit lineage; shared semantic visibility; wrapped permission denial; outage coverage; literal wildcard characters; ID/version deduplication; and revision/truncation reporting. Separate routing checks exercise the actual exported canonical operation, transaction authority propagation, missing authority, mismatched principal, second-store denial, complete outage, and unsupported backend.

Full baseline and candidate typechecks produce the same pre-existing error: the legacy benchmark runner imports an absent `scripts/ci/benchmark-contract` module. There are no additional candidate diagnostics; the full typecheck is **not green**. Offline patch applicability and resulting source hashes pass. Six mocked deployment-helper tests pass, covering redaction, explicit approval, configuration preservation, drift rejection, failed replacement recovery, and rollback.

A corrected synthetic baseline of 20 mixed queries measured p50 602 ms and p95 1084 ms, including Docker/psql process startup for every query. These are harness latencies, not production service latency or a production performance guarantee. No post-baseline optimization or cache is included, so a 10% improvement/regression comparison is not claimed. Synthetic EXPLAIN ANALYZE was inspected (episodic 1.065 ms, semantic 0.470 ms on the small fixture); this is not production index-sizing evidence. Record representative service latency under identical conditions after approved deployment before any tuning.

## Deployment and rollback gates

The private deployment package builds a derivative of the exact verified running image and retains its layer prefix. It preserves runtime configuration, mounts, networking, credentials, command and entrypoint. Deployment replaces only the MCP service, briefly interrupting its connection. It does not recreate PostgreSQL, rebuild indexes, or run a memory migration.

Separate deployment approval is required. Before stopping anything, the helper rechecks the original image/container, static configuration fingerprint, candidate ancestry and payload label against the approved plan. The original container and image are retained for rollback; rollback never erases memory history. Live source hashes were verified against the candidate's baseline, including the later audit-contract update.

After approved deployment, perform a read-only manual audit in the existing authenticated scope. Require the real Brooks correction in the first five results; compare canary direct-get/list/search, preserve historical receipts, and report unknown revisions rather than claiming a frozen live snapshot. An `audit:read` denial blocks health coverage and must not trigger credential changes. Create the Wednesday 15:00 America/New_York audit-and-propose job only after that manual audit succeeds; verify timezone and next occurrence through scheduler readback.

Live records, correction IDs, container configuration, detailed runtime fingerprints and private receipts are intentionally excluded from this source artifact. They are in the user's private review package. No commit, push, deployment, memory mutation or recurring job has been performed by this repair preparation.
