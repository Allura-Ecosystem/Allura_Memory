# Security & Privacy

## Credential Architecture

### Two-token split

The plugin uses a strict two-credential design with no overlap:

| Credential | Prefix | Audience | Route access | Lifetime |
|-----------|--------|----------|-------------|----------|
| Runner | `bmb_runner_` | `bumblebee_runner` | `/runs` only | Long-lived (operator-configured) |
| Ingest | `bmb_ingest_` | `bumblebee_ingest` | `/ingest` only | 1–300 seconds (max 5 min) |

**Route authorization is exact** (`source-authority.ts` → `authorizeBumblebeeRoute()`):
- `bumblebee_runner` is refused by ingest, MCP, and browser routes
- `bumblebee_ingest` is refused by runs, MCP, and browser routes
- Non-`plugin_token` credential classes are refused everywhere
- Expired or revoked credentials are refused

### Token hashing

- Tokens are HMAC-SHA256 hashed with `BUMBLEBEE_TOKEN_SECRET` (≥16 chars, env var)
- Only the hash is stored in the database — the raw token is never persisted
- Verification uses `timingSafeEqual` to prevent timing attacks
- The token prefix (first 8 body chars + namespace) is stored for DB lookup; the full token is never recoverable

### Lease-bound ingestion

A bare scanner invocation without a valid lease can persist nothing:
1. The runner authenticates → gets a lease + short-lived ingest token
2. The ingest token is bound to the specific source revision and lease
3. The ingest route authenticates the token and reconstructs the lease scope
4. All persistence is scoped to the lease's `group_id` + `workspace_id` + `source_id`

## Sanitization

### Field allowlist

Only explicitly allowlisted fields are persisted in `sanitized_payload`. Everything else is stripped before storage. The allowlist is defined in `batch-conformance.ts` → `SANITIZED_FIELDS` (a frozen `Set`).

**Stripped fields include:** `endpoint` (hostname, username), `scan_time`, `scanner_name`, `scanner_version`, and any unknown future field the upstream scanner adds.

**Redaction provenance** is recorded: `{ endpoint: "stripped" }` — so it's auditable that endpoint identity was removed, not just absent.

### Why allowlist (not denylist)

A deny-list would silently persist new device-identifying metadata the upstream scanner adds in future versions. The allowlist ensures only reviewed, safe fields are stored.

## Size Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Max body bytes | 8 MB (`MAX_BODY_BYTES`) | Bound ingestion memory |
| Max expanded bytes | 64 MB (`MAX_EXPANDED_BYTES`) | Decompression bomb bound |
| Max line bytes | 1 MB (`MAX_LINE_BYTES`) | Prevent oversized records |
| Max records | 10,000 (`MAX_RECORDS`) | Cap batch size |
| Max lease duration | 300 seconds (`MAX_LEASE_SECONDS`) | Short-lived ingest tokens |

A hostile or runaway scanner payload must never be able to balloon the process before validation runs.

## Zero-Trust Architecture

The bumblebee plugin implements zero-trust principles at every layer:

| Principle | Implementation |
|-----------|---------------|
| **Never trust caller scope** | Scanner cannot self-assert tenant/workspace; server binds scope via lease at issuance |
| **Least-privilege credentials** | `bumblebee_runner` (long-lived, runs route only) and `bumblebee_ingest` (≤5 min, ingest route only) — cross-route rejection is exact |
| **Verify before process** | Authentication runs before a single body byte is buffered — no free request processing for unauthenticated callers |
| **Recompute, don't trust** | Record IDs are recomputed server-side from canonical inputs; findings are provisional until matched against accepted packages + catalog digest |
| **Fail closed** | Absent/unproven signals are rejected, never silently accepted (HTTPS, content-type, encoding, schema) |
| **Tamper-evident audit** | Immutable batch receipts, append-only run decisions, promotion = new fact never an update |

### Edge TLS termination (Cloudflare)

Production ingestion is HTTPS-only. TLS termination occurs at the edge via Cloudflare tunnel. The plugin's `enforceHttps()` gate handles the proxy trust boundary explicitly:

- Direct HTTPS (no proxy) — accepted via the request's own `https:` scheme
- Behind Cloudflare proxy — `BUMBLEBEE_TRUST_PROXY=true` + `x-forwarded-proto: https` (the header alone is never sufficient without the trust flag)
- Loopback test override — `BUMBLEBEE_ALLOW_LOOPBACK_INGEST=true` + actual loopback hostname

This pattern ensures the proxy trust boundary is explicit and operator-controlled, not implicit.

## Fail-Closed Patterns

### Authentication before body parse

Auth runs before a single body byte is buffered — an unauthenticated caller receives no free request-body processing work.

### Atomic persistence

The entire batch (receipt + all records + held decision) is one transaction. A failure in any INSERT rolls back everything. The scanner never sees a partially-landed batch.

### No acceptance on failure

Any internal failure returns `503` with `BUMBLEBEE_SERVICE_UNAVAILABLE` — no acceptance claim. The scanner must treat the batch as un-landed and retry.

### Content-Type and encoding gates

- Content-Type must be `application/x-ndjson` — anything else is rejected before parsing
- Content-Encoding must be `identity` — compressed payloads are rejected deliberately (not silently decompressed) to avoid bomb attacks

## Database Security

### Row Level Security

Every table has:
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- Exact app-role policies (not broad grants)
- Composite workspace authority (`group_id` + `workspace_id`)
- Least-privilege grants

### Tenant-scoped transactions

All DB operations run through `withTenantTransaction()` which scopes the transaction to the authenticated tenant/workspace. The `principalId` is set to the credential or lease identity, not a shared service account.

### Immutable guards

Source revisions, catalog revisions, batch receipts, and records are append-only. Promotion is a new fact, never an update of the held decision. This makes the full audit trail tamper-evident.

### Non-owner proof

Fresh PostgreSQL proof is required — tests run as a non-owner role to verify RLS policies actually fire, not just exist.

## Secret Canaries

Secret canaries must be absent from:
- Logs
- HTTP responses
- Stored payloads
- Events
- Receipts

The sanitization layer strips endpoint metadata before any persistence, and the allowlist prevents future fields from leaking secrets without an explicit review.