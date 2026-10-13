# Epic 31 Knowledge Map acceptance ledger

**Current frozen code candidate:** `3fb8a4ec3ec9068ce910a1f6990b58a80241e582`  
**Current candidate tree:** `11f42d59800c985a101a8a857a6e40c440ca4f10`  
**Previous rejected candidate:** `1bed5b08cf755f837c747e640f4b3570eb9d95cc` / `be52bef367bb6edf228612df41599e7cf170026e`  
**Ledger status:** COMPLETE — OWNER ACCEPTED; RELEASE PROGRESSION APPROVED  
**Last reconciled:** 2026-10-13 EDT after explicit owner `APPROVE`

This ledger is the acceptance source of truth for GRAPH-01..GRAPH-36. `PASS` means the row has non-source-only executable evidence. `NOT VERIFIED` is intentional and blocking. An artifact may support several rows, but the row-specific proof and limitation remain explicit.

| ID | Requirement | Implementation reference | Validation and durable artifact | Limitation | Verdict |
| --- | --- | --- | --- | --- | --- |
| GRAPH-01 | Visible real nodes | `src/components/dashboard/knowledge-map/knowledge-map-canvas.tsx`; `knowledge-map-workspace.tsx` | Browser receipt `REAL_DATA_CORRELATION`; live DB GRAPH-01 test; 1440 capture | Local seeded governed scope only | PASS |
| GRAPH-02 | Visible real edges | Canvas/workspace same-array projection | Browser API/DOM edge equality; live DB GRAPH-02; 1440 capture | Local seeded governed scope only | PASS |
| GRAPH-03 | Relationship labels | Canvas edge labels and full-name text controls | Browser real labels plus Space navigation; live DB GRAPH-03 | Canvas labels may require zoom at large scale; text names remain complete | PASS |
| GRAPH-04 | Node selection | Workspace `selectNode`, inspector focus, canvas/text openers | Browser canvas and text selection with focus return; targeted UI tests | Pointer/keyboard Chromium only; owner screen reader pending | PASS |
| GRAPH-05 | Pan/zoom/fit controls | React Flow controls/minimap, min zoom `0.05` | Browser control interaction and 199-node near-budget fit test | Fit is topology overview; zoom/text view provides readable detail | PASS |
| GRAPH-06 | Filters | `filterGraph`; visible-edge inspector projection | Targeted regression hides relationship from canvas, text, Directed context, Lineage, and keys; browser filter test | Client view only; does not query or count foreign scope | PASS |
| GRAPH-07 | Relationship navigation | Full directed-name text button; inspector connected-node controls | Browser Space navigation validates focused target; targeted accessible-name test | Owner screen-reader pronunciation pending | PASS |
| GRAPH-08 | Memory/content inspection | Focus query plus inspector content/summary | Live DB GRAPH-08 identity proof; browser authoritative inspector | Only allowlisted authorized content is shown | PASS |
| GRAPH-09 | Provenance/source visible | Inspector provenance and technical source | Live DB GRAPH-09 plus browser inspector and targeted component proof | Unavailable derivation detail remains explicit | PASS |
| GRAPH-10 | Supporting evidence visible | Evidence discriminant and references | Live DB GRAPH-10 plus browser/component available evidence | Test fixtures supplement live receipt; no cross-scope content | PASS |
| GRAPH-11 | Relationship context | Directed context, lineage, same-data text | Live DB GRAPH-11; browser lineage; filter parity regression | Limited to admitted page/inspection relationships | PASS |
| GRAPH-12 | Tenant/workspace real data | Server principal, restricted transaction, RLS | Disposable live DB GRAPH-12; real browser seeded membership | Local PostgreSQL only, not deployment proof | PASS |
| GRAPH-13 | Forged scope denied before query | Route strict query parser and service guard | Route adversarial tests plus live revoked-authority proof in the full unit/live receipts | Browser harness uses a valid principal | PASS |
| GRAPH-14 | Cross-tenant/workspace isolation | Forced RLS and tenant/workspace-qualified reads | Disposable live DB GRAPH-14 zero-leak proof | One disposable local server version | PASS |
| GRAPH-15 | Loading state | Initial null response and focus pending state | Targeted component transition tests plus real browser network-backed loading path | No standalone loading screenshot | PASS |
| GRAPH-16 | Empty state | Healthy complete-zero response branch | Contract tests + component state semantics + live empty-scope database case in live report + controlled exact-component gallery capture | Owner review remains GRAPH-32 | PASS |
| GRAPH-17 | Unauthorized/login state | Page guard, API denied contract, login action | Auth/page-guard regression in full unit receipt plus controlled exact-component login capture | Controlled capture is presentation proof, not an unauthenticated live-authority event | PASS |
| GRAPH-18 | Forbidden role state | Relational role/membership check and request-access state | Disposable live revoked/insufficient authority proof plus non-leaking UI state test and controlled access-denied capture | Live browser harness uses viewer membership; controlled capture is presentation only | PASS |
| GRAPH-19 | Partial/continuation state | Signed continuations; stable append; retry intent `{query,purpose}` | Live 450-edge exhaustion; failed-continuation retry-retains-page regression; continuation browser/client tests; controlled 200-node partial capture | Snapshot change intentionally requires restart; unsafe depth-two truncation fails closed | PASS |
| GRAPH-20 | Degraded state | Explicit non-equivalent fallback contract/state | Live ambiguous-endpoint degradation, component semantic state, and controlled exact-component degraded capture | No production failure injection | PASS |
| GRAPH-21 | Error/conflict state | Sanitized error and restart states | Live revision-conflict proof; route/component sanitized-state tests; controlled conflict and unavailable captures | No backend detail shown by design | PASS |
| GRAPH-22 | Evidence unavailable | Three-state evidence contract and inspector copy | Targeted available/absent/unavailable regression, live evidence reference proof, and controlled absent/unavailable inspector captures | Evidence backend outage is controlled at the UI boundary | PASS |
| GRAPH-23 | Equivalent text relationship view | Canvas/text use `visible.nodes` and `visible.edges` | Browser exact DOM/API parity and filter parity; near-budget 199-node text access | Text relationship list may be long at the safety ceiling | PASS |
| GRAPH-24 | Keyboard navigation and focus | Enter/native button, explicit Space node handler, inspector focus/return | Browser canvas/text selection, Space relationship navigation, reduced motion | Owner screen-reader exercise remains GRAPH-32 | PASS |
| GRAPH-25 | Deterministic budgets/order | Contract/read repository/keyset ordering; bounded recursive expansion and timeout | Live repeat/cap/keyset tests; 1,000-edge high-degree fail-closed proof; contract suite in unit receipt | Safety ceilings are not scale claims; sufficiently complex depth-two focus returns `UNAVAILABLE` | PASS |
| GRAPH-26 | Isolated authorized nodes | Repository overview root admission | Live isolated-root and closure proof | Only authorized roots appear | PASS |
| GRAPH-27 | Version/SUPERSEDES context | Version fields, lineage, newer-to-superseded edge | Live GRAPH-27 plus browser lineage inspector | No inferred version when storage data is absent | PASS |
| GRAPH-28 | No mocks/placeholders in live states | Real API only; fixtures confined to tests | Token/import/source scan plus real browser ID correlation and live degraded proof | Test fixtures exist only under test paths | PASS |
| GRAPH-29 | Design fidelity | Protected Allura shell plus owner-directed compact connected knowledge-brain nodes; full governed record card appears only in the inspector after selection | Fresh 1440 capture; `glaser-review-knowledge-brain-20261013.md`; `munari-review-knowledge-brain-20261013.md`; verifier `COMPACT_BRAIN_NODES` and inspector-reveal checks | The owner explicitly superseded only the prototype's full-card node anatomy; shell, tokens, hierarchy, rail, canvas, and inspector remain authoritative | PASS |
| GRAPH-30 | Responsive behavior | Repaired shell and Graph preserve hierarchy at 1440/900/640/320 and 200%-equivalent width, with slide-over inspector at 900 and in-flow inspector at 640/320 | Eight hashed captures; responsive receipt checks; fresh Glaser/Munari/Pike review; near-budget Playwright exercise | Sparse graphs intentionally suppress the minimap; narrow canvas hides edge labels while the complete same-data text representation remains available | PASS |
| GRAPH-31 | Approved-mode variance | One Knowledge Map; unsupported modes absent | Approved proposal condition + unit absence assertions + Pike review | Security Path and Methodology/Catalog remain deferred | PASS |
| GRAPH-32 | Human interactive exercise | `owner-walkthrough.md` | Owner inspected the repaired live compact-brain candidate and responded `APPROVE` after the remaining human gates were stated | Individual gestures and a manual screen-reader session were not separately attested; automated evidence and this residual were disclosed and accepted | PASS |
| GRAPH-33 | Pike independent gate | `pike-review-knowledge-brain-20261013.md` | PASS on the compact-brain candidate: 49/49 targeted workspace/authority tests, interaction and responsive evidence, no authority expansion | Does not substitute for human gates | PASS |
| GRAPH-34 | Fowler independent gate | `fowler-review-final.md` | APPROVE on exact candidate and tree; focused 76/76, cold typecheck, token, diff, and receipt checks pass | Non-blocking controller, generated-file, and SQL-expression debt retained | PASS |
| GRAPH-35 | Hightower independent gate | `hightower-review-knowledge-brain-20261013.md` | PASS on the compact-brain candidate: TypeScript, 84/84 focused tests, production build, all eight hashes, unchanged auth/data boundaries | High-complexity depth-two focus intentionally fails closed; local proof is not deployment proof | PASS |
| GRAPH-36 | Human release-progression decision | `owner-release-decision.md` | Owner responded `APPROVE` in direct response to the statement that GRAPH-32 and GRAPH-36 were the only remaining gates | Authorizes progression/closure; no merge, push, or deployment was requested or performed | PASS |

## Gate interpretation

- Epic 31 may close because GRAPH-01..36 now have passing evidence or an explicit owner-accepted limitation.
- Any final specialist `REQUEST CHANGES` keeps its row open and requires a new candidate plus all affected re-reviews.
- The rejected candidate and its earlier GRAPH-29/30 reviews remain historical evidence only. The current compact-brain candidate is bound to the fresh 2026-10-13 review and capture packet.
- No deployment, merge, push, semantic promotion, or Done transition is authorized by this packet.
