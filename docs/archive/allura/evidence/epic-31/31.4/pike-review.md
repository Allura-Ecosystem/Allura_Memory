# GRAPH-33 Pike interaction and simplicity review (superseded)

> Historical review of candidate `d069b972cdae797748af7b7bf6f15d4740a5ac13`. The final exact-candidate verdict is [`pike-review-final.md`](pike-review-final.md).

**Reviewer:** Pike persona on the Codex desktop runtime  
**Final verdict:** APPROVE  
**Candidate:** `d069b972cdae797748af7b7bf6f15d4740a5ac13`  
**Tree:** `6a4a003a3b2f3f89d6b7d1c96dd79232235c697d`  
**Parent:** `2522907eae9fb342a84148fa4ac83816af57ed6f`  
**Reviewed:** 2026-10-12 EDT

Pike's initial review requested changes for relationship-filter leakage into inspector projections, implicit focused-map replacement without a direct overview return, weak near-budget fit behavior, incomplete relationship accessible names, and absent current-navigation semantics. A first re-review found one remaining high-severity focus-failure recovery path. The exact final candidate resolves every blocker.

## Final disposition

- Error and degraded focus states expose **Back to overview** from the saved graph; Retry is not the only exit.
- Successful focus retry restores the requested selection and inspector, while an unavailable focus can return directly to the exact cached overview.
- Filtering out the selected node clears the hidden selection while retaining a reachable saved-overview action.
- Inspector relationship filters govern Directed context, Lineage, and technical relationship keys consistently.
- Relationship controls expose complete source–relationship–target accessible names and native button behavior.
- Near-budget fit permits `minZoom: 0.05`; the same authorized arrays remain completely accessible through the text representation.
- Dashboard navigation has typed active routes, `aria-current="page"`, and a non-color-only current style.
- The bounded backend repair adds no authority selector, browser request mode, query parameter, or response variant.
- A depth-2 page ending at a truncated depth-1 frontier fails closed instead of issuing a continuation that could silently omit descendants.
- Handled read/route failures receive correlated, sanitized reporting without exposing secret error detail.

## Exact-candidate verification

- Focused Vitest: 76/76 passed across six files.
- Graph-authority Vitest: 18/18 passed.
- Focused ESLint: passed.
- Root `bun run typecheck`: passed.
- SDK `bun run --cwd packages/sdk typecheck`: passed.
- Token and authority-boundary validation: 3/3 passed.
- Candidate-range `git diff --check`: passed.
- Candidate commit and tree identities matched independently.

## Clean-export TypeScript discrepancy

Pike's earlier clean-export run reported three Zod record-arity errors in `packages/sdk/src/lanes.ts`. The export omitted `packages/sdk/node_modules`, so SDK sources resolved the root Zod 4.3.6 installation instead of the SDK package-local Zod 3.25.76 installation. The discrepancy was reproduced in the same symlink-only layout. When the installed workspace dependency layout is represented correctly, both canonical typecheck commands above pass. Pike therefore classified the earlier failure as an export-layout artifact, not a candidate defect.

Pike did not execute the live-database lane because its review environment lacked `POSTGRES_PASSWORD`, nor the browser suite, production build, manual visual comparison, actual 200% browser zoom, screen-reader review, or human acceptance. Those lanes are evidenced separately where applicable. This approval is GRAPH-33 only and does not establish GRAPH-32, GRAPH-36, or release approval.
