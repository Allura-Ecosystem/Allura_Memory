# Curator Command Center audit

Date: 2026-08-30
Scope: `/dashboard/curator`
Design authority: approved brandlocked Open Design specimen plus the repository operator-surface contract

## Result

- The route now renders the approved enterprise shell: navigation, authenticated scope header, review queue, evidence path, module registry, receipt contract, and evidence-before-action review layout.
- Queue and decision data come only from the existing curator APIs. No runtime fixture or synthetic success state was introduced.
- Human actions are restricted to curator/admin roles, require rationale, and appear complete only after the server returns a governance receipt.
- Loading, empty, API failure, timeout, unavailable module, decided-without-receipt, and viewer-only states are explicit.

## Automated checks

- Focused acceptance and interaction suite: 10/10 passed.
- TypeScript: passed.
- Design-token compliance: passed with zero warnings.
- Changed-file ESLint: passed.
- Full unit lane: 150 files passed, 6 skipped; 2,531 tests passed, 160 skipped; zero failures.
- Production build: passed; `/dashboard/curator` emitted as a dynamic route.

The repository-wide ESLint script still reports 943 pre-existing findings outside this change (94 errors and 849 warnings). The files touched by this repair are clean.

## Browser checks

The live Next.js route was inspected at 320, 768, 1024, 1440, and 1920 pixels.

- No document-level horizontal overflow at any tested width.
- All four command-center tabs remain reachable.
- Mobile uses a compact identity bar, horizontally scrollable scope/tabs, and a single-column review flow.
- Tablet uses the compact icon rail; desktop restores the full navigation rail.
- Wide desktop expands evidence and human-review panels without stretching the content beyond its governed maximum width.
- With local PostgreSQL credentials intentionally absent, the route rendered a truthful unavailable state and no decision controls.
- The expected pre-paint theme attribute is now acknowledged at the root hydration boundary; a fresh live load produced no console warnings or errors.

## Known environment boundary

The local browser run could not exercise a real approval mutation because the local development process was not given PostgreSQL credentials. The interaction contract is covered with server-response fixtures in the component suite; production success remains server-receipt-only.
