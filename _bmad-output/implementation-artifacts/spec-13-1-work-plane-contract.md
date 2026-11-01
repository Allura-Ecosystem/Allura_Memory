---
title: '13.1 existing-work-plane compatibility contract adoption'
type: 'documentation'
created: '2026-11-01'
story: '13.1'
route: 'dispatch'
artifact_state: frozen-documentation-candidate
design_disposition: adopted-local-engineering-contract
baseline_commit: b6b34d9a10cf0b7985089b896e28afa387306805
retained_main_revision: 8a831884e0f7570c453846cec4c90381a9a22ba4
story_status_mutated: false
live_capability: unverified
operational_status: unknown
context: ['guidelines/ALLURA-BMAD.md', '_bmad-output/implementation-artifacts/epic-13-context.md']
---

# Story13.1 — adopt the existing work plane, not a second engine

## Intent and authority

Publish the precise compatibility-and-hardening contract for the existing Epic13 under the all-14 local amendment. Parent-authorized engineering defaults are adopted in [work-plane-compatibility-v1](../planning-artifacts/contracts/work-plane-compatibility-v1.md); they are not quotations from Sabir or claims of implementation. The product disposition is settled: **Allura PostgreSQL is the sole writable work-status authority; Notion is planning only.** No two-way synchronization, shadow tracker or automatic task closure.

Baseline is clean parent-accepted `b6b34d9a10cf0b7985089b896e28afa387306805`. Epic12 local criteria are [accepted-with-open-items](epic-12-local-retro-2026-11-01.md), including the formerly pending mandatory gateway case; actual6.5/9.4 and hosted/deployed/platform/human acceptance remain open. This writer publishes only the allowed documents, does not close tracked13.1 or any story/epic, and leaves parent acceptance/commit to the parent.

## Accepted inputs and source distinction

- [Current adapter](../../guidelines/ALLURA-BMAD.md), [catalog](../planning-artifacts/epics.md) Stories13.1–13.3, [authority](../planning-artifacts/contracts/authority-v1.md), [persistence](../planning-artifacts/contracts/persistence-v1.md).
- Fresh beta `foundation/src/{core-api,gateway,authority,persistence,run-contract}.ts`: actual source boundaries, not absent legacy runtime guides.
- Retained **read-only** `/home/sabira/Allura_Memory-main` at `8a831884e0f7570c453846cec4c90381a9a22ba4`: exact manager, routes, types, handoff, schema26 and auth anchors in contract §2. No automatic main port or runtime inheritance.
- Historical workspace drafts `allura-epic12-final-local-retro-v2.md`, `allura-epic12-context-reconciliation-v2.md`, `allura-13-1-contract-adoption-packet-v2.md` were read and preserved. Their pending final gate is superseded only by actual later parent evidence, not rewritten.

## Adopted decisions and acceptance trace

| Decision | Adopted contract / acceptance |
|---|---|
| D1 one authority | Allura PostgreSQL only; explicit authority-instance/project/workspace map; no writable Notion or duplicate engine. Unmapped/ambiguous/foreign ownership fails closed. W13-C01/C02. |
| D2 existing concurrency and graph | Preserve exact route names/fields/opaque TEXT IDs, graph and six-digit microsecond `expected_updated_at`; no integer replacement, same-state shortcut or terminal reopen. Strictly monotonic new token. W13-C01/C03. |
| D3 current caller/permission | Authenticated stable human actor, body actor is assertion only; explicit `work:read`/`work:write` entitlements in addition to current base workspace grant, no inherited role/client authority. Exact query/body scope equality; unsupported mappings deny. W13-C02/C04. |
| D4 atomic replay | Explicit opt-in version and operation key; one short service transaction for state, immutable transition event and immutable receipt/accepted response; current-authorized exact replay before stale/terminal rejection. No best-effort success audit or remote wrapper receipts. W13-C03/C04. |
| D5 linked evidence/handoff | Exact same-scope version/receipt references, independent recipient decision, no semantic promotion, automatic run effect or Done inference. First transition slice rejects non-null evidence until supported. W13-C05. |
| D6 honest capability | Retained source exists; beta work API absent; live version/flag/auth/mapping/status unverified and unperformed. Local tests cannot supply external acceptance. W13-C01/C06. |

The contract fixes finite DTO/list/storage limits, error precedence/privacy, immutable receipts, permission lock ordering, current replay disclosure and uncertainty rules. It explicitly records intentional versioned differences rather than claiming drop-in old-client compatibility. Missing product authority is not repaired by local defaults: machine writes, dual authority, changed graph, promotion, or unverified live ownership require separate decisions.

## Observed legacy gaps not inherited

The retained transition route updates state before a best-effort event and uses a later reread to distinguish invalid/stale; create generates a new random ID on every request. Body actor/group selectors are not sufficient current authority. Bare global-ID foreign keys do not prove fresh workspace scope. Handoff pending-only/null return is not exact receipt replay. These are source-level adoption risks, **not demonstrated deployed exploits**; retained middleware/live deployment were not audited.

Fresh beta also has an integration constraint: gateway exact static paths, JSON.parse duplicate-key loss, limited typed replies/error mapping and query-only admission scope. Gateway bytes are pinned by run revision7. The contract records this discovered dependency rather than allowing a hidden gateway edit or a second admission-budget instance. First13.2 is a service/SQL slice; later HTTP compatibility needs its own admitted gateway/pin reconciliation. See [the immediate packet](epic-13-context.md).

## Documentation acceptance and exclusions

This candidate supplies the numbered13.1 specification, exact compatibility contract, source-capability inventory, explicit unresolved external boundaries and single-writer implementation handoff. Publication validation checks frontmatter, relative links, exact retained-source anchors, final parent log hash/counts, allowlist diff and unchanged nonallowed sources/dependencies/index/HEAD. Evidence lives at `/home/sabira/.hermes/profiles/troy/workspace/allura-epic12-close-13-adoption-evidence`.

No runtime tests, DB/migrations, dependency install, source port, credentials, network/MCP, grants, live status, stage/commit/refs or nested agents in this docs pass. No catalog rewrite, missing sprint ledger or old partial-retro edit. Runtime C04–C06 and end-to-end wire acceptance are requirements, not satisfied by this document. This is a frozen candidate for parent review/commit, not self-issued Story13.1 Done.

## Immediate continuation

Admit **one Woz writer** to the bounded13.2 guarded transition/readback packet in [Epic13 context](epic-13-context.md). Begin the named production-behavior RED; do not restart generic planning, reopen Allura-vs-Notion ownership or implement the whole epic. Keep main read-only, old migrations/run bundle/UX immutable, budgets and exact canonical registration intact. Stop precisely if a new implementation dependency exceeds that packet; parent supplies any extension before the writer changes it.
