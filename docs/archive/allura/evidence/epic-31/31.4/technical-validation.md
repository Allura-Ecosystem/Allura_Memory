# Story 31.4 technical validation receipt

**Frozen code candidate:** `1bed5b08cf755f837c747e640f4b3570eb9d95cc`  
**Candidate tree:** `be52bef367bb6edf228612df41599e7cf170026e`  
**Candidate parent:** `2522907eae9fb342a84148fa4ac83816af57ed6f`  
**Executed:** 2026-10-12 EDT / 2026-10-13 UTC  
**Executor:** Woz persona on the Codex desktop runtime

The candidate is an unreferenced local Git commit object created with a temporary index. Creating it did not move the branch, alter the working index, push, merge, or deploy. It exists so every specialist can review the same immutable code/test tree while evidence documents remain editable.

## Executed gates

| Gate | Result | Durable evidence / limitation |
| --- | --- | --- |
| Focused Knowledge Map regression | PASS | Exact-candidate independent lanes passed: Pike 157/157, Fowler 76/76, and Hightower 84/84. Coverage includes failed-continuation retention, filtered/error focus overview return, focus retry restoration, bounded recursive work, fail-closed depth-two complexity, correlated failure reporting, filter/inspector parity, accessible names, responsive behavior, and active-route state. |
| TypeScript | PASS | `bun run typecheck`, the repository `bun run lint` alias, and `bun run --cwd packages/sdk typecheck` passed. Pike and Hightower also passed clean/exported exact-candidate checks with the repository's package-local SDK dependency layout. |
| Formatting and candidate range | PASS | `git diff --check` passed for the exact candidate range; all three final independent reviewers repeated the check. |
| Token and authority scan | PASS: 3/3 | `bun run validate:tokens`; raw-color, deprecated-token, and Knowledge Map storage/legacy-import scans passed. Frozen exclusions are now SHA-256 pinned and fail open into the normal scan after any edit. |
| Full unit regression | PASS: 203 files, 3,097 passed, 165 skipped | Final-candidate `bun run test:unit`; the unrestricted local lane was required because the restricted sandbox denies child processes and loopback binds. |
| Production build | PASS: 55 generated pages; `/dashboard/graph` emitted as a dynamic route | Final-candidate `bun run build`. |
| Disposable live PostgreSQL lane | PASS: 52/52 suites; 154 passed, 3 skipped, 0 failed; historical upgrade 2/2 suites and 3/3 tests | [`live-db-tests.json`](receipts/live-db-tests.json) and [`historical-upgrade-tests.json`](receipts/historical-upgrade-tests.json). Includes scope-first plan proof and a 1,000-edge focus that fails closed under the five-second statement guard rather than issuing a lossy depth-two continuation. The recorded pass used an explicitly named disposable database and automatic cleanup. |
| Real-browser Knowledge Map lane | PASS: 8/8 | [`browser-receipt.json`](receipts/browser-receipt.json) plus four hashed captures. Includes real API/DOM identity correlation, focus restoration, lineage, filter parity, Space relationship navigation, 199-node near-budget fit/text access, responsive overflow checks, and reduced motion. |
| Operator-assisted live walkthrough | PASS (technical only) | [`operator-assisted-walkthrough-final.json`](receipts/operator-assisted-walkthrough-final.json). Against the byte-verified exact-candidate worktree and governed PostgreSQL scope, accessibility-tree observation verified real map/text parity, focus expansion, inspector provenance/evidence/version/lineage, Back to overview, and relationship-filter parity. Responsive automation covers zero-overflow reflow; owner-controlled zoom and screen-reader judgment remain GRAPH-32. |
| Controlled truth-state presentation gallery | PASS (presentation only) | [`truth-state-gallery.md`](truth-state-gallery.md) and its hashed [`receipt.json`](captures/truth-states/receipt.json). Ten schema-validated controlled responses were rendered by the exact production component for empty, partial, degraded, denied/login, access-denied, conflict, unavailable, stale, evidence-absent, and evidence-unavailable presentations. This is not authority, live-data, or human-acceptance evidence. |
| Story status guard / whitespace | Story 31.4 claim is truthful; repository-wide guard remains red on 79 pre-existing Story 18–28 evidence violations. `git diff --check` passes. | The guard output contains no Story 31.4 violation. Unrelated historical records were not rewritten as part of this story. |

## Browser artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `captures/knowledge-map-1440.png` | `f04c20de2aafb427f5c26246df69bd7b6302834e54f3e20642071f9e7cbdf187` |
| `captures/knowledge-map-900.png` | `34f2439ec086b01d824b8347ee98d5b4987b6312626d5463232326c727b4fae6` |
| `captures/knowledge-map-640.png` | `3a7243a63f3b14ed95c014fbbf6b943c3070d80f1a2b35caf183fd9832a77e95` |
| `captures/knowledge-map-320-200-percent-equivalent.png` | `f8d6998d7406f21b91ec448e27339bb85511a707b1e3bc6c383f9b09d00d1b35` |
| `receipts/browser-receipt.json` | `7df767989f5c889592011be42cd728a61efe590a950d32f590bc516c5572e24e` |
| `receipts/live-db-tests.json` | `8672c3e2363e125d8c672f0f28be3ae496a551ea0349dd672c56cb906dc022b1` |
| `receipts/historical-upgrade-tests.json` | `f14f14d5d9ad1cff357b78a394ac30ec843d4b4080c8d74bd4531621a3084fe2` |
| `receipts/operator-assisted-walkthrough-final.json` | `d44a6062c9c81511d72a26b95d2f87b5a5ab48cc97ea811ea0ad5eed9dfc57ba` |
| `captures/truth-states/receipt.json` | `361a947b9ee0a48c21e2472c0915507567215009b5dc28034b7b21ce6426ce0a` |
| `truth-state-gallery.md` | `c3ffb2dc77b3e74392068bf053c751e0de011fd293d1311049980798552f0953` |

## Limits

- Automated 320 CSS-pixel reflow is equivalent to a 640 CSS-pixel layout at 200% zoom, but it is not evidence that the owner used an actual browser zoom control. Actual 200% zoom remains in the owner walkthrough.
- The operator-assisted live walkthrough used the actual Chromium zoom shortcut and produced technical visual/AX evidence, but an agent cannot attest to the owner's perception, screen-reader experience, or acceptance decision. GRAPH-32 therefore remains open.
- Playwright proves keyboard behavior and accessible names in Chromium. It does not substitute for an owner screen-reader exercise.
- Local loopback and disposable-database success is not deployment evidence and does not authorize production deployment.
- The retained local PostgreSQL database was not mutated by the passing lane; the disposable database was dropped by the command trap.
- A focus graph whose depth-one frontier cannot be retained within the bounded depth-two continuation model returns observable `UNAVAILABLE`; no lossy continuation is issued.
- The clean-export SDK diagnostic fails only when package-local Zod 3 is omitted and root Zod 4 is substituted. A normal locked workspace install and the canonical SDK typecheck use Zod 3.25.76 and pass.
