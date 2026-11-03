---
title: '9.1 Bind retained operator design and executable UI contract'
type: feature
created: 2026-10-27
status: done
route: dispatch
baseline_commit: 103f5206a460b74bc88b1677c3dc457c8375f979
---
# Intent / authority

DOC-02 exact local reference is now selected under Sabir's explicit delegation to resolve ordinary design details from retained requirements, NOT a claim of a new human screenshot approval or Durham review. Actual human/visual release acceptance remains9.4. The versioned manifest `dashboard-design-reference.json` pins exact existing bytes; tests fail on drift, never auto-refresh hashes. Retained files stay unchanged. The modern portfolio shell/source and memory/list/graph screenshots supply composition; operator contract supplies evidence/authority/receipt ordering. Reviewed both desktop screenshot pixels and source. Older exported HTML is historical, not the runtime; its Neo4j, fake totals/people, demo switches and gradients must NOT return.

## Bound design decisions (DOC-02, ENT-01–05)

- Preserve the unchanged square official AL lettermark, Cream-dominant canvas/paper, Ink text, restrained Blue links/actions, Orange selection with Ink outline AND Selected text; no glow/gradients/shadows. Use current palette in PREVIEW-SCOPE (#F7F3EE,#0F1720,#0D47A1,#148A4B,#FF4D1F) rather than older export alternatives. Plex Sans body/headings and Plex Mono technical labels, actual local packaged fonts; no unavailable Aeonik promise. Four-pixel rhythm;44px named controls; retained rounded shapes.
- Desktop sidebar (~248px), scope/current identity above content, memory list/canvas and inspector in61.8/38.2 split; tablet/phone stack in reading order, collapse navigation, default graph List at narrow widths. No clipping or scaling graph touch targets to illegibility. Keep search, source/provenance, current versus history and bounded/truncated data visible. Source content is text, never HTML. No synthetic data in runtime.
- Navigation in `dashboard-contract.ts`: Home, Company Knowledge, Memory Map, Review changes, Security & Trust, Audit & Operations, Administration, Devices & agents, Search settings. `/dashboard/search` is alias only. No clickable404s. Work Board/Runs/Resources/Agents telemetry, commerce, contacts, people-graph and Ask remain unavailable/unadopted; portfolio navigation does not adopt those backends. Graph is real persisted semantic/evidence relationships, not count cards or a template picture.
- Service authority remains1/2/8: signed Cloudflare human assertion or HttpOnly CF cookie; no Clerk, role dropdown, localStorage token, browser-minted grant, org-admin content bypass or silent default workspace. The deployed identity provider is not configured by this story. Scope selectors are routing intent only. Resolve role/actions from server CURRENT grants; stale capabilities never authorize writes. Clear content on scope change/401/403 and abort/discard late old-scope replies. Confidential HR cannot become visible merely from organization administration.
- ENT-03 device/admin content: use8.2 human device commands and current action gates; SDK handles credential storage, browser never gets machine token/verifier or invents connected/last-seen. Search settings show actual health/index result or unknown, never fictional dimensions/compliance. ENT-04 expiry/revocation/malformed signatures exercised with signed local identities; live MFA/provider policy remains release evidence. ENT-05 actual responsive/accessibility/browser required, not source-only signoff.
- DOC-08 uses existing3.3 service admission/evidence binding; no agent self-promotion. Review is source→proposal exact version→linked evidence→allowed independent human decision+rationale→server receipt. Request evidence leaves pending, rejection terminal, correction creates version; stale409 writes nothing, successful replay keeps original receipt. Base UI AlertDialog for consequential confirmations, trap/restore focus. No new generic component library/template.

## Surface/service mapping for9.2 (not a claim routes are implemented)

| Surface | Authoritative read / write | Specific outcome rules |
|---|---|---|
| Home / shell | New scoped human `/api/dashboard/context` read using current DatabaseStore and authority; bounded memory list | No fake health/queue totals. Show actual fetched time and scope; scope/action snapshot is presentation only |
| Company Knowledge / inspector | `/api/memory/list`, `/search`, `/get`, `/history`; capture remains existing machine/device MCP memory_add, NOT human MCP; `/api/review/submit` and `/correction` | Exact existing payloads;20-row cursor pages, history explicit; lexical fallback degraded; source/receipt detail, no fabricated title/owner. Human UI links capture guidance rather than minting machine authority; proposals use currently authorized evidence |
| Review changes | New bounded scoped pending-proposal read over existing RLS; `/api/review/proposal`, `/evidence`, `/decision` | review:read; independent human review:approve entitlement, rationale, expected version and server-issued receipt; same-operation retry only after explicit reconciliation |
| Memory Map | `/api/memory/graph` persisted semantic_edges/authorized graph_evidence |40 semantic nodes, at most20 evidence, depth0–2, relationship filter/selection/inspector/pan/zoom/fit and equivalent text/list. Distance is layout, never similarity; truncation explicit |
| Security & Trust | Existing immutable code policy/action description plus server scope/actions | No editable security toggles, no false compliance status; content grants not inferred from org role |
| Audit & Operations | `/api/operations` audit:read, `/api/health` health:read; narrow scoped receipt listing if needed | Existing operations read accepts only limit; filter visible returned observations locally and label that bound, never imply whole-database date search. Export only authorized returned fields, explicit truncation/freshness; browser download not remote publication |
| Administration | Same current context and `/api/access` exact accepted commands where implemented | No global administration from workspace grant; allowed fields prevalidated by service; no implicit privileges |
| Devices & agents | `/api/devices/command` list/status/approve/revoke | Human+explicit workspace admin approval, no raw secret in UI or audit; connected/last-seen unknown if not observed |
| Search settings | `/api/health`, explicit `/api/index/drain` bounded one-job command | Actual model/source/index evidence; queued != searchable; no unseen vectors or inferred health |

All surfaces implement loading, empty, denied, conflict, degraded, unknown, success, unavailable, stale, not_found and invalid as applicable. Transport202/timeout/service error is UNKNOWN, not success/rollback. On mutation ambiguity retain exact non-secret operation identity and ask for explicit retry/read-back, never blind repeat. `dashboard-contract.ts` freezes routes/states/limits and rejects malformed focus, fractional IDs, duplicate query parameters, role/scope injection and unknown routes before screen access; rendered containment remains9.2/9.4 work.

## Task-based human protocol for9.4

Before release, Brooks binds tested full SHA/archives, approved isolated target, exact source manifest and screenshots at1440/820/390px; Sabir supplies authorized independent participants, not invented signoff. Ask participants (without coaching) to: (1) identify active workspace/role and find approved guidance/source; (2) distinguish current and superseded memory; (3) follow one real relationship with graph and keyboard/List and explain why position is not similarity; (4) submit evidence/proposal then different entitled human requests evidence/reviews exact version/approves or rejects with rationale; (5) observe stale409, forbidden HR and revocation clearing content; (6) inspect receipt/audit/actual health/device scope; (7) recover navigation after malformed URL and unknown result without duplicate writes. Record consented task result, errors, confusion/manual steps, keyboard focus/name/contrast, exact viewport/revision, data origin and observed timestamps. Do not record secrets or confidential content in screenshots. No invented participant counts, timings or usability improvement. Retest failures on exact corrected revision. UI/browser self-tests are separate from actual humans. Release rollback must preserve canonical evidence/history.

## Acceptance / evidence

- [x] Exact retained asset/source/screenshot hashes, choices and exclusions pinned. Ten source hashes checked, not regenerated.
- [x] Executable immutable route/state/limit/strict-navigation contract with red-first negative cases.
- [x] Every approved9 surface mapped to current services or explicit narrow missing transport; security/role/confidentiality remain server-owned.
- [x] Actual human/visual protocol defined, not performed or falsely signed off;9.4 stays open.
- [x] Required discovery, full tests/typecheck/lint and direct self-check before owned local9.1 commit/9.2.

Operations `admission17-dashboard-contract-red.log`: test intentionally failed before module existed. This is9.1 contract work, not a working dashboard or whole-product acceptance.6.5/Epic6 deployment-only gates remain open; optional7/deferred12–14 excluded. Native Brooks/Woz guidance and actual build route in this admission apply.

Final `admission17-design-full2.log`: `bun run check:all` exit0 at2026-10-27T15:18:53-04:00,175tests/1593assertions (unit47/484, restricted PostgreSQL128/1109). First full attempt passed87 new assertions then caught tuple matcher typing; explicit readonly literal tuple fixed it, not a weakened test. No browser/UI implementation claimed by this contract gate. Before acceptance, self-check corrected two route names and capture function/tool names against actual exports (`/api/access`, `capture`, `memory_add`); the route table labels missing transport explicitly.

9.2 dependency trace correction: `capture.ts:46` deliberately forbids human identity even though human MCP advertises the tool. Preserve that boundary, correct the mapping above, and do not add an accidentally nonfunctional/privilege-bypassing human capture route. Operator capture is through the paired device/agent; the UI reviews authorized captured evidence. This is a mapping correction, not new authority.
