# RuVix Dashboard Gate

> **Applies to:** New Allura Dreaming dashboard at `localhost:3100/dashboard`  
> **Reference:** `http://localhost:6420`  
> **Decision:** Fail closed. If evidence is missing, the build is not ready.

## Hard Rule

The new dashboard must follow the `localhost:6420` reference direction and must not rebuild, preserve, remix, or cosmetically patch the old wiped dashboard.

RuVix rejects any dashboard build that resembles or imports the old dashboard.

## Required Pass Conditions

RuVix passes the dashboard only if all conditions are true:

1. `localhost:3100/dashboard` opens in browser without build/runtime overlay.
2. Browser screenshot of `localhost:6420` is captured.
3. Browser screenshot of `localhost:3100/dashboard` is captured.
4. Visual comparison confirms the new dashboard follows the 6420 direction.
5. Forbidden import/string check returns zero matches in the new dashboard implementation.
6. TypeScript/test verification passes.
7. Glaser review passes visual direction.
8. Munari review passes usability and accessibility.
9. Captain approves the browser result.

## Forbidden Imports

The new dashboard implementation must not import:

```text
@/components/dashboard
./_components/sidebar/app-sidebar
./_components/top-nav-bar
./_components/live-kpis
./_components/health-table
./_components/budget-card
```

## Forbidden Strings and Classes

The new dashboard implementation must not contain:

```text
Allura Memory
Dashboard — Allura Memory
lettermark-AL.png
wordmark.png
agency-card
metric-card
OverviewSkeleton
SystemStatusCard
InsightCard
EvidenceCard
```

## Forbidden Product Patterns

RuVix rejects the build if any of these are true:

1. It uses the old dashboard shell/nav/logo lockup.
2. It visually resembles the old wiped dashboard.
3. It uses health/system status as the main hero.
4. It hides provenance.
5. It claims live/healthy/done without proof.
6. It has no browser screenshot.
7. It has no comparison to `localhost:6420`.
8. It uses Docker logs as proof of visual correctness.
9. It bypasses approval/audit rules.
10. It imports old dashboard UI.

## Allowed Reuse

The implementation may reuse backend/data contracts only:

- memory APIs
- curator approve/reject APIs
- health APIs if placed secondary
- data types/schemas where useful
- auth/tenant/group scope helpers

Allowed reuse does not include old UI components, old shell, old navigation, old logo lockup, or old dashboard page structure.

## Required Visual Traits

The new dashboard must show these traits from `localhost:6420`:

- warm cream workspace background
- white working surfaces
- charcoal text
- orange primary action
- green approval action
- search-first hierarchy
- recent memories visible
- approval queue visible
- memory detail/provenance visible
- recent activity visible
- workflow-oriented navigation

## Browser Proof Rule

Docker logs may be used for runtime debugging only.

Docker logs do not prove visual correctness.

Valid visual evidence requires:

1. browser at `localhost:6420`
2. browser at `localhost:3100/dashboard`
3. screenshots or equivalent visual artifact
4. human comparison notes
5. Captain approval

## Forbidden Check Command

Run an equivalent check against the new dashboard implementation:

```bash
grep -R "@/components/dashboard\|lettermark-AL\|wordmark\|agency-card\|metric-card\|Allura Memory\|Dashboard — Allura Memory\|OverviewSkeleton\|SystemStatusCard\|InsightCard\|EvidenceCard" src/app/\(main\)/dashboard
```

Expected result for new dashboard files: no matches.

If legacy files under the dashboard route still exist for archaeology, the check must be scoped to the new isolated implementation folder and the route entry file. Legacy files cannot be imported by the new dashboard route.

## RuVix Decision Format

Every review returns one of:

- `PASS`
- `FAIL_OLD_DASHBOARD_DRIFT`
- `FAIL_MISSING_BROWSER_PROOF`
- `FAIL_FORBIDDEN_IMPORT`
- `FAIL_VISUAL_MISMATCH_6420`
- `FAIL_GOVERNANCE_GAP`
- `NEEDS_CAPTAIN_REVIEW`

Review note format:

```text
RuVix Dashboard Gate:
Decision: <PASS|FAIL|NEEDS_CAPTAIN_REVIEW>
Reference checked: localhost:6420 <yes/no>
Target checked: localhost:3100/dashboard <yes/no>
Forbidden import check: <pass/fail>
Visual match to 6420: <pass/fail>
Evidence: <screenshot paths / test output>
Reviewer: <agent/person>
Reason: <summary>
```

## Team Durham Gate

RuVix requires Team Durham review before final dashboard approval:

| Reviewer | Gate |
| --- | --- |
| Kotler | Product goal and scope boundary |
| Glaser | Visual match to `6420` |
| Tufte | Information hierarchy and evidence clarity |
| Munari | UX/accessibility/quality |
| Scout | Forbidden import/file recon |
| Captain | Final browser approval |

No dashboard build is Done until RuVix and Captain both pass it.
