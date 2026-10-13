# Story 26.4 — Security-Owner Approval Record

> **Status: APPROVED 2026-08-27.** See the Approval section at the bottom.
> Everything below this line up to that section is the proposal as drafted
> by Brooks (agent) for human review; the Approval section itself was
> completed based on the security owner's explicit approval of this draft,
> not by the agent on their own authority.

## What this approves

Story 26.4 (Scheduled Discovery and Alert Routing) needs four concrete
decisions before any scheduler code is written, per its acceptance criteria
and the Story 26.1 trust contract (AD-57). This record proposes defaults for
each, drawn from patterns already in use elsewhere in this repository.

### 1. Advisory sources (the allowlist)

No source is currently allowlisted anywhere in this repo — Story 26.1 defined
the *mechanism* (a source must be reviewed and pass a verification rule) but
named no actual feed. Proposed starting allowlist:

| Source | URL | Verification rule |
|---|---|---|
| GitHub Security Advisories | `https://github.com/advisories` (GraphQL API) | GitHub-signed API response; reject unsigned/HTTP fallback |
| OSV.dev | `https://osv.dev` (API) | HTTPS only; reject if TLS cert invalid |
| npm audit advisory database | via `npm audit` API, not local `npm` invocation (Story 26.2 forbids package-manager invocation) | HTTPS only |

**Decide:** approve this list as-is, remove any, or add others.

### 2. Polling cadence

Proposed: **every 6 hours**, matching the existing content-curator schedule
(Story 21.2, `allura-content-curator` systemd timer).

**Decide:** approve 6h, or pick a different interval.

### 3. Retry / freshness thresholds

Proposed, consistent with Story 26.1's `fresh | stale | degraded | unknown`
states (`docker/postgres-init` and `DATA-DICTIONARY.md`'s `ThreatAdvisoryEvidence`):

- A source not successfully fetched for **2 consecutive cycles** (12h) →
  marked `stale`.
- A source failing for **6 consecutive cycles** (36h) → marked `degraded`;
  its existing evidence remains visible but no new alerts are generated from
  it until it recovers.
- Any fetch that cannot be verified against its source's verification rule →
  rejected outright as `rejected` evidence, never `stale` — it never entered
  the trust boundary in the first place.

**Decide:** approve these thresholds, or change the cycle counts.

### 4. Retention

Proposed: advisories, alerts, and their supporting evidence are retained
**indefinitely** (same as the append-only `events` ledger) — this is an
audit trail, not transient cache. Soft-deletion, if ever needed, follows the
same 30-day recovery window as `memory_delete` (per `DATA-DICTIONARY.md`).

**Decide:** approve indefinite retention, or set an explicit expiry.

## What this does NOT approve

Per AD-57 and Story 26.1, nothing in this record authorizes: policy
activation, package/CI blocking, containment, credential revocation,
workspace locking, or any change to the scheduler's own configuration by the
worker itself. Those remain separately gated, later decisions (Stories 26.5
AC 6-7, already closed; 26.6, not yet started).

## Approval

- Security owner: Sabir Asheed (ronin704)
- Date: 2026-08-27
- Decision: [x] Approved as drafted
- Changes / rationale: None requested. Approved via direct chat instruction after reviewing the proposal in full (sources, cadence, thresholds, retention all as drafted above).

---
Drafted by: Brooks (agent), 2026-08-27.
Approved by the security owner, 2026-08-27. This record is the canonical evidence for Story 26.4's "security-owner approval" acceptance criterion and dependency.
