# Transport & Auth

## API Endpoints

### `POST /api/plugins/bumblebee/runs`

Issues a scan lease. The runner authenticates with its long-lived `bumblebee_runner` credential and receives a short-lived `bumblebee_ingest` token bound to the source revision.

**Request:**
```http
POST /api/plugins/bumblebee/runs
Authorization: Bearer bmb_runner_<token>
Content-Type: application/json

{
  "sourceId": "src_abc123",
  "sourceRevisionId": "rev_def456",
  "durationSeconds": 120
}
```

**Response (201):**
```json
{
  "leaseId": "<uuid>",
  "generation": 7,
  "expiresAt": "2026-09-02T14:32:00.000Z",
  "ingestToken": "bmb_ingest_<random>",
  "groupId": "allura-myorg",
  "workspaceId": "ws_prod",
  "sourceId": "src_abc123",
  "sourceRevisionId": "rev_def456"
}
```

**Error codes:**

| Code | HTTP | Meaning |
|------|------|---------|
| `BUMBLEBEE_AUTH_INVALID` | 401 | Token not found or hash mismatch |
| `BUMBLEBEE_AUTH_REVOKED` | 401 | Credential revoked |
| `BUMBLEBEE_AUTH_EXPIRED` | 401 | Credential past expiry |
| `BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN` | 403 | Wrong token audience (runner vs ingest) |
| `BUMBLEBEE_AUTH_CREDENTIAL_CLASS_FORBIDDEN` | 403 | Not a plugin_token credential |
| `BUMBLEBEE_LEASE_INVALID_DURATION` | 400 | Duration not 1–300 seconds |
| `BUMBLEBEE_LEASE_SOURCE_REVISION_MISMATCH` | 409 | Source revision not found or not owned by credential |

### `POST /api/plugins/bumblebee/ingest`

Accepts scanner NDJSON output. The scanner authenticates with the short-lived `bumblebee_ingest` token from its lease.

**Request:**
```http
POST /api/plugins/bumblebee/ingest
Authorization: Bearer bmb_ingest_<token>
Content-Type: application/x-ndjson
Content-Encoding: identity

{"record_type":"package","record_id":"package:<sha256>",...}
{"record_type":"finding","record_id":"finding:<sha256>",...}
{"record_type":"scan_summary","record_id":"scan_summary:<sha256>",...}
```

**Responses:**

| Code | HTTP | Meaning |
|------|------|---------|
| Accepted | 201 | `{ batchId, accepted: true, recordCount }` |
| Replay | 200 | `{ batchId, replayed: true }` — identical body hash under same lease |
| Conflict | 409 | `{ error: "BUMBLEBEE_BATCH_CONFLICT", batchId }` — different body under same lease |
| Too large | 413 | Body or line exceeds size limit |
| Unsupported encoding | 415 | Content-Encoding is not `identity` |
| Wrong content type | 415 | Content-Type is not `application/x-ndjson` |
| HTTPS required | 426 | Non-HTTPS request in production (see below) |
| Conformance error | 400 | Malformed line, unknown record type, schema mismatch, etc. |
| Service unavailable | 503 | Internal failure — no acceptance claimed, client must retry |

## Credential Split

The plugin enforces a strict two-token architecture:

| Credential | Audience | Scope | Lifetime | Accepted by |
|-----------|----------|-------|----------|-------------|
| `bumblebee_runner` | Long-lived runner auth | One source revision | Configured by operator | `POST /runs` only |
| `bumblebee_ingest` | Short-lived scan ingestion | One lease + source revision | 1–300 seconds (max 5 min) | `POST /ingest` only |

**Cross-route rejection is exact:**
- `bumblebee_runner` is refused by ingest, MCP, and browser routes
- `bumblebee_ingest` is refused by runs, MCP, and browser routes

Tokens are namespaced by prefix (`bmb_runner_` vs `bmb_ingest_`) so the wrong audience is detected before any DB lookup. Token hashes are HMAC-SHA256 with a server secret (`BUMBLEBEE_TOKEN_SECRET`, ≥16 chars), and verification uses `timingSafeEqual` to prevent timing attacks.

## HTTPS Enforcement

Production ingestion is **HTTPS-only**. The `enforceHttps()` gate in the ingest route fails closed — an absent or unproven scheme signal is rejected, never silently accepted.

Three ways to pass:

1. **Direct HTTPS** — the request's own URL scheme is `https:` (a signal the caller does not control)
2. **Trusted proxy** — `BUMBLEBEE_TRUST_PROXY=true` AND `x-forwarded-proto: https` header present (the header alone is never sufficient without the trust flag)
3. **Loopback test** — `BUMBLEBEE_ALLOW_LOOPBACK_INGEST=true` AND the request hostname is `localhost`, `127.0.0.1`, or `[::1]`

Any other combination throws `BUMBLEBEE_INGEST_HTTPS_REQUIRED` → HTTP 426 (Upgrade Required).

## Idempotency

- **Exact replay**: same `(lease, body_sha256)` → returns the prior batch receipt with `replayed: true` (200)
- **Conflict**: same lease, different body → `409` with the accepted batch ID so the client can inspect what landed
- **Deterministic batch IDs**: `batch_<sha256(leaseId + bodySha256)[:32]>` — a retried upload after a failed persist targets the same batch identity
- **Deterministic decision IDs**: `dec_<leaseId>_<batchId>` — a retried promotion targets the same row
- **Database failure**: `503` with no acceptance claim — the scanner must treat the batch as un-landed and retry