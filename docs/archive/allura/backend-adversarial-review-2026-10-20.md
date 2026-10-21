# Backend adversarial review — 2026-10-20

> [!NOTE]
> **AI-Assisted Documentation** — this is a dated assessment, not new verification.
> **AI-assisted assessment.** Sabir requested the backend review and approved documenting the prior preview findings. Codex/Brooks coordinated actual Brooks, Knuth and Hightower review tasks. This report records findings, not implemented repairs, final human document review, certification or production penetration-test results.

## Scope and evidence

Reviewed the current dirty checkout at `28d90e84364d1f99e67df4f8a4ebdaafb6fcf0d9`. Existing application edits were preserved. Exact source hashes, offline probes and fixture outputs are under [the evidence directory — source-local receipt unavailable](../../reference/development-readiness-20261021/unavailable-evidence.md); [auth hashes — source-local receipt unavailable](../../reference/development-readiness-20261021/unavailable-evidence.md) and [operations hashes/coverage — source-local receipt unavailable](../../reference/development-readiness-20261021/unavailable-evidence.md) supplement it.

This was a system-wide review of critical boundaries, not exhaustive proof of every endpoint, branch or deployment. No actual foreign-tenant read, live database call, production load, real backup/restore, credential change or service mutation was performed. Mocked persistence verifies call behavior, not database grants or deployed exploitation. Existing tests passing does not establish that every caller uses the tested helper correctly.

| Area | Reviewed / exercised | Remaining limitation |
|---|---|---|
| Web identity and API authority | Proxy dispatch/header handling; current Cloudflare JWT, membership, CSRF helpers; tenant seam; selected legacy handlers; health exposure | Not every endpoint individually exercised; origin/proxy policy, real identity bindings and revocation not tested live |
| MCP ingress | Authenticator/principal/session paths; body buffering/auth order; request quota key | No live load, large-memory exhaustion, proxy sanitization or transport soak |
| Capture, curation and retrieval | Canonical capture/search; retrieval API/helper; vector bridge/adapter; scoped transaction/pool; approval transaction; outbox and relevant migrations | No deployed schema/role/RLS proof; not every historical migration/curator branch tested |
| Jobs and operations | Outbox, embedding lifecycle, budget/circuit-breaker, control-plane gate, process run/parallel/resume/cancel, shutdown and Compose declarations | No distributed worker soak, crash/restart drill, provider outage or production topology proof |
| Backup and restore | CLI caller chain; dump, checksum, manifest, archive selection | Commands/filesystem mocked where destructive; no real recovery or RPO/RTO measurement |
| Product/backend seams | Dashboard bounded-reader patterns; unified search server action; Bumblebee ingestion boundary inventory | Domain modules, SDK/client combinations and all app workflows not exhaustively tested |
| Build and preview | Prior browser crash; tracked/ignored-source check; actual graph layout CPU probe | Clean build relocation, full browser scale/device testing and CI remediation remain open |

The inventory records paths for follow-up; an inventoried path is not a claim of full review. A future release needs [BE acceptance](../../allura/REQUIREMENTS-MATRIX.md#backend-adversarial-acceptance--2026-10-20), existing DEV/CF gates and separately authorized live evidence.

## Findings

### BE-01 — High: caller tenant and actor escape authenticated binding

[Audit events](../../../src/app/api/audit/events/route.ts), [settings](../../../src/app/api/settings/route.ts) and [runs](../../../src/app/api/runs/route.ts) validate a supplied `group_id`'s format without comparing it to the authenticated tenant. Audit source lines 129–133/171, settings 46–69 and runs 60–72/119–172 carry the unsafe values. Runs POST also accepts supplied `actor_id`.

Proxy role checks do not repair tenant selection. These legacy callers use the owner pool rather than the scoped restricted transaction. Four hermetic observations bound the requester to a synthetic tenant and passed a different synthetic destination; foreign scope reached mocked SQL/service calls and returned 200/201. Runs requires `PROCESS_ENGINE_ENABLED=true`. Deployment exposure depends on reachable routes, flags and DB roles; no live leak or foreign write was attempted.

Required repair evidence: **BE-AC01 / RK-45**. Derive tenant/workspace/actor from verified authority, reject mismatches and test the actual route plus restricted storage boundary.

### BE-02 — High: unauthenticated body buffering is unbounded

[canonical-http-gateway.ts](../../../src/mcp/canonical-http-gateway.ts), lines 952–958, accumulates the complete body and parses it; the MCP POST reads it around line 1009 before principal resolution around 1021. A bounded exact-function probe accepted 2,097,168 bytes without a ceiling. The concern is allocation proportional to arbitrary unauthenticated input, not a claim that a 2 MiB request crashed the service. Request-count limiting does not bound bytes; proxy limits were not verified.

Required repair evidence: **BE-AC02 / RK-46**. Bounded streaming admission, appropriate early authentication, explicit oversized-body refusal and agreed deadlines/concurrency budgets.

### BE-03 — Medium: forwarding headers can evade quotas

[rate-limiter.ts](../../../src/lib/health/rate-limiter.ts), lines 48–58, trusts the first `X-Forwarded-For` value without establishing trusted-peer provenance. In a hermetic probe request 101 was denied, then changing only that header on the same socket restored allowance. This matters if direct origin access or proxy behavior permits the value to reach the gateway; deployed sanitation is unknown.

Required repair evidence: **BE-AC02 / RK-46**. Explicit trusted-ingress contract, safe socket fallback and bounded bucket cardinality.

### BE-04 — Medium: public health discloses detailed isolation context

[route-scope-manifest.ts](../../../src/lib/auth/route-scope-manifest.ts), lines 695–698, classifies the health family public. [health/isolation](../../../src/app/api/health/isolation/route.ts), lines 64/74–78, returns workspace root and recent group identifiers, operations and violation messages from a process-wide buffer without caller scoping. A mocked synthetic foreign-scope entry appeared in the public response. No real diagnostic data was retrieved.

Required repair evidence: **BE-AC01 / RK-45**. Minimal public health; authenticated scoped detail.

### BE-05 — High: default retrieval ignores query text

The [retrieval API](../../../src/app/api/memory/retrieval/route.ts) defaults through [retrieval-layer.ts](../../../src/lib/memory/retrieval-layer.ts), lines 252/309–335, to `hybrid`. That branch orders scoped rows by confidence and time without using `req.query`. Exact-source probes for “handbook onboarding” and “volcano insurance” emitted identical SQL/parameters and returned the same mocked row. A successful response can therefore present unrelated knowledge as search output.

This finding concerns this retrieval API/helper, not a claim that every MCP/vector search implementation ignores queries. Required repair evidence: **BE-AC03 / RK-47**. Query-sensitive relevance and explicit no-match behavior across every mode, with human-labeled evaluation.

### BE-06 — Medium: retrieval forwards excessive limits

The same API forwards `body.limit` at line 64; its helper applies only a default at line 253. A probe passed `1_000_000_000` unchanged into SQL `LIMIT`. Large result sets could stress database, serialization and response memory. No actual billion-row query or production outage was attempted.

Required repair evidence: **BE-AC02 / RK-46**. Validate bounded integers and response/query budgets; test large disposable fixtures.

### BE-07 — High: capture can persist, fail and duplicate on retry

[canonical-tools.ts](../../../src/mcp/canonical-tools.ts), line 172, creates a new memory identity per call. Event persistence at lines 191–221 precedes scoring/proposal work. An exact-function probe with mocked transactions injected scoring failure after the event write; repeating the same request wrote another event with another memory ID.

This refreshes existing **AD-65 / RK-36**, not a newly approved replay design. Required repair evidence: **BE-AC04 / DEV-AC01**. Approved durable operation identity/receipt semantics, replay/conflict checks and honest post-commit partial outcomes. Mock writes do not prove actual DB commit behavior.

### BE-08 — High, deployment-dependent: legacy vector path drops workspace scope

[canonical-tools.ts](../../../src/mcp/canonical-tools.ts), around line 430, passes tenant/query to the episodic vector path without workspace. [bridge.ts](../../../src/lib/ruvector/bridge.ts), lines 233–246 and 407 onward, omits workspace on insert and filters search by tenant-valued `user_id` rather than carrying the verified workspace transaction. Migration 40 expects workspace-aware new data.

The mismatch can fail under required schema/roles or widen retrieval with elevated authority. Neither deployed failure nor leakage was tested. Existing **AD-66 / RK-37** remains the governing open decision/risk. Required repair evidence: **BE-AC05 / DEV-AC02**, including restricted-role scope/pool tests.

### BE-09 — Medium: outbox backoff and delivered-state transitions are unsafe

[promotion-outbox-worker.ts](../../../src/lib/memory/promotion-outbox-worker.ts), lines 14–27, orders by `available_at` but does not require it to be due in discovery or claim. The failure update at lines 43–46 does not require the expected prior status or ownership.

Source-derived interleaving: A fails and rolls back; B claims and delivers; A's later failure bookkeeping changes the now-delivered row back to pending/failed. A subsequent retry can emit duplicate delivery evidence. Relevant migrations do not add a monotonic-status guard. This interleaving was reasoned from SQL, not executed on a live DB.

Required repair evidence: **BE-AC06 / RK-39**. Due-time eligibility, conditional/fenced transitions and a deterministic two-worker test.

### BE-10 — High: backup fails at modest dump sizes

The current backup CLI reaches [backup/postgres.ts](../../../src/lib/backup/postgres.ts), lines 149–158. It first captures an entire `pg_dump` in bounded `execSync` stdout, discards that result, then runs a second dump into a file. An offline subprocess probe using equivalent buffering succeeded at 512 KiB and failed at 2 MiB with `ENOBUFS`; the first failure prevents the file-producing invocation.

No real database dump was run. Required repair evidence: **BE-AC07 / RK-48**. One bounded streaming dump, partial-output handling and authorized disposable restore.

### BE-11 — High: checksum verification never hashes the archive

[backup/restore.ts](../../../src/lib/backup/restore.ts), lines 119–127, compares sidecar text to the manifest rather than reading/hashing archive bytes. Missing sidecars return true; validation later labels this “checksum verified.” Exact-source probes accepted changed archive contents and missing sidecar evidence.

Required repair evidence: **BE-AC08 / RK-48**. Hash the actual artifact and reject missing/mismatching expected integrity evidence. A manifest/sidecar agreement alone is insufficient.

### BE-12 — High: same-day restore can select an older snapshot

[backup/worker.ts](../../../src/lib/backup/worker.ts), lines 171/280, uses a day directory and replaces its manifest. [backup/restore.ts](../../../src/lib/backup/restore.ts), lines 540–547, chooses the first alphabetically matching archive instead of the manifest's artifact. The exact restore function with shell execution mocked selected 01:00 while the later manifest named 12:00.

Required repair evidence: **BE-AC08 / RK-48**. Immutable run identities and restoration of exactly the verified manifest artifact, tested with two distinct same-day datasets.

### BE-13 — Medium, library-level: parallel run reports false completion

[process-engine/engine.ts](../../../src/lib/process-engine/engine.ts), around line 294, ignores rejected `Promise.allSettled` results. A mocked `process_step_started` audit failure produced `status: completed`, a step still `running`, and `stepExecuted: false`; completion occurs around line 349.

No non-test production `runParallel` caller was found. This is a confirmed library defect with unverified production reachability. Required repair evidence: **BE-AC09 / RK-49**. Rejected settlements and incomplete terminal states must prevent completion.

## Preview findings carried forward

- **PV-01 / RK-43 — High:** Browser test on the existing direct React build: `#embeddings?record=0` renders; `record=0.5` blanks the root with `undefined.title`; navigating to `#ecommerce` stays blank until reload. Current source `visual-fixture/main.tsx` lines 64/111 confirms the unvalidated fractional index.
- **PV-02 / RK-42 — High:** `git check-ignore` reports `.gitignore:55:artifacts/` for the preview source and commerce test; `git ls-files` returns neither. A clean Git checkout cannot reconstruct these files from this repository alone. External backup coverage is unknown.
- **PV-03 / RK-44 — Medium:** Exact layout block in `connections-graph.tsx` lines 52–81 took 440.1–447.7 ms for a synthetic 5,000-node/4,999-edge star graph. It runs on every render including List and search. This is CPU-only, excluding React/DOM/WebGL, not a browser frame or production-capacity benchmark.
- **Secondary observation:** Reader mode still exposes Reset work board while describing read-only behavior. This may be an intentional global demo control; it is not treated as a confirmed production authorization bypass or an approved new security policy.

The previous review's receipt is preserved in [preview evidence — source-local receipt unavailable](../../reference/development-readiness-20261021/unavailable-evidence.md). **PV-AC01–05 remain open.**

## Validation and interpretation

- Auth: six hermetic adversarial observations reproduced the stated route/health/quota behavior. These tests assert the unsafe current behavior; a passing observation test is not a security pass.
- Auth regression: six existing files, 124 tests passed for Cloudflare JWT/authority/CSRF, API tenant seam, MCP authenticator and paired-device cache bypass. This does not cover every route's use of those seams.
- Data: exact-source mocked retrieval and capture probes reproduced query-insensitivity, excessive limit forwarding and post-write retry duplication. Outbox/vector conclusions are source/schema analysis with stated integration limits.
- Operations: exact-source mocked checksum/selection/process probes and a bounded subprocess-buffer probe reproduced the listed failures. No destructive backup/restore commands were executed.
- Existing preview crash and CPU timings were reviewed, not rerun as new backend acceptance.
- Source and evidence hashes identify the evaluated checkout. Documentation guards/link/traceability checks are recorded separately in the final receipt; they do not convert open findings into passed acceptance.

## Recommended sequence and boundaries

1. Repair authority/diagnostic exposure and bound ingress/retrieval work, with actual-entrypoint negative tests.
2. Repair backup integrity/selection/streaming and prove restoration in an authorized disposable environment before relying on recovery.
3. Resolve existing capture/vector decisions, repair retrieval semantics and fence worker transitions; test interruption, replay and concurrency.
4. Move maintained preview code into tracked application ownership, contain its crash, establish scale budgets and complete the broader regression coverage.

Backend remediation is recommended here; new schema, permission, replay, deployment or destructive recovery choices still require their existing concrete approval. Source review does not authorize production fault injection. Later feature expansion must not conceal these open findings.

Fresh Brain search used `allura-system`, trajectory `f2f7bf68-ce35-44e6-9232-673d0735ed39`; five historical records supplied context only. No outcome write was attempted because the exposed `memory_add` schema lacks the project's required server idempotency-key parameter. No persistence or semantic promotion is claimed.
