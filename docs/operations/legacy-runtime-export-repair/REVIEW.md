# Independent candidate review

The final supplied cancellation-safe source-only patch is preserved byte-for-byte, not silently corrected by packaging. Review references below are paths **inside the offline legacy export**, not foundation files. The prior finding remains recorded below alongside its correction.

## Findings

### P2 — query cancellation mislabeled as a backend outage: corrected in final candidate

**Original finding, retained for history:** the prior candidate (patch SHA-256 `c645ffa9ba4bb20b0d17ee5e56a26636a025cdc210bd0f2b869f9c425d902635`, helper SHA-256 `7812bb19bf0522155dc7708b371bd03bbb6f45de8734e47f39544b06cb3ba0d2`) delegated non-authorization failures to the unchanged `classifyPostgresError`. Its `src/lib/errors/database-errors.ts:84-93` classifies every `57*` code, including `57014` (`query_canceled`), as `DatabaseUnavailableError`. A canceled/statement-timeout semantic query could therefore produce a successful both-store response containing episodic records and `graph_unavailable`, despite the database still being reachable.

That finding did not expose unauthorized records: partial responses carried warnings and `incomplete: true`, and canonical-only mode still threw. It did contradict a strict claim that *only connection outages* can degrade. The original independent test explicitly characterized the known defect, not desirable behavior.

**Correction independently reviewed:** final patch SHA-256 `56b78a161bebd621e9504d9dbe12eb97350bbc31bb91c0e2326b914da4876bcb` changes only the helper relative to the prior candidate; `canonical-tools.ts` remains unchanged. In `src/mcp/canonical-tools/scoped-export.ts:86-96,111-119`, a cycle-safe cause traversal recognizes exact SQLSTATE `57014` before the general classifier or acceptance of an already classified `DatabaseUnavailableError`. It throws `DatabaseQueryError` with the original error as cause. The existing permission check still runs first. No SQL, scope, pagination or successful-response behavior changed.

Six additional unit cases verify direct, wrapped, preclassified and cyclic cancellation, canonical-only rejection, and second-source cancellation discarding the already fetched semantic result. The retained independent review case is now a rejection regression: it checks error type/operation/cause, absence of episodic fallback, and original authorization-error identity when cancellation and denial coexist in either cause-chain order. This closes P2 for the supplied candidate, not for the shared classifier elsewhere.

Other `57*` codes and `3D000` (invalid catalog name) remain inherited availability classifications. Export warnings describe that classifier's result, not independently confirmed network reachability; do not claim every degraded response proves a connection outage.

### P3 — wrapped network failures are not unwrapped for availability classification

Authorization detection traverses causes (including cycles), but general outage classification checks only the outer error. An arbitrary wrapper around an `ECONNREFUSED` cause becomes `DatabaseQueryError`. The added characterization verifies this conservative failure. It is not an access-control bypass, but callers cannot assume all wrapped network failures yield partial coverage. Do not fix this by accepting arbitrary error text as proof of an outage.

## Access review

- The unchanged real `guardToolCall` enforces `memory:read`, tenant membership and actor selectors; caller workspace/scope is stripped before authenticated scope injection. The exporter itself is an internal function, not an independent authentication boundary.
- Missing workspace/principal authority or a cross-principal selector fails before connection acquisition. Semantic reads retain existing workspace-shared visibility when no explicit `user_id` is supplied; an explicit selector can only narrow to the verified principal. Episodic reads always select that principal.
- Both SQL statements carry tenant/workspace predicates. Semantic rows and supersession edges require `workspace_scoped`; unassigned legacy rows remain excluded. Actual copied transaction helpers supply transaction-local tenant/workspace/principal context through the restricted connection path.
- SQL `42501`/`28*`, HTTP 401/403 and nested authorization failures stop the operation. Second-source denial discards the already fetched first source. No new role, token, grant, permission or cross-principal selector is introduced.
- The fixture RLS role is non-superuser/non-BYPASSRLS. Its authored policies are not proof of the complete deployed policy set. Full-schema/server/transport integration belongs to a separate check.

## Pagination review

For a fixed dataset, each source is unique by memory ID. Taking the first `offset + limit + 1` IDs from **each** source is sufficient: any record in the first global prefix has no more predecessors within its own source than in the union. Semantic precedence cannot be lost at a page boundary, since an ID's source-local rank cannot exceed its union rank. Deduplication precedes the global slice, and counts describe that slice.

SQL `COLLATE "C"` and `Buffer.compare` agree on UTF-8 byte order. Original multi-page SQL tests plus the added TEXT-ID/non-ASCII test exercise this. The default limit remains 1000 and returned limit is capped at 10000. Offset is now restricted to a safe integer from 0 through **100000**. Healthy truncation sets `export_page_limited`/`incomplete` without declaring an outage.

This is intentionally **ID-ascending order**, not the old creation-time order. Each store uses a separate transaction; concurrent writes can shift pages. Metadata states `id_order_offset_pagination_not_snapshot_isolated`; no snapshot export is promised. The row prefix is bounded, not query work, response bytes or production latency. Large content and deep offsets still require representative performance testing. Exports beyond the offset cap need a separately designed cursor contract.

## Schema and proof boundaries

The supplied minimal SQL fixture uses UUID graph IDs, JSONB tags, and simplified policies. Archived migrations were independently inspected at Git revision `97c5eef74d13fc3a71d4c50c18e29b8525474ddd`:

- `docker/postgres-init/21-graph-adapter-tables.sql` declares TEXT graph IDs, TEXT[] tags, REAL scores and a composite `(id, group_id)` primary key.
- `docker/postgres-init/39-workspace-subgraph-foundation.sql` adds event workspace identity and restrictive workspace policy.
- `docker/postgres-init/40-workspace-subgraph-forward-upgrade.sql` adds graph workspace/scope-state columns and policies.

The added review fixture checks the actual TEXT/TEXT[]/REAL type shapes, including non-ASCII ID order. It deliberately does **not** recreate the full migrations, foreign keys, triggers or deployed RLS. There was no discovered type-shape incompatibility in those checks; this is not a full production-schema compatibility claim.

Canonical-only never reads episodic data or falls back. Both mode is current semantic **plus principal episodic evidence**, not a canonical-only backup or all-principal history archive. Query/schema/retired-operation errors fail loudly, including the corrected cancellation path; other inherited availability classifications and the P3 wrapper limitation remain as documented above. Embedded SQL denial/missing-table tests are real PostgreSQL-engine errors, while outage/cancellation/wrapped-error checks use injected errors. No live outage was caused. Separate full-schema/server integration and protected CI for the exact published revision are not acceptance evidence supplied by this portable bundle; no production acceptance is claimed.
