---
title: '5.2 Authorized current/history retrieval and provenance graph'
status: done
created: 2026-10-26
baseline_commit: 938c90080b3d6def3cd369916afa62f022f99ca2
---

# Scope and delegated defaults

Trusted services and explicit human/machine routes provide semantic get/list/search and graph. Current excludes superseded/deprecated by default; history=true exposes approved historical versions, never pending proposals or raw evidence by implication. Existing memory:read authorizes semantic history. Raw provenance nodes require explicit includeEvidence plus current evidence:read AND memory:read. Hidden endpoints are omitted before edge/count/cursor/label disclosure, not merely redacted afterward. Foreign/missing semantic IDs indistinguishable not_found. No global/null workspace repair.

List is bounded20 snippets with live UUID-keyset pagination, not snapshot totals. HMAC cursor key explicitly supplied by server, at least32 bytes; bind version, current principal, group/workspace, history mode, page size, last returned ID,15-minute expiry. Replay across identity/scope/filter, mutation or expired/malformed token rejects after current authorization. No positive grant cache. Full content via exact get; list/graph snippets explicitly truncated.

Graph root optional; root-scoped traversal depth0–2, max40 semantic nodes; only supersedes and historical exact-text equivalence relationships actually present in authoritative PostgreSQL. Whole-workspace window is bounded with honest truncation. Raw provenance when separately authorized bounded20 evidence nodes, not arbitrary trace browsing. Graph returns only edges whose both endpoints are returned authorized nodes; counts are returned-window counts only. Recheck lifecycle before return; current permission rechecked by scoped transaction. Same source may have multiple authorized semantic provenance edges. No synthetic graph nodes/relationships, no new cross-workspace grant.

Forward migration010 supplies invoker-security projection, narrow scoped provenance helper and append-only minimal read audit (operation/window count/history; never query/content/cursor/foreign selectors). Service retrieval.ts, retrieval-api.ts; extend existing native/text search seam for semantic history only. Broad approved|all/fresh trace federation belongs5.3. Real signed HTTP and restricted DB tests must cover second-agent reuse, current/history contradiction, signed pagination tampering and identity/scope binding, graph endpoint confidentiality, revoked authority, lifecycle and read audit. No UI/browser claim until owning epic.

## Local acceptance — 2026-10-26

`bun run check:all` exit0:94 tests/723 assertions; restricted PostgreSQL76/587, zero fail/skip/missing required tests; TypeScript and ESLint pass. Log: Operations/direct-build-20261026/admission5-retrieval-accepted.log. Expected TDD reds: retrieval-red (missing implementation) and history-label-red (historical search omitted lifecycle/version); fixed without altering immutable content. Native model/vector tests remain required and green.

Six retrieval DB cases cover current/history contradictions, full get and bounded live list, signed cursor tamper/expiry/principal/scope/filter binding, graph lineage with both visible endpoints, separately entitled raw evidence, immutable content-free audit, two authorized workspaces and a second tenant with the SAME workspace UUID, foreign IDs and cross-scope relationship FK denial. Actual signed human HTTP and a separately credentialed second service principal through another gateway instance discover/reuse the exact current record; current credential shrink then denies. This is local HTTP consumer evidence, not a deployed agent integration claim. Gateway extra-action regression proves losing evidence:read while retaining memory:read suppresses raw graph output. No independent development review was used.

Graph snippets max256 characters; up to40 semantic nodes and20 provenance links/unique evidence nodes, with truncation and exact returned-window counts. Search history includes lifecycle/version and refreshes lifecycle after asynchronous work. Default search still excludes superseded/deprecated. Explicit history remains approved semantic content, not pending/raw by implication. Current SQL-derived graph is not a browser graph UI. No deployment or whole-product completion.
