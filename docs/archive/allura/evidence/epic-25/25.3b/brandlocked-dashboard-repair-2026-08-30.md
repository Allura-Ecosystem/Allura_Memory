# Brandlocked curator dashboard corrective evidence — 2026-08-30

**Candidate status:** implemented and locally verified; pending PR current-SHA CI and independent acceptance.

## Failure corrected

The accepted module-registry shell did not implement the approved Epic 25 command-center composition. It exposed a minimal module summary but omitted the governed review queue, evidence path, human-decision controls, and receipt contract shown by the approved brandlocked design authority.

The planning failure was a traceability failure: the story verified the server-owned registry boundary and truthful shell states, but its completion evidence did not include an executable visual/interaction acceptance test for the approved operator workflow.

## Corrective implementation

- `src/components/curator/curator-dashboard.tsx` composes the authenticated shell and the real curator proposal read contract.
- `src/components/curator/decision-dialog.tsx` requires human rationale and provides modal focus containment.
- `src/components/curator/curator-actions.ts` calls the existing governed decision API and validates the returned receipt.
- `src/components/curator/types.ts` validates queue, evidence, proposal, and receipt payloads at the client boundary.
- `src/app/globals.css` implements the responsive brandlocked composition using canonical Allura tokens.
- `src/app/layout.tsx` acknowledges the expected pre-paint theme attribute at hydration.

## Verification record

```text
bun vitest run --config vitest.config.unit.ts \
  src/__tests__/curator-handoff-page.test.tsx \
  src/__tests__/curator-dashboard.test.tsx

10 tests passed
```

The focused suite proves approved shell landmarks, evidence-before-action ordering, server-scoped queue loading, viewer denial, rationale enforcement, server-receipt-only success, truthful API failure, bounded request timeout, and keyboard tab navigation.

Additional completed checks:

- `bun run typecheck`
- `bun run validate:tokens`
- changed-file ESLint
- full unit lane: 150 files passed, 6 skipped; 2,531 tests passed, 160 skipped; zero failures
- production build (`bun run build`)
- live browser inspection at 320, 768, 1024, 1440, and 1920 pixels with no document overflow
- fresh hydrated browser load with no console warnings/errors

The repository-wide ESLint command remains red on 943 pre-existing findings (94 errors and 849 warnings); changed-file ESLint for this repair passes.

## Truthfulness boundary

Local PostgreSQL credentials were not supplied to the development server. The live route therefore proved its explicit unavailable behavior, not a live approval mutation. PR current-SHA CI and an environment with database credentials remain required before deployment acceptance.
