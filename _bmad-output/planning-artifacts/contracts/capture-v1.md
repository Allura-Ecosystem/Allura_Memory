# Capture v1 — AD-65 local build disposition (Story 3.1)

Owner: Brooks, product/interface/data/worker contract; Woz implementation responsibility through this direct builder. These are delegated design choices under Sabir's 2026-10-26 instruction, not historical user mandates or independent specialist reviews. Protected source AD-65/DESIGN-ALLURA remains unchanged. Applies to this fresh local rebuild only. No deployed consumer is deprecated or migrated.

## Request and identity

Fresh version `capture-v1` requires `idempotency_key`, 1–128 ASCII `[A-Za-z0-9._:-]`. Operation identity is `(authenticated group, workspace, principal, memory_add, key)`. Different actors/workspaces intentionally have separate keys. Key is not content deduplication; two different keys can capture identical content intentionally. Caller cannot set actor or promote. Public MCP integration is later 6.2; no new alternate HTTP capture endpoint.

Typed request permits only content, idempotency_key, trace_type, threshold and metadata. Content is nonblank UTF-8 text up to 48,000 bytes, persisted verbatim (no trim/Unicode rewrite). Trace type is run/tool/failure/cron/conversation; default conversation. Threshold is optional/null or finite [0,1], default null (no invented scoring promise). It is only a future proposal-selection hint, never promotion permission. Metadata is an object with optional source/source_id strings (1–1024 chars) and tags (0–32 strings, each 1–128 chars); 4096 encoded bytes maximum. Unknown fields/authority claims, non-JSON values and nonfinite numbers reject. Explicit null metadata rejects; absent metadata normalizes to empty object.

Digest: SHA256 of UTF-8 canonical JSON tuple `["capture-v1","memory_add",group,workspace,principal,content,effective_trace_type,effective_threshold,effective_metadata]`. Sort object keys recursively; preserve array order and content bytes. Key and volatile times are excluded. No ignored legacy authority fields accepted in this new typed contract. Equivalent defaults/metadata order hash identically. Different content/type/threshold/provenance changes digest. Persist precisely that normalized payload, not a second independently normalized variant.

## Atomic persistence and replay

Authorize current memory:capture first, acquire transaction-local lock on the scoped operation identity, then reread replay. Same digest returns the exact stored receipt bytes; different digest gives conflict with zero new rows. New event, immutable receipt text, replay binding and immutable index intent commit in one restricted PostgreSQL transaction. Scope FKs, FORCE RLS and immutable triggers apply. Operation-lock serialization avoids publishing losing/uncommitted IDs. Transaction rollback drops all four rows; ambiguous disconnect/timeout remains unknown and reconciles using the same key. Never retry with a new key automatically.

Receipt fields: version, receipt_id, event_id, group_id, workspace_id, principal_id, digest_version, digest, accepted_at (database time), persistence="succeeded", indexing="pending", proposal="not_generated", promotion="not_requested". Receipt is decision-time capture evidence, never rewritten as downstream state changes. No numeric score or `stored: both` fiction. `memory_get` will provide authorized exact receipt read-back in 5.2/6.2; internal read-back is tested in 3.2. A receipt is not an active semantic memory.

## Worker, admission and retention decisions

All attempts consume finite ingress/concurrency resources. Only the new durable transaction creates an index intent; same-key replay creates no event, receipt, intent or proposal. No billable capture quota is introduced locally. Distributed quotas stay 6.1. Index worker implementation/model contract belongs to 5.1; this story persists intent only and makes no provider call. Worker policy for that story: explicit owned lease, at most 5 attempts per intent, bounded exponential backoff, terminal failure observation, no automatic budget reset; concrete model/provider compatibility must be decided before processing. Provider outage cannot roll back durable capture.

No TTL or deletion of operation/replay/receipt evidence. Retention remains append-only until separately approved policy. No cleanup job. This is intentionally not legacy-client compatibility: existing deployed versions are unverified and unchanged. New local consumers must negotiate/declare capture-v1; 6.2 inventories deployed callers before any rollout. Unsupported legacy requests fail this fresh interface explicitly; no silent key generation or retry-safe claim.

## Acceptance and scope

3.1 resolves operation/digest, normalized fields, response stages, admission, retention, worker owner and local compatibility boundary. 3.2 must exercise concurrent identical-key replay, conflicting payload, scope/actor separation, denied capture with zero effects, read-back after lost response, rollback at each durable boundary and provider-independent capture. 3.3 owns evidence-linked pending proposals. Product authorized independent human semantic review is untouched.
